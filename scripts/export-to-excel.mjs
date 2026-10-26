import { readFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as XLSX from "xlsx";

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
// 默认输出到 docs/exports；需要导出到其他位置（CI、临时目录）时可用 EXPORT_OUT_DIR 覆盖。
const OUT_DIR = process.env.EXPORT_OUT_DIR
  ? path.resolve(process.env.EXPORT_OUT_DIR)
  : path.join(ROOT, "docs", "exports");

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// 文件被 Excel / WPS 打开时 Windows 会返回 EBUSY，重试后仍失败则给出可操作提示。
const LOCK_ERROR_CODES = new Set(["EBUSY", "EPERM", "EACCES"]);

async function writeWorkbook(workbook, outputPath) {
  const maxAttempts = 3;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      XLSX.writeFile(workbook, outputPath, { bookType: "xlsx", compression: true });
      return;
    } catch (error) {
      const locked = LOCK_ERROR_CODES.has(error.code);
      if (!locked || attempt === maxAttempts) {
        if (locked) {
          throw new Error(
            `${path.basename(outputPath)} 正被其他程序占用（${error.code}），请先关闭 Excel / WPS 中打开的同名文件后重试。`,
          );
        }
        throw error;
      }
      console.log(
        `   ⏳ ${path.basename(outputPath)} 正被占用，${(attempt * 1.5).toFixed(1)} 秒后重试（第 ${attempt}/${maxAttempts} 次）...`,
      );
      await sleep(1500 * attempt);
    }
  }
}

// 人工审核表的列配置：显式声明列顺序与中文表头，避免 JSON 字段顺序变化影响表格。
// 未在 columns 中声明、也不在 omit 里的字段会自动追加到末尾，保证不丢数据。
// 每条记录都有四个审核列：
//   审核状态     PENDING / PENDING_REVIEW（前端不展示）/ PUBLISHED（前端展示）
//   原始分类     抓取/清洗后的分类，只读对照
//   AI建议分类   DeepSeek 建议，可能为空
//   最终发布分类 初始等于原始分类，运营修改后由 import-from-excel.mjs 覆盖 JSON
const DATASETS = [
  {
    label: "资助机会",
    sheetName: "资助机会",
    output: "fundings.xlsx",
    source: path.join(ROOT, "src", "lib", "fundings-data.json"),
    categoryLabel: "资助领域",
    classificationField: "field",
    // 原始分类改用专门的「原始分类」列展示，避免同一信息出现两次。
    omit: ["field"],
    columns: [
      { key: "status", label: "审核状态", value: (record) => record.status || "PUBLISHED" },
      { key: "originalCategory", label: "原始分类", value: (record) => record.field ?? "" },
      { key: "aiSuggestedCategory", label: "AI建议分类", emptyText: "" },
      { key: "finalCategory", label: "最终发布分类", value: (record) => record.field ?? "" },
      { key: "id", label: "记录ID" },
      { key: "kind", label: "记录类型" },
      { key: "type", label: "资助类型" },
      { key: "supportType", label: "支持类型" },
      { key: "region", label: "地区" },
      { key: "location", label: "地点" },
      { key: "title", label: "标题" },
      { key: "org", label: "发布机构" },
      { key: "amount", label: "金额" },
      { key: "amountWan", label: "金额（万元）" },
      { key: "duration", label: "项目周期" },
      { key: "due", label: "截止日期" },
      { key: "dueDays", label: "剩余天数" },
      { key: "openStatus", label: "申报通道" },
      { key: "publishedDate", label: "发布日期" },
      { key: "publishedDays", label: "发布天数" },
      { key: "sourceName", label: "数据来源" },
      { key: "url", label: "原文链接", link: true },
      { key: "summary", label: "摘要" },
    ],
  },
  {
    label: "招聘岗位",
    sheetName: "招聘岗位",
    output: "jobs.xlsx",
    source: path.join(ROOT, "src", "lib", "jobs-scraped.json"),
    categoryLabel: "岗位类别",
    classificationField: "role",
    omit: ["role"],
    columns: [
      { key: "status", label: "审核状态", value: (record) => record.status || "PUBLISHED" },
      { key: "originalCategory", label: "原始分类", value: (record) => record.role ?? "" },
      { key: "aiSuggestedCategory", label: "AI建议分类", emptyText: "" },
      { key: "finalCategory", label: "最终发布分类", value: (record) => record.role ?? "" },
      { key: "id", label: "岗位ID" },
      { key: "category", label: "招聘类型" },
      { key: "kind", label: "工作性质" },
      { key: "title", label: "标题" },
      { key: "org", label: "机构" },
      { key: "location", label: "地点" },
      { key: "salary", label: "薪资" },
      { key: "due", label: "截止日期" },
      { key: "time", label: "发布时间" },
      { key: "publishedDays", label: "发布天数" },
      { key: "sourceName", label: "数据来源" },
      { key: "url", label: "原文链接", link: true },
      { key: "summary", label: "摘要" },
    ],
  },
  {
    label: "能力工具",
    sheetName: "能力工具",
    output: "tools.xlsx",
    source: path.join(ROOT, "src", "lib", "tools-data.json"),
    categoryLabel: "内容分类",
    classificationField: "category",
    // icon / color / tone / action 只服务于前端展示，对审核没有意义，导出时省略。
    omit: ["category", "icon", "color", "tone", "action"],
    columns: [
      { key: "status", label: "审核状态", value: (record) => record.status || "PUBLISHED" },
      { key: "originalCategory", label: "原始分类", value: (record) => record.category ?? "" },
      { key: "aiSuggestedCategory", label: "AI建议分类", emptyText: "" },
      { key: "finalCategory", label: "最终发布分类", value: (record) => record.category ?? "" },
      { key: "id", label: "资源ID" },
      { key: "title", label: "标题" },
      { key: "org", label: "机构" },
      { key: "domain", label: "领域" },
      { key: "format", label: "形式" },
      { key: "period", label: "周期" },
      { key: "isFree", label: "是否免费" },
      { key: "priceText", label: "价格说明" },
      { key: "tags", label: "标签" },
      { key: "dateText", label: "日期" },
      { key: "locationText", label: "地点" },
      { key: "publishDate", label: "发布日期" },
      { key: "publishedDays", label: "发布天数" },
      { key: "sourceName", label: "数据来源" },
      { key: "url", label: "原文链接", link: true },
      { key: "downloadUrl", label: "下载链接", link: true },
      { key: "summary", label: "摘要" },
    ],
  },
];

