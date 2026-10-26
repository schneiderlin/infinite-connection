#!/usr/bin/env node
/**
 * 把人工审核后的 Excel 反向导入 src/lib 数据快照。
 *
 * 审核约定：
 *   - 审核状态 = PUBLISHED：把「最终发布分类」写入 JSON 的分类字段，并把 status 改为 PUBLISHED
 *   - 审核状态 = PENDING / REJECTED：只同步 status，不修改分类
 *   - 最终发布分类为空：保留原分类并打印警告
 *
 * 容错：
 *   - 表头改名、新增列、缺少可选列、未知记录 ID、重复 ID 都会打印警告
 *   - 缺少必需列（记录 ID、审核状态、最终发布分类）时跳过该文件，不影响其他文件
 *   - 表头不在第一行时，会在前 20 行内自动查找
 *
 * 用法：
 *   pnpm import:excel
 *   node scripts/import-from-excel.mjs --dry-run
 *   node scripts/import-from-excel.mjs --dataset jobs
 *   node scripts/import-from-excel.mjs --in-dir docs/exports
 *   node scripts/import-from-excel.mjs --file docs/exports/jobs.xlsx --dataset jobs
 */

import { existsSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as XLSX from "xlsx";

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const DEFAULT_IN_DIR = process.env.IMPORT_IN_DIR
  ? path.resolve(process.env.IMPORT_IN_DIR)
  : path.join(ROOT, "docs", "exports");

const HEADER_ALIASES = {
  status: ["审核状态", "状态", "reviewStatus", "review_status"],
  finalCategory: ["最终发布分类", "最终分类", "发布分类", "finalCategory", "final_category"],
  originalCategory: ["原始分类", "原分类", "originalCategory", "original_category"],
  aiSuggestedCategory: [
    "AI建议分类",
    "AI 建议分类",
    "AI分类",
    "aiSuggestedCategory",
    "ai_suggested_category",
  ],
};

const STANDARD_HEADERS = {
  status: "审核状态",
  finalCategory: "最终发布分类",
  originalCategory: "原始分类",
  aiSuggestedCategory: "AI建议分类",
};

const REQUIRED_COLUMNS = [
  ["id", (dataset) => dataset.idAliases[0]],
  ["status", () => "审核状态"],
  ["finalCategory", () => "最终发布分类"],
];

const STATUS_ALIASES = new Map([
  ["PENDING", "PENDING"],
  ["待审核", "PENDING"],
  ["待审", "PENDING"],
  ["PENDING_REVIEW", "PENDING_REVIEW"],
  ["PENDING REVIEW", "PENDING_REVIEW"],
  ["待人工审核", "PENDING_REVIEW"],
  ["PUBLISHED", "PUBLISHED"],
  ["已发布", "PUBLISHED"],
  ["发布", "PUBLISHED"],
  ["REJECTED", "REJECTED"],
  ["已拒绝", "REJECTED"],
  ["拒绝", "REJECTED"],
]);

const DATASETS = [
  {
    key: "fundings",
    label: "资助机会",
    file: "fundings.xlsx",
    sheetName: "资助机会",
    source: path.join(ROOT, "src", "lib", "fundings-data.json"),
    classificationField: "field",
    categoryLabel: "资助领域",
    idAliases: ["记录ID", "记录 ID", "ID", "id"],
    knownHeaders: [
      "审核状态",
      "原始分类",
      "AI建议分类",
      "最终发布分类",
      "记录ID",
      "记录类型",
      "资助类型",
      "支持类型",
      "地区",
      "地点",
      "标题",
      "发布机构",
      "金额",
      "金额（万元）",
      "项目周期",
      "截止日期",
      "剩余天数",
      "申报通道",
      "发布日期",
      "发布天数",
      "数据来源",
      "原文链接",
      "摘要",
    ],
    knownCategories: [
      "乡村教育",
      "生态环保",
      "产业生计",
      "文化传承",
      "人才培育",
      "残障融合",
      "儿童保护",
      "青少年发展",
      "老龄关怀",
      "医疗健康",
      "心理健康",
      "女性关怀",
      "社区营造",
      "应急救援",
      "志愿服务",
      "社会组织支持",
      "创新探索",
      "其他",
    ],
  },
  {
    key: "jobs",
    label: "招聘岗位",
    file: "jobs.xlsx",
    sheetName: "招聘岗位",
    source: path.join(ROOT, "src", "lib", "jobs-scraped.json"),
    classificationField: "role",
    categoryLabel: "岗位类别",
    idAliases: ["岗位ID", "岗位 ID", "记录ID", "ID", "id"],
    knownHeaders: [
      "审核状态",
      "原始分类",
      "AI建议分类",
      "最终发布分类",
      "岗位ID",
      "招聘类型",
      "工作性质",
      "标题",
      "机构",
      "地点",
      "薪资",
      "截止日期",
      "发布时间",
      "发布天数",
      "数据来源",
      "原文链接",
      "摘要",
    ],
    knownCategories: [
      "项目官员",
      "项目执行",
      "社工",
      "传播",
      "筹款",
      "国际项目",
      "研究",
      "财务",
      "人力资源",
      "高级管理",
      "督导",
      "法务",
      "志愿者管理",
      "技术开发",
      "其他",
    ],
  },
  {
    key: "tools",
    label: "能力工具",
    file: "tools.xlsx",
    sheetName: "能力工具",
    source: path.join(ROOT, "src", "lib", "tools-data.json"),
    classificationField: "category",
    categoryLabel: "内容分类",
    idAliases: ["资源ID", "资源 ID", "工具ID", "记录ID", "ID", "id"],
    knownHeaders: [
      "审核状态",
      "原始分类",
      "AI建议分类",
      "最终发布分类",
      "资源ID",
      "标题",
      "机构",
      "领域",
      "形式",
      "周期",
      "是否免费",
      "价格说明",
      "标签",
      "日期",
      "地点",
      "发布日期",
      "发布天数",
      "数据来源",
      "原文链接",
      "下载链接",
      "摘要",
    ],
    knownCategories: [
      "培训课程",
      "行业沙龙会议",
      "公益工具模板库",
      "行业报告",
      "行业标准",
      "同行经验文章",
      "国际经验",
      "其他",
    ],
  },
];

/* ---------- 表头识别 ---------- */

class WarningBag {
  constructor() {
    this.messages = [];
  }

  add(message) {
    this.messages.push(message);
  }

  print() {
    if (this.messages.length === 0) return;
    const limit = 50;
    for (const message of this.messages.slice(0, limit)) {
      console.log(`   ⚠️ ${message}`);
    }
    if (this.messages.length > limit) {
      console.log(`   ⚠️ 另有 ${this.messages.length - limit} 条警告未显示`);
    }
  }
}

function canonicalHeader(rawHeader, dataset) {
  const header = String(rawHeader ?? "").trim();
  if (!header) return null;
  if (dataset.idAliases.includes(header)) return "id";
  for (const [canonical, aliases] of Object.entries(HEADER_ALIASES)) {
    if (aliases.includes(header)) return canonical;
  }
  if (dataset.knownHeaders.includes(header)) return `data:${header}`;
  return null;
}

/**
 * 在前 20 行内查找表头，避免运营在顶部插入说明行后整个导入失败。
 * 返回 null 表示当前工作表不是该数据集的数据表。
 */
function analyzeSheet(sheet, dataset) {
  const matrix = XLSX.utils.sheet_to_json(sheet, {
    header: 1,
    defval: "",
    raw: false,
    blankrows: true,
  });

  const maxHeaderScan = Math.min(matrix.length, 20);
  for (let headerRowIndex = 0; headerRowIndex < maxHeaderScan; headerRowIndex += 1) {
    const row = Array.isArray(matrix[headerRowIndex]) ? matrix[headerRowIndex] : [];
    const columns = row.map((value, index) => {
      const header = String(value ?? "").trim();
      return { index, header, canonical: canonicalHeader(header, dataset) };
    });
    const canonicalSet = new Set(
      columns.map((column) => column.canonical).filter(Boolean),
    );
    if (REQUIRED_COLUMNS.every(([key]) => canonicalSet.has(key))) {
      return { matrix, headerRowIndex, columns, canonicalSet };
    }
  }

  return null;
}

function selectSheet(workbook, dataset, warnings) {
  const ordered = [];
  if (workbook.SheetNames.includes(dataset.sheetName)) {
    ordered.push(dataset.sheetName);
  }
  for (const name of workbook.SheetNames) {
    if (!ordered.includes(name)) ordered.push(name);
  }

  for (const name of ordered) {
    const info = analyzeSheet(workbook.Sheets[name], dataset);
    if (!info) continue;
    if (name !== dataset.sheetName) {
      warnings.add(`未找到工作表「${dataset.sheetName}」，已改用「${name}」`);
    }
    return { name, ...info };
  }

  return null;
}

function reportHeaderIssues(info, dataset, warnings) {
  if (info.headerRowIndex > 0) {
    warnings.add(
      `表头不在第 1 行（实际第 ${info.headerRowIndex + 1} 行），已自动识别`,
    );
  }

  const seen = new Map();
  for (const column of info.columns) {
    if (!column.header) continue;
    if (!column.canonical) {
      warnings.add(
        `未识别的列「${column.header}」（已忽略；如果是新增字段，请在 import-from-excel.mjs 中补充映射）`,
      );
      continue;
    }
    if (column.canonical.startsWith("data:")) continue;
    if (seen.has(column.canonical)) {
      warnings.add(
        `列「${column.header}」与「${seen.get(column.canonical)}」重复，使用前者`,
      );
      continue;
    }
    seen.set(column.canonical, column.header);

    const standard =
      column.canonical === "id"
        ? dataset.idAliases[0]
        : STANDARD_HEADERS[column.canonical];
    if (standard && column.header !== standard) {
      warnings.add(`已将列「${column.header}」识别为「${standard}」`);
    }
  }

  for (const [canonical, label] of [
    ["originalCategory", "原始分类"],
    ["aiSuggestedCategory", "AI建议分类"],
  ]) {
    if (!info.canonicalSet.has(canonical)) {
      warnings.add(`缺少可选列「${label}」（不影响导入）`);
    }
  }
}

function getCell(row, info, canonical) {
  const column = info.columns.find((item) => item.canonical === canonical);
  if (!column) return "";
  return row[column.index] ?? "";
}

/* ---------- 单元格归一化 ---------- */

function normalizeId(value) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return Number.isInteger(value)
      ? String(value)
      : String(value).replace(/\.0+$/, "");
  }
  return String(value ?? "")
    .trim()
    .replace(/\.0+$/, "");
}

