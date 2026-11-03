#!/usr/bin/env node
/**
 * JSON 快照 → Prisma Content 统一入库桥
 *
 * 架构：爬虫输出 JSON 快照（无审核状态，默认可直接展示），
 * 本脚本把四个板块的快照 upsert 进 Content 表（status=PUBLISHED），
 * 前端只从数据库读。爬虫以后可以不在本仓库维护，只要按同一 schema 入库即可。
 *
 * 输入：
 *   - src/lib/fundings-data.json  -> FUNDING
 *   - src/lib/jobs-scraped.json   -> JOB
 *   - src/lib/tools-data.json     -> TOOL
 *   - src/lib/news-data.json      -> UPDATE
 *
 * 幂等：metadata.sourceKey 唯一键；已存在的记录更新内容字段，
 * 不触碰点赞/评论等互动计数，不删除快照里消失的记录（只打印提醒）。
 *
 * 用法：
 *   pnpm import:content            # 全部板块
 *   pnpm import:content -- --dataset fundings --dry-run
 */

import "dotenv/config";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const datasetArg = args.includes("--dataset") ? args[args.indexOf("--dataset") + 1] : null;

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

const BOT_EMAIL = "scraper@infinite-connection.local";
const BOT_NAME = "平台官方";

const PROVINCES = new Set([
  "全国", "北京市", "天津市", "上海市", "重庆市", "河北省", "山西省", "辽宁省", "吉林省",
  "黑龙江省", "江苏省", "浙江省", "安徽省", "福建省", "江西省", "山东省", "河南省",
  "湖北省", "湖南省", "广东省", "海南省", "四川省", "贵州省", "云南省", "陕西省",
  "甘肃省", "青海省", "台湾省", "内蒙古自治区", "广西壮族自治区", "西藏自治区",
  "宁夏回族自治区", "新疆维吾尔自治区", "香港特别行政区", "澳门特别行政区",
]);

const clean = (value: unknown) =>
  String(value ?? "").replace(/\s+/g, " ").trim();

function parseRegion(location: unknown) {
  const text = clean(location);
  if (!text) return { region: null, city: null };
  if (text === "远程办公" || text === "线上") return { region: "线上", city: null };
  const [region, city] = text.split("·").map((s) => s.trim());
  if (PROVINCES.has(region)) return { region, city: city || null };
  for (const p of PROVINCES) {
    if (p !== "全国" && text.startsWith(p.replace(/省|市|自治区|壮族|回族|维吾尔/g, ""))) {
      return { region: p, city: null };
    }
  }
  return { region: null, city: text || null };
}

function dateFrom(item: any) {
  if (item.publishedDate && /^\d{4}-\d{2}-\d{2}$/.test(item.publishedDate)) {
    return new Date(`${item.publishedDate}T00:00:00+08:00`);
  }
  const days = Number(item.publishedDays) || 0;
  return new Date(Date.now() - days * 86_400_000);
}

/* ---------- 各板块映射：JSON 记录 -> Content 字段 ---------- */

function mapFunding(item: any) {
  const metadata = {
    sourceKey: item.id,
    sourceName: item.sourceName,
    type: item.type,
    direction: "提供资源",
    duration: item.duration,
    amount: item.amount,
    org: item.org,
    applicationUrl: item.url,
    ...(item.due && /^\d{4}-\d{2}-\d{2}$/.test(item.due) ? { validUntil: item.due } : {}),
    ...(item.due === "长期有效" ? { ongoing: "true" } : {}),
  };
  return {
    module: "FUNDING",
    subtype: item.supportType === "物资" ? "物资资助" : "资金资助",
    title: item.title,
    summary: item.summary,
    body: item.summary,
    fields: [item.field].filter(Boolean),
    tags: [item.type, item.field].filter(Boolean),
    region: item.region && PROVINCES.has(item.region) ? item.region : null,
    city: null,
    metadata,
    publishedAt: dateFrom(item),
  };
}

function mapJob(item: any) {
  const { region, city } = parseRegion(item.location);
  const metadata = {
    sourceKey: item.id,
    sourceName: item.sourceName,
    role: item.role,
    salary: item.salary,
    org: item.org,
    applicationLink: item.url,
    ...(item.due && /^\d{4}-\d{2}-\d{2}$/.test(item.due) ? { deadline: item.due } : {}),
  };
  return {
    module: "JOB",
    subtype: item.kind || "全职",
    title: item.title.replace(/^【(招聘|志愿者招募)】/, ""),
    summary: item.summary,
    body: item.summary,
    fields: [item.role].filter(Boolean),
    tags: [item.category, item.kind, item.role].filter(Boolean),
    region,
    city,
    metadata,
    publishedAt: dateFrom(item),
  };
}