// 单元格值归一化：数组字段（如 tags）拼成逗号分隔的字符串，布尔值转成中文。
function toCellValue(value, column) {
  if (value === null || value === undefined) {
    return column?.emptyText ?? "";
  }
  if (Array.isArray(value)) {
    return value
      .map((item) => {
        if (item === null || item === undefined) return "";
        return typeof item === "object" ? JSON.stringify(item) : String(item);
      })
      .filter(Boolean)
      .join(", ");
  }
  if (typeof value === "boolean") return value ? "是" : "否";
  if (typeof value === "object") return JSON.stringify(value);
  return value;
}

// 计算展示宽度：中日韩字符按 2 个字符宽度估算，避免中文列过窄。
function displayWidth(value) {
  const text = String(value ?? "");
  let width = 0;
  for (const char of text) {
    width += /[\u2e80-\ua4cf\uf900-\ufaff\uff00-\uffef]/.test(char) ? 2 : 1;
  }
  return width;
}

function buildInstructionsSheet(dataset) {
  const sheet = XLSX.utils.aoa_to_sheet([
    ["字段", "说明"],
    [
      "审核状态",
      "PENDING = 待审核（前端不展示）；PUBLISHED = 已发布（前端展示）。历史记录没有 status 时按 PUBLISHED 导出。",
    ],
    ["原始分类", `抓取/清洗后的原始${dataset.categoryLabel}，仅作对照，请勿修改。`],
    [
      "AI建议分类",
      "DeepSeek 给出的建议，仅供参考；为空表示本次未抽样或调用失败。",
    ],
    [
      "最终发布分类",
      `运营确认后的${dataset.categoryLabel}。保持与原始分类一致表示认可；修改后导入会覆盖 JSON 中的 ${dataset.classificationField} 字段。`,
    ],
    [
      "操作步骤",
      "1) 修改「审核状态」和「最终发布分类」；2) 保存并关闭文件；3) 运行 pnpm import:excel。",
    ],
    [
      "注意",
      "不要修改记录 ID；不要删除或重命名必需列。新增列/改名的列会在导入时打印警告并被忽略。",
    ],
  ]);
  sheet["!cols"] = [{ wch: 18 }, { wch: 96 }];
  return sheet;
}

