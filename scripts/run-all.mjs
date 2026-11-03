#!/usr/bin/env node
/**
 * 一键全自动抓取总控脚本
 *
 * 执行顺序（任一步失败立即停止，不继续后续步骤）：
 *   1. scrape-fundings.mts  抓取资助信息（BAML + MiniMax 提取，需 MINIMAX_API_KEY）
 *   2. scrape-jobs.mjs      抓取招聘岗位
 *   3. scrape-tools.mts     抓取能力工具（BAML + MiniMax 提取）
 *   4. scrape-news.mts      抓取公益资讯（BAML + MiniMax 提取）
 *   5. refine-jobs.mjs      清洗招聘岗位
 *   6. import-to-content.mts 快照统一入库（PUBLISHED，前端只读库）
 *
 * 抓取脚本沿用各自的运行约定，带 --use-env-proxy，
 * 与 package.json 里单独执行 scrape:jobs 时的行为保持一致。
 * 资助/工具/资讯的正文提取与分类由抓取脚本内的 MiniMax 一步完成，不再单独跑 AI 分类。
 *
 * 用法：pnpm scrape:all（等价于 node scripts/run-all.mjs）
 */

import { execSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

const STEPS = [
  // 资助抓取内置 MiniMax 提取（BAML），需要 .env 里的 MINIMAX_API_KEY。
  {
    label: "抓取资助信息",
    script: "scrape-fundings.mts",
    useProxy: true,
    nodeArgs: ["--import", "tsx"],
  },
  { label: "抓取招聘岗位", script: "scrape-jobs.mjs", useProxy: true },
  {
    label: "抓取能力工具",
    script: "scrape-tools.mts",
    useProxy: true,
    nodeArgs: ["--import", "tsx"],
  },
  {
    label: "抓取公益资讯",
    script: "scrape-news.mts",
    useProxy: true,
    nodeArgs: ["--import", "tsx"],
  },
  { label: "清洗招聘岗位", script: "refine-jobs.mjs" },
  {
    label: "快照入库（Content 表）",
    script: "import-to-content.mts",
    nodeArgs: ["--import", "tsx"],
  },
];

function buildCommand(step) {
  const scriptPath = path.join(ROOT, "scripts", step.script);
  const parts = ["node"];
  if (step.useProxy) parts.push("--use-env-proxy");
  for (const arg of step.nodeArgs ?? []) parts.push(arg);
  parts.push(`"${scriptPath}"`);
  for (const arg of step.args ?? []) parts.push(`"${arg}"`);
  return parts.join(" ");
}

function formatDuration(ms) {
  const seconds = ms / 1000;
  return seconds >= 60 ? `${(seconds / 60).toFixed(1)} 分钟` : `${seconds.toFixed(1)} 秒`;
}

function main() {
  const startedAt = Date.now();
  console.log(`🚀 开始执行全自动抓取流程，共 ${STEPS.length} 个步骤\n`);

  for (const [index, step] of STEPS.entries()) {
    const number = index + 1;
    const command = buildCommand(step);

    console.log(`\n===== [${number}/${STEPS.length}] ${step.label} =====`);
    console.log(`$ ${command}\n`);

    const stepStartedAt = Date.now();
    try {
      // stdio: "inherit" 让子脚本的输出实时打印到终端，便于观察进度。
      execSync(command, { cwd: ROOT, stdio: "inherit", env: process.env });
    } catch (error) {
      const status = error.status ?? "未知";
      console.error(`\n❌ [${number}/${STEPS.length}] ${step.label} 失败（退出码 ${status}）`);
      console.error(`   脚本：scripts/${step.script}`);
      if (error.signal) console.error(`   终止信号：${error.signal}`);
      console.error("   已停止后续步骤，请修复后重新执行 pnpm scrape:all。");
      process.exit(1);
    }

    console.log(
      `\n✅ [${number}/${STEPS.length}] ${step.label} 完成（${formatDuration(Date.now() - stepStartedAt)}）`,
    );
  }

  console.log(`\n🎉 全部 ${STEPS.length} 个步骤执行完成，总耗时 ${formatDuration(Date.now() - startedAt)}`);
  console.log("📦 数据快照：src/lib/{fundings-data,jobs-scraped,tools-data}.json");
  console.log(`📊 审核表格：${process.env.EXPORT_OUT_DIR || "docs/exports"}/{fundings,jobs,tools}.xlsx`);
  console.log("🤖 AI 分类已直接写回分类字段：高置信度自动发布，低置信度标记 PENDING_REVIEW。");
  console.log("🔎 新抓取的记录默认为 PENDING；AI 高置信度会发布，低置信度需人工复核。");
  console.log("📥 人工审核后运行 pnpm import:excel，把审核状态和最终发布分类写回快照。");
}

main();