function normalizeStatus(value) {
  const raw = String(value ?? "").trim();
  if (!raw) return { raw, status: null };
  const status = STATUS_ALIASES.get(raw.toUpperCase()) ?? STATUS_ALIASES.get(raw) ?? null;
  return { raw, status };
}

function isBlankRow(row) {
  return row.every((value) => String(value ?? "").trim() === "");
}

/* ---------- 单个数据集导入 ---------- */

async function importDataset(dataset, inputPath, options) {
  const warnings = new WarningBag();
  const sourcePath = path.join(options.dataDir, path.basename(dataset.source));
  console.log(`\n📄 ${dataset.label}：${path.relative(ROOT, inputPath) || inputPath}`);

  if (!existsSync(inputPath)) {
    console.log("   ⏭ 文件不存在，跳过。");
    return { found: false, failed: false, warnings, stats: null };
  }

  let workbook;
  try {
    // xlsx 的 ESM 命名导出里没有 readFile，用 fs 读成 Buffer 再交给 XLSX.read。
    const buffer = await readFile(inputPath);
    workbook = XLSX.read(buffer, { type: "buffer", cellDates: false });
  } catch (error) {
    console.error(`   ❌ 读取失败：${error.message}`);
    return { found: true, failed: true, warnings, stats: null };
  }

  const info = selectSheet(workbook, dataset, warnings);
  if (!info) {
    console.error(
      `   ❌ 找不到包含必需列的工作表。必需列：${dataset.idAliases[0]}、审核状态、最终发布分类`,
    );
    warnings.print();
    return { found: true, failed: true, warnings, stats: null };
  }

  console.log(
    `   工作表：${info.name}（表头第 ${info.headerRowIndex + 1} 行，${info.columns.length} 列）`,
  );
  reportHeaderIssues(info, dataset, warnings);

  let records;
  try {
    records = JSON.parse(await readFile(sourcePath, "utf8"));
  } catch (error) {
    console.error(`   ❌ 读取 JSON 失败：${error.message}`);
    warnings.print();
    return { found: true, failed: true, warnings, stats: null };
  }

  if (!Array.isArray(records)) {
    console.error(`   ❌ ${path.relative(ROOT, sourcePath)} 不是数组，无法导入。`);
    warnings.print();
    return { found: true, failed: true, warnings, stats: null };
  }

  const byId = new Map();
  for (const record of records) {
    const id = normalizeId(record.id);
    if (!id) {
      warnings.add("JSON 中存在缺少 id 的记录，已忽略");
      continue;
    }
    if (byId.has(id)) {
      warnings.add(`JSON 中记录 ID ${id} 重复，使用第一条`);
      continue;
    }
    byId.set(id, record);
  }

  const stats = {
    rows: 0,
    matched: 0,
    statusChanged: 0,
    categoryChanged: 0,
    unchanged: 0,
    skipped: 0,
  };
  const seenRowIds = new Set();

  for (let rowIndex = info.headerRowIndex + 1; rowIndex < info.matrix.length; rowIndex += 1) {
    const row = Array.isArray(info.matrix[rowIndex]) ? info.matrix[rowIndex] : [];
    const excelRow = rowIndex + 1;
    if (isBlankRow(row)) continue;
    stats.rows += 1;

    const id = normalizeId(getCell(row, info, "id"));
    if (!id) {
      warnings.add(`第 ${excelRow} 行缺少记录 ID，已跳过`);
      stats.skipped += 1;
      continue;
    }

    if (seenRowIds.has(id)) {
      warnings.add(`第 ${excelRow} 行记录 ID ${id} 重复，已跳过`);
      stats.skipped += 1;
      continue;
    }
    seenRowIds.add(id);

    const record = byId.get(id);
    if (!record) {
      warnings.add(`第 ${excelRow} 行记录 ID ${id} 在 JSON 中不存在，已跳过`);
      stats.skipped += 1;
      continue;
    }
    stats.matched += 1;

    const { raw: statusRaw, status } = normalizeStatus(getCell(row, info, "status"));
    if (!status) {
      warnings.add(
        `第 ${excelRow} 行审核状态「${statusRaw}」无法识别（支持 PENDING/PENDING_REVIEW/PUBLISHED/REJECTED），已跳过`,
      );
      stats.skipped += 1;
      continue;
    }

    const finalCategory = String(getCell(row, info, "finalCategory") ?? "").trim();
    const currentCategory = String(record[dataset.classificationField] ?? "").trim();
    let changed = false;

    if (status === "PUBLISHED") {
      if (!finalCategory) {
        warnings.add(
          `第 ${excelRow} 行已标记 PUBLISHED，但最终发布分类为空，保留原分类「${currentCategory || "未标注"}」`,
        );
      } else {
        if (!dataset.knownCategories.includes(finalCategory)) {
          warnings.add(
            `第 ${excelRow} 行最终发布分类「${finalCategory}」不在已知枚举内，仍按填写值导入，请确认前端筛选是否支持`,
          );
        }
        if (finalCategory !== currentCategory) {
          record[dataset.classificationField] = finalCategory;
          stats.categoryChanged += 1;
          changed = true;
        }
      }
    } else if (finalCategory && finalCategory !== currentCategory) {
      warnings.add(
        `第 ${excelRow} 行审核状态为 ${status}，最终发布分类的修改未应用（仅 PUBLISHED 时覆盖分类）`,
      );
    }

    // 历史快照没有 status，前端按“已发布”处理；导出时也显示 PUBLISHED。
    // 这种情况下不强制补写 status，避免无意义的整表 diff；PENDING/REJECTED 记录才会被改写。
    const currentStatus =
      typeof record.status === "string" ? record.status.trim() : record.status;
    const hasExplicitStatus =
      currentStatus !== undefined && currentStatus !== null && currentStatus !== "";

    if (status === "PUBLISHED") {
      if (hasExplicitStatus && currentStatus !== "PUBLISHED") {
        record.status = "PUBLISHED";
        stats.statusChanged += 1;
        changed = true;
      }
    } else if (currentStatus !== status) {
      record.status = status;
      stats.statusChanged += 1;
      changed = true;
    }

    if (!changed) stats.unchanged += 1;
  }

  const totalChanges = stats.statusChanged + stats.categoryChanged;

  if (totalChanges > 0 && !options.dryRun) {
    await writeFile(sourcePath, `${JSON.stringify(records, null, 2)}\n`, "utf8");
  }

  console.log(
    `   读取 ${stats.rows} 行 | 匹配 ${stats.matched} 条 | 状态更新 ${stats.statusChanged} | 分类更新 ${stats.categoryChanged} | 未变 ${stats.unchanged} | 跳过 ${stats.skipped}`,
  );

  if (totalChanges === 0) {
    console.log("   ℹ️ 没有需要写回的变更。");
  } else if (options.dryRun) {
    console.log("   🧪 预演模式：未写回 JSON。");
  } else {
    console.log(`   💾 已写回 ${path.relative(ROOT, sourcePath)}`);
  }

  warnings.print();

  return { found: true, failed: false, warnings, stats };
}