function buildSheet(columns, records) {
  const headers = columns.map((column) => column.label);
  const rows = records.map((record) =>
    columns.map((column) => {
      const raw =
        typeof column.value === "function" ? column.value(record) : record[column.key];
      return toCellValue(raw, column);
    }),
  );

  const sheet = XLSX.utils.aoa_to_sheet([headers, ...rows]);

  // 链接列写成 Excel 超链接，审核时可直接点开原帖。
  const linkColumnIndexes = columns
    .map((column, index) => (column.link ? index : -1))
    .filter((index) => index >= 0);
  for (let rowIndex = 0; rowIndex < records.length; rowIndex += 1) {
    for (const columnIndex of linkColumnIndexes) {
      const value = rows[rowIndex][columnIndex];
      if (typeof value !== "string" || !/^https?:\/\//i.test(value)) continue;
      const cell = sheet[XLSX.utils.encode_cell({ r: rowIndex + 1, c: columnIndex })];
      if (cell) cell.l = { Target: value };
    }
  }

  sheet["!cols"] = columns.map((column, index) => {
    const widest = rows.reduce(
      (max, row) => Math.max(max, displayWidth(row[index])),
      displayWidth(headers[index]),
    );
    return { wch: Math.min(Math.max(widest + 2, 10), 60) };
  });

  if (records.length > 0) {
    sheet["!autofilter"] = {
      ref: XLSX.utils.encode_range({
        s: { r: 0, c: 0 },
        e: { r: records.length, c: columns.length - 1 },
      }),
    };
  }

  return { sheet, rows };
}

async function exportDataset(dataset) {
  const raw = await readFile(dataset.source, "utf8");
  const records = JSON.parse(raw);
  if (!Array.isArray(records)) {
    throw new Error(`${dataset.label}：${dataset.source} 不是数组，无法导出`);
  }

  const configuredKeys = new Set(dataset.columns.map((column) => column.key));
  const omittedKeys = new Set(dataset.omit ?? []);
  const extraKeys = [
    ...new Set(
      records.flatMap((record) =>
        Object.keys(record).filter(
          (key) => !configuredKeys.has(key) && !omittedKeys.has(key),
        ),
      ),
    ),
  ].sort();

  if (extraKeys.length > 0) {
    console.log(
      `   ⚠️ 发现未配置字段，已追加到表格末尾: ${extraKeys.join(", ")}`,
    );
  }

  const columns = [
    ...dataset.columns,
    ...extraKeys.map((key) => ({ key, label: key })),
  ];

  const { sheet } = buildSheet(columns, records);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, buildInstructionsSheet(dataset), "使用说明");
  XLSX.utils.book_append_sheet(workbook, sheet, dataset.sheetName);

  const outputPath = path.join(OUT_DIR, dataset.output);
  await writeWorkbook(workbook, outputPath);

  console.log(
    `   ✅ ${dataset.label}: ${records.length} 条 / ${columns.length} 列 → ${path.relative(ROOT, outputPath)}`,
  );
  return records.length;
}

async function main() {
  console.log("🚀 开始导出审核用 Excel 表格...\n");
  await mkdir(OUT_DIR, { recursive: true });

  let total = 0;
  for (const dataset of DATASETS) {
    console.log(`📄 正在导出 ${dataset.label} ...`);
    total += await exportDataset(dataset);
  }

  console.log(`\n🎉 导出完成，共 ${total} 条记录，文件位于 ${OUT_DIR}`);
}

main().catch((error) => {
  console.error(`❌ 导出失败: ${error.message}`);
  process.exit(1);
});
