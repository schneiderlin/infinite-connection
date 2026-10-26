#!/usr/bin/env node
/**
 * 把抓取快照里 AI 低置信度的 PENDING_REVIEW 记录导入 Prisma Content 表，
 * 让它们进入管理后台 /admin/review 的人工审核队列。
 *
 * 数据来源：
 *   - src/lib/fundings-data.json  -> ContentModule.FUNDING
 *   - src/lib/jobs-scraped.json   -> ContentModule.JOB
 *
 * 约定：
 *   - 只导入 status === "PENDING_REVIEW" 的记录，不改写原始 JSON。
 *   - 导入后 status 仍为 PENDING_REVIEW，submittedAt 写为本次执行时间。
 *   - metadata.sourceKey 做幂等键；重复执行会跳过已导入记录。
 *   - 作者优先取 ADMIN_EMAILS 中已存在的账号，其次数据库 ADMIN，最后回退到最早用户。
 *
 * 用法：
 *   pnpm import:review
 *   pnpm import:review -- --dry-run
 *   pnpm import:review -- --author-email admin@example.com
 *   node scripts/import-pending-review-to-content.mjs --dry-run
 */

import "dotenv/config";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const SOURCE = "pending-review-import";
const PENDING_STATUS = "PENDING_REVIEW";
// 事务级 advisory lock，避免多个终端同时执行时各自看到空队列并重复插入。
const IMPORT_LOCK_KEY = 2026102601;

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");

function readArg(name) {
  const index = args.indexOf(name);
  if (index === -1) return undefined;
  return args[index + 1];
}

function text(value) {
  if (typeof value === "string") return value.trim();
  if (value === null || value === undefined) return "";
  return String(value).trim();
}

function truncate(value, max) {
  const chars = Array.from(value);
  return chars.length > max ? `${chars.slice(0, max - 1).join("")}…` : value;
}

function unique(values, max = 10) {
  return [...new Set(values.map(text).filter(Boolean))].slice(0, max);
}

function factLines(facts) {
  return facts
    .map(([label, value]) => [label, text(value)])
    .filter(([, value]) => value)
    .map(([label, value]) => `${label}：${value}`);
}

function regionFromLocation(location) {
  const [region, city] = text(location).split("·").map((part) => part.trim());
  return { region: region || null, city: city || null };
}

function buildFunding(item) {
  const region = text(item.region) || regionFromLocation(item.location).region;
  const summary = truncate(text(item.summary), 120);
  const body = [
    text(item.summary),
    "",
    ...factLines([
      ["机构", item.org],
      ["资助类型", item.type],
      ["支持方式", item.supportType],
      ["资助领域", item.field],
      ["适用地区", item.location || item.region],
      ["资助金额", item.amount],
      ["申报截止", item.due],
      ["开放状态", item.openStatus],
      ["发布时间", item.publishedDate],
      ["来源", item.sourceName],
      ["原文链接", item.url],
    ]),
  ]
    .join("\n")
    .trim();

  return {
    module: "FUNDING",
    subtype: /物资/.test(text(item.supportType)) ? "物资资助" : "资金资助",
    title: truncate(text(item.title), 100),
    summary: summary || null,
    body,
    fields: unique([item.field], 12),
    tags: unique([item.type, item.supportType, item.openStatus]),
    region: region ? truncate(region, 40) : null,
    city: null,
    metadata: {
      source: SOURCE,
      sourceKey: `funding:${String(item.id)}`,
      sourceFile: "src/lib/fundings-data.json",
      sourceId: String(item.id),
      sourceName: text(item.sourceName) || null,
      sourceUrl: text(item.url) || null,
      organization: text(item.org) || null,
      aiSuggestedCategory: text(item.aiSuggestedCategory) || null,
      aiConfidence: typeof item.aiConfidence === "number" ? item.aiConfidence : null,
      importedAt: new Date().toISOString(),
      raw: item,
    },
  };
}