/* ---------- 命令行 ---------- */

function printHelp() {
  console.log(`用法：node scripts/import-from-excel.mjs [选项]

读取 docs/exports/{fundings,jobs,tools}.xlsx，把人工审核结果写回 src/lib 快照。

选项：
  --in-dir <dir>     Excel 所在目录（默认 docs/exports，可用 IMPORT_IN_DIR 覆盖）
  --file <path>      只导入指定文件（需同时指定 --dataset，或文件名可识别）
  --dataset <name>   只导入一个数据集：fundings | jobs | tools
  --data-dir <dir>   数据目录（默认 src/lib；联调时可指向临时副本）
  --dry-run          只统计，不写回 JSON
  -h, --help         显示帮助`);
}

function parseOptions(args) {
  const options = {
    inDir: DEFAULT_IN_DIR,
    file: null,
    dataset: null,
    dataDir: path.join(ROOT, "src", "lib"),
    dryRun: false,
    help: false,
  };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    const separator = arg.indexOf("=");
    const flag = separator === -1 ? arg : arg.slice(0, separator);
    const inlineValue = separator === -1 ? undefined : arg.slice(separator + 1);

    const readValue = () => {
      if (inlineValue !== undefined) return inlineValue;
      index += 1;
      return args[index];
    };

    switch (flag) {
      case "--in-dir":
        options.inDir = path.resolve(ROOT, String(readValue() ?? ""));
        break;
      case "--file":
        options.file = path.resolve(ROOT, String(readValue() ?? ""));
        break;
      case "--dataset":
        options.dataset = String(readValue() ?? "").toLowerCase();
        break;
      case "--data-dir":
        options.dataDir = path.resolve(ROOT, String(readValue() ?? ""));
        break;
      case "--dry-run":
        options.dryRun = true;
        break;
      case "-h":
      case "--help":
        options.help = true;
        break;
      default:
        throw new Error(`未知参数：${arg}（使用 --help 查看用法）`);
    }
  }

  if (options.dataset && !DATASETS.some((dataset) => dataset.key === options.dataset)) {
    const names = DATASETS.map((dataset) => dataset.key).join(" | ");
    throw new Error(`未知数据集「${options.dataset}」，可选：${names}`);
  }

  return options;
}

