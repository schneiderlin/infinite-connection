#!/usr/bin/env node
/**
 * 一级（DB PUBLISHED）内容质量闸门
 *
 * 规则：DB 里每条 PUBLISHED 的抓取内容（metadata.sourceKey）都必须通过
 * 对应板块的硬字段检查；任一失败即退出码 1（可作为 autonomous gate）。
 *
 * 用法：node --import tsx scripts/quality-check.mts [--dataset tools] [--sample 10]
 */

import "dotenv/config";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const args = process.argv.slice(2);
const only = args.includes("--dataset") ? args[args.indexOf("--dataset") + 1] : null;
const sampleN = args.includes("--sample") ? Number(args[args.indexOf("--sample") + 1]) : 10;

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

const today = new Date().toISOString().slice(0, 10);
const isDate = (v) => typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v);
const isHttp = (v) => typeof v === "string" && /^https?:\/\//.test(v);
const TEMPLATE_SUMMARY = /^(中国发展简报[：:]|恩友财务提供的|深圳国际公益学院公益网校公开课|中国慈善联合会培训动态[：:]|【原创成果】|CFF 长青文献图书馆资料[：:])/;

const common = [
  ["有 extraction（过过 MiniMax）", (r) => !!r.extraction],
  ["摘要非模板且 ≥40 字", (r) => typeof r.summary === "string" && r.summary.length >= 40 && !TEMPLATE_SUMMARY.test(r.summary)],
  ["org 非空", (r) => typeof r.org === "string" && r.org.trim().length >= 2],
  ["URL 合法", (r) => isHttp(r.url)],
];

const rules = {
  fundings: [
    ...common,
    ["due 取值合法", (r) => isDate(r.due) || r.due === "长期有效" || r.due === "详见原帖"],
    ["openStatus 与 due 一致", (r) => {
      if (isDate(r.due)) return r.due < today ? r.openStatus === "已截止" : r.openStatus === "开放中";
      if (r.due === "长期有效") return r.openStatus === "开放中";
      return r.openStatus === "以原帖为准";
    }],
    ["有金额时必须为单项目额度", (r) => !(r.amountWan > 0) || (r.extraction?.amount_scope === "PER_PROJECT" && r.amount !== "详见原帖")],
    ["field 非空", (r) => !!r.field],
  ],
  tools: [
    ...common,
    ["publishDate 是真实日期（非抓取日；课程类允许无日期）", (r) =>
      r.publishDate === "" || r.publishDate === undefined || (isDate(r.publishDate) && r.publishDate !== "2026-10-12")],
    ["category 在八类内", (r) => ["培训课程","行业沙龙会议","公益工具模板库","行业报告","行业标准","同行经验文章","国际经验","其他"].includes(r.category)],
  ],
  news: [
    ...common,
    ["publishDate 是真实日期", (r) => isDate(r.publishedDate)],
    ["newsType 非空", (r) => !!r.newsType],
  ],
  jobs: [
    ...common,
    ["salary 格式规范", (r) => /^(\d[\d,]*(-\d[\d,]*)?元(\/月|\/天)?|面议|详见原帖|志愿服务)$/.test(r.salary ?? "")],
    ["location 规范（省市或线上）", (r) => typeof r.location === "string" && r.location.length > 0 && !/http/.test(r.location)],
  ],
};

const FILES = {
  fundings: "src/lib/fundings-data.json",
  jobs: "src/lib/jobs-scraped.json",
  tools: "src/lib/tools-data.json",
  news: "src/lib/news-data.json",
};
const MODULES = { fundings: "FUNDING", jobs: "JOB", tools: "TOOL", news: "UPDATE" };

async function main() {
  const datasets = only ? [only] : Object.keys(FILES);
  let totalFail = 0;

  for (const name of datasets) {
    const snapshot = JSON.parse(await readFile(path.join(ROOT, FILES[name]), "utf8"));
    const byId = new Map(snapshot.map((r) => [r.id, r]));

    const published = await prisma.content.findMany({
      where: { module: MODULES[name], status: "PUBLISHED", metadata: { path: ["sourceKey"], not: "null" } },
      select: { id: true, title: true, metadata: true },
    });

    const failures = [];
    for (const row of published) {
      const key = String(row.metadata?.sourceKey ?? "");
      const record = byId.get(key);
      if (!record) {
        failures.push({ title: row.title, reason: "DB 记录在快照中不存在（陈旧数据）" });
        continue;
      }
      for (const [label, check] of rules[name] ?? []) {
        let ok = false;
        try { ok = check(record); } catch { ok = false; }
        if (!ok) failures.push({ title: record.title, reason: label });
      }
    }

    const byReason = {};
    for (const f of failures) byReason[f.reason] = (byReason[f.reason] ?? 0) + 1;
    console.log(`\n===== ${name}: PUBLISHED ${published.length} 条，不合格 ${failures.length} 条 =====`);
    for (const [reason, count] of Object.entries(byReason).sort((a, b) => b[1] - a[1])) {
      console.log(`  ✗ ${reason}: ${count} 条`);
      for (const f of failures.filter((x) => x.reason === reason).slice(0, sampleN)) {
        console.log(`      - ${f.title.slice(0, 44)}`);
      }
    }
    totalFail += failures.length;
  }

  await prisma.$disconnect();
  console.log(totalFail ? `\n❌ 共 ${totalFail} 条不合格` : "\n✅ 一级全部通过质检");
  process.exitCode = totalFail ? 1 : 0;
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