function buildJob(item) {
  const { region, city } = regionFromLocation(item.location);
  const summary = truncate(text(item.summary), 120);
  const body = [
    text(item.summary),
    "",
    ...factLines([
      ["机构", item.org],
      ["岗位类别", item.category],
      ["工作性质", item.kind],
      ["岗位方向", item.role],
      ["工作地点", item.location],
      ["薪资", item.salary],
      ["截止时间", item.due],
      ["来源", item.sourceName],
      ["原文链接", item.url],
    ]),
  ]
    .join("\n")
    .trim();

  return {
    module: "JOB",
    subtype: text(item.kind) || "全职",
    title: truncate(text(item.title), 100),
    summary: summary || null,
    body,
    fields: [],
    tags: unique([item.category, item.role, item.salary]),
    region: region ? truncate(region, 40) : null,
    city: city ? truncate(city, 40) : null,
    metadata: {
      source: SOURCE,
      sourceKey: `job:${String(item.id)}`,
      sourceFile: "src/lib/jobs-scraped.json",
      sourceId: String(item.id),
      sourceName: text(item.sourceName) || null,
      sourceUrl: text(item.url) || null,
      organization: text(item.org) || null,
      aiSuggestedCategory: text(item.aiSuggestedCategory) || null,
      aiConfidence: typeof item.aiConfidence === "number" ? item.aiConfidence : null,
      importedAt: new Date().toISOString(),
      raw: item,
    },
  };
}

const DATASETS = [
  {
    key: "funding",
    label: "资金与物资",
    file: path.join(ROOT, "src", "lib", "fundings-data.json"),
    build: buildFunding,
  },
  {
    key: "job",
    label: "人力资源",
    file: path.join(ROOT, "src", "lib", "jobs-scraped.json"),
    build: buildJob,
  },
];

async function loadPendingRecords(dataset) {
  const raw = await readFile(dataset.file, "utf8");
  const parsed = JSON.parse(raw);
  if (!Array.isArray(parsed)) {
    throw new Error(`${dataset.file} 不是数组，无法导入`);
  }
  const pending = parsed.filter((item) => item?.status === PENDING_STATUS);
  return { total: parsed.length, pending };
}

function metadataOf(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : null;
}

async function loadExistingKeys(prisma) {
  const rows = await prisma.content.findMany({
    where: { module: { in: ["FUNDING", "JOB"] } },
    select: { id: true, module: true, metadata: true },
  });
  const keys = new Set();
  for (const row of rows) {
    const metadata = metadataOf(row.metadata);
    const key = metadata?.sourceKey
      ?? (metadata?.sourceId ? `${row.module.toLowerCase()}:${metadata.sourceId}` : null);
    if (key) keys.add(key);
  }
  return keys;
}

async function resolveAuthor(prisma) {
  const requestedEmail = text(readArg("--author-email")).toLowerCase();
  if (requestedEmail) {
    const user = await prisma.user.findUnique({ where: { email: requestedEmail } });
    if (!user) throw new Error(`--author-email 指定的账号不存在：${requestedEmail}`);
    return { user, reason: "--author-email" };
  }

  const adminEmails = text(process.env.ADMIN_EMAILS)
    .split(",")
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean);

  for (const email of adminEmails) {
    const user = await prisma.user.findUnique({ where: { email } });
    if (user) return { user, reason: "ADMIN_EMAILS" };
  }

  const dbAdmin = await prisma.user.findFirst({
    where: { role: "ADMIN" },
    orderBy: { createdAt: "asc" },
  });
  if (dbAdmin) return { user: dbAdmin, reason: "数据库 ADMIN" };

  const firstUser = await prisma.user.findFirst({ orderBy: { createdAt: "asc" } });
  if (!firstUser) {
    throw new Error("数据库中没有用户，无法确定 Content.authorId。请先注册账号或配置 ADMIN_EMAILS。");
  }
  return { user: firstUser, reason: "最早注册用户（未找到 ADMIN，请确认 ADMIN_EMAILS）" };
}