function resolveJobs(options) {
  if (options.file) {
    const base = path.basename(options.file).toLowerCase();
    const dataset = options.dataset
      ? DATASETS.find((item) => item.key === options.dataset)
      : DATASETS.find((item) => item.file.toLowerCase() === base);
    if (!dataset) {
      throw new Error(
        "无法从文件名识别数据集，请使用 --dataset fundings|jobs|tools 指定。",
      );
    }
    return [{ dataset, inputPath: options.file }];
  }

  const datasets = options.dataset
    ? DATASETS.filter((item) => item.key === options.dataset)
    : DATASETS;
  return datasets.map((dataset) => ({
    dataset,
    inputPath: path.join(options.inDir, dataset.file),
  }));
}

async function main() {
  const options = parseOptions(process.argv.slice(2));
  if (options.help) {
    printHelp();
    return;
  }

  const jobs = resolveJobs(options);

  console.log("📥 开始导入人工审核结果...");
  console.log(`   目录：${options.inDir}`);
  console.log(`   数据目录：${options.dataDir}`);
  if (options.dryRun) console.log("   🧪 预演模式：只统计，不写回 JSON。");

  const results = [];
  for (const { dataset, inputPath } of jobs) {
    results.push(await importDataset(dataset, inputPath, options));
  }

  const found = results.filter((result) => result.found);
  const failed = results.filter((result) => result.failed);
  const totals = results.reduce(
    (accumulator, result) => {
      if (!result.stats) return accumulator;
      for (const key of Object.keys(accumulator)) {
        accumulator[key] += result.stats[key];
      }
      return accumulator;
    },
    {
      rows: 0,
      matched: 0,
      statusChanged: 0,
      categoryChanged: 0,
      unchanged: 0,
      skipped: 0,
    },
  );

  console.log(`\n${"=".repeat(48)}`);
  console.log("📊 导入汇总");
  console.log(
    `   文件 ${found.length}/${jobs.length} | 读取 ${totals.rows} 行 | 匹配 ${totals.matched} 条`,
  );
  console.log(
    `   状态更新 ${totals.statusChanged} | 分类更新 ${totals.categoryChanged} | 未变 ${totals.unchanged} | 跳过 ${totals.skipped}`,
  );

  if (options.dryRun) {
    console.log("   🧪 预演模式：未修改任何 JSON 文件。");
  }

  if (found.length === 0) {
    console.warn(`   ⚠️ 在 ${options.inDir} 没有找到可导入的 Excel。请先运行 pnpm export:excel。`);
    process.exitCode = 1;
  } else if (failed.length > 0) {
    console.error(`   ❌ 有 ${failed.length} 个文件导入失败，请查看上方错误。`);
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(`\n❌ 导入失败：${error.message}`);
  process.exit(1);
});