function mapTool(item: any) {
  const metadata = {
    sourceKey: item.id,
    sourceName: item.sourceName,
    domain: item.domain,
    format: item.format,
    period: item.period,
    isFree: String(item.isFree !== false),
    priceType: item.priceText,
    tone: item.tone,
    icon: item.icon,
    action: item.action,
    downloadUrl: item.downloadUrl || item.url,
    relatedLinks: item.url,
    org: item.org,
  };
  return {
    module: "TOOL",
    subtype: item.category,
    title: item.title,
    summary: item.summary,
    body: item.summary,
    fields: [item.domain].filter(Boolean),
    tags: Array.isArray(item.tags) ? item.tags : [item.category].filter(Boolean),
    region: null,
    city: null,
    metadata,
    publishedAt: dateFrom(item),
  };
}

function mapNews(item: any) {
  const metadata = {
    sourceKey: item.id,
    sourceName: item.sourceName,
    org: item.org,
    newsType: item.newsType,
    relatedLinks: item.url,
  };
  return {
    module: "UPDATE",
    subtype: item.newsType || "公益项目",
    title: item.title,
    summary: item.summary,
    body: item.summary,
    fields: [item.field].filter(Boolean),
    tags: [item.newsType, item.field].filter(Boolean),
    region: null,
    city: null,
    metadata,
    publishedAt: dateFrom(item),
  };
}

const DATASETS = [
  { name: "fundings", file: "src/lib/fundings-data.json", module: "FUNDING", map: mapFunding },
  { name: "jobs", file: "src/lib/jobs-scraped.json", module: "JOB", map: mapJob },
  { name: "tools", file: "src/lib/tools-data.json", module: "TOOL", map: mapTool },
  { name: "news", file: "src/lib/news-data.json", module: "UPDATE", map: mapNews },
];

async function getBotAuthor(tx: any) {
  const existing = await tx.user.findUnique({ where: { email: BOT_EMAIL } });
  if (existing) return existing.id;
  const created = await tx.user.create({
    data: { email: BOT_EMAIL, name: BOT_NAME, accountType: "ORGANIZATION", role: "USER", interests: [] },
  });
  console.log(`创建爬虫账号：${BOT_EMAIL}`);
  return created.id;
}

async function importDataset(dataset: any, authorId: string) {
  let items;
  try {
    items = JSON.parse(await readFile(path.join(ROOT, dataset.file), "utf8"));
  } catch {
    console.log(`跳过 ${dataset.name}：未找到 ${dataset.file}`);
    return;
  }
  console.log(`\n===== ${dataset.name} -> ${dataset.module}：${items.length} 条 =====`);

  const rows = items.map((item: any) => ({ sourceKey: item.id as string, data: dataset.map(item) }));
  const keys = rows.map((row: { sourceKey: string }) => row.sourceKey).filter(Boolean);

  const existing = await prisma.content.findMany({
    where: {
      module: dataset.module,
      metadata: { path: ["sourceKey"], not: "null" },
    },
    select: { id: true, metadata: true },
  });
  const existingByKey = new Map(
    existing.map((row) => [
      String(
        row.metadata && typeof row.metadata === "object" && !Array.isArray(row.metadata)
          ? ((row.metadata as Record<string, unknown>).sourceKey ?? "")
          : "",
      ),
      row.id,
    ]),
  );

  let created = 0;
  let updated = 0;
  let skipped = 0;
  for (const row of rows) {
    if (!row.sourceKey) {
      skipped += 1;
      continue;
    }
    const payload = { ...row.data, authorId };
    const existingId = existingByKey.get(row.sourceKey);
    if (dryRun) {
      if (existingId) updated += 1;
      else created += 1;
      continue;
    }
    if (existingId) {
      await prisma.content.update({
        where: { id: existingId },
        data: {
          subtype: payload.subtype,
          title: payload.title,
          summary: payload.summary,
          body: payload.body,
          fields: payload.fields,
          tags: payload.tags,
          region: payload.region,
          city: payload.city,
          metadata: payload.metadata,
          publishedAt: payload.publishedAt,
          status: "PUBLISHED",
        },
      });
      updated += 1;
    } else {
      await prisma.content.create({
        data: { ...payload, status: "PUBLISHED", publishedAt: payload.publishedAt },
      });
      created += 1;
    }
  }

  // 快照里消失的记录：只提醒，不自动下架（来源轮换可能是暂时的）。
  const incomingKeys = new Set(keys);
  const gone = [...existingByKey.entries()].filter(([key]) => !incomingKeys.has(key));
  console.log(`新建 ${created}，更新 ${updated}，跳过 ${skipped}` +
    (gone.length ? `；快照外存量 ${gone.length} 条（未动）` : ""));
}

async function main() {
  const datasets = datasetArg ? DATASETS.filter((d) => d.name === datasetArg) : DATASETS;
  if (!datasets.length) {
    console.error(`未知 dataset：${datasetArg}（可选 ${DATASETS.map((d) => d.name).join("/")}）`);
    process.exit(1);
  }
  const authorId = await getBotAuthor(prisma);
  for (const dataset of datasets) {
    await importDataset(dataset, authorId);
  }
  await prisma.$disconnect();
  console.log(dryRun ? "\n（dry-run，未写库）" : "\n✅ 入库完成");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