async function collectCandidates(author) {
  const now = new Date();
  const candidates = [];
  const warnings = [];
  const seenKeys = new Set();

  for (const dataset of DATASETS) {
    const { total, pending } = await loadPendingRecords(dataset);
    console.log(`\n📂 ${dataset.label}：共 ${total} 条，待复核 ${pending.length} 条`);

    for (const item of pending) {
      if (item?.id === undefined || item?.id === null || String(item.id).trim() === "") {
        warnings.push(`${dataset.label}：发现缺少 id 的待复核记录，已跳过`);
        continue;
      }

      const sourceKey = `${dataset.key}:${String(item.id)}`;
      if (seenKeys.has(sourceKey)) {
        warnings.push(`${dataset.label}：${sourceKey} 在快照中重复，已跳过`);
        continue;
      }
      seenKeys.add(sourceKey);

      const mapped = dataset.build(item);
      if (!mapped.title) {
        warnings.push(`${dataset.label}：${sourceKey} 缺少标题，已跳过`);
        continue;
      }
      if (!mapped.body) {
        warnings.push(`${dataset.label}：${sourceKey} 缺少正文/摘要，已跳过`);
        continue;
      }

      candidates.push({
        sourceKey,
        module: mapped.module,
        data: {
          authorId: author.id,
          ...mapped,
          status: PENDING_STATUS,
          submittedAt: now,
          reviewedAt: null,
          publishedAt: null,
          rejectionReason: null,
        },
      });
    }
  }

  return { candidates, warnings };
}

function summarize(candidates) {
  const funding = candidates.filter((item) => item.module === "FUNDING").length;
  const job = candidates.filter((item) => item.module === "JOB").length;
  return `FUNDING ${funding} 条，JOB ${job} 条`;
}

async function main() {
  if (!process.env.DATABASE_URL) {
    throw new Error("缺少 DATABASE_URL，请检查 .env");
  }

  const prisma = new PrismaClient({
    adapter: new PrismaPg(process.env.DATABASE_URL),
  });

  try {
    const { user: author, reason } = await resolveAuthor(prisma);
    console.log("📥 待复核快照 → Prisma Content");
    console.log(`👤 发布人：${author.name ?? author.email} <${author.email}>（${reason}）`);
    if (reason.includes("未找到 ADMIN")) {
      console.warn("⚠️  当前没有可识别的 ADMIN；请把登录邮箱加入 ADMIN_EMAILS 后再访问 /admin/review。");
    }
    if (dryRun) console.log("🧪 当前为 dry-run，只统计不写库。");

    const { candidates, warnings } = await collectCandidates(author);
    if (warnings.length > 0) {
      console.log("\n⚠️  警告：");
      for (const warning of warnings) console.log(`  - ${warning}`);
    }

    if (dryRun) {
      const existingKeys = await loadExistingKeys(prisma);
      const fresh = candidates.filter((item) => !existingKeys.has(item.sourceKey));
      const skipped = candidates.length - fresh.length;
      console.log(`\n🧪 dry-run：将新增 ${fresh.length} 条 PENDING_REVIEW 内容，跳过已存在 ${skipped} 条。`);
      if (fresh.length > 0) console.log(`   来源：${summarize(fresh)}`);
    } else {
      const result = await prisma.$transaction(async (tx) => {
        // void 返回值无法被 Prisma 反序列化，用子查询包一层只返回整数。
        await tx.$queryRawUnsafe(
          `SELECT 1 AS locked FROM (SELECT pg_advisory_xact_lock(${IMPORT_LOCK_KEY})) AS lock`,
        );
        const existingKeys = await loadExistingKeys(tx);
        const fresh = candidates.filter((item) => !existingKeys.has(item.sourceKey));
        if (fresh.length === 0) return { created: 0, skipped: candidates.length };

        const created = await tx.content.createMany({
          data: fresh.map((item) => item.data),
        });
        return { created: created.count, skipped: candidates.length - created.count };
      }, { timeout: 30_000 });

      if (result.created === 0) {
        console.log(`\n✅ 没有需要导入的新记录（已存在 ${result.skipped} 条）。`);
      } else {
        console.log(`\n✅ 已导入 ${result.created} 条 PENDING_REVIEW 内容，跳过已存在 ${result.skipped} 条。`);
        console.log(`   来源：${summarize(candidates)}`);
      }
    }

    const [pendingTotal, fundingPending, jobPending] = await Promise.all([
      prisma.content.count({ where: { status: PENDING_STATUS } }),
      prisma.content.count({ where: { status: PENDING_STATUS, module: "FUNDING" } }),
      prisma.content.count({ where: { status: PENDING_STATUS, module: "JOB" } }),
    ]);
    console.log(`\n📋 当前待审核：${pendingTotal} 条（资金与物资 ${fundingPending} / 人力资源 ${jobPending}）`);
    console.log("🔄 后台 /admin/review 每次请求都实时查库，直接刷新页面即可看到新记录。");
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error("\n❌ 导入失败：", error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
