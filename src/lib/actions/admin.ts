"use server";

import { revalidatePath } from "next/cache";
import * as XLSX from "xlsx";
import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import {
  isPublishModuleSlug,
  moduleHref,
  publicInterestFields,
  publishModuleByContentModule,
  publishModules,
  type PublishModuleConfig,
  type PublishModuleSlug,
} from "@/lib/publishing";

async function requireAdmin() {
  const session = await auth();
  if (session?.user?.role !== "ADMIN" || !session.user.id) {
    throw new Error("Forbidden");
  }
  return session;
}

export type AdminContentState = {
  success?: boolean;
  contentId?: string;
  message?: string;
  error?: string;
  fieldErrors?: Record<string, string[]>;
};

export type AdminImportState = {
  success?: boolean;
  message?: string;
  error?: string;
  imported?: number;
  failed?: number;
  warnings?: string[];
  errors?: string[];
};

const adminContentSchema = z.object({
  moduleSlug: z.string().trim(),
  subtype: z.string().trim().min(1, "请选择内容类型"),
  title: z.string().trim().min(4, "标题至少 4 个字符").max(100, "标题最多 100 个字符"),
  summary: z.string().trim().max(120, "简介最多 120 个字符").optional(),
  body: z.string().trim().min(10, "正文至少 10 个字符").max(5000, "正文最多 5000 个字符"),
  tags: z.string().trim().max(300, "标签内容过长").optional(),
  region: z.string().trim().min(1, "请选择省份/地区").max(40, "地区名称过长"),
  city: z.string().trim().min(1, "请选择城市").max(40, "城市名称过长"),
});

function parseTags(value: string | undefined) {
  return [...new Set(
    String(value ?? "")
      .split(/[,，、;\n|]/)
      .map((tag) => tag.trim().replace(/^#|#$/g, ""))
      .filter(Boolean),
  )].slice(0, 10);
}

export async function createAdminContent(
  _previous: AdminContentState,
  formData: FormData,
): Promise<AdminContentState> {
  const session = await requireAdmin();

  const parsed = adminContentSchema.safeParse({
    moduleSlug: formData.get("moduleSlug"),
    subtype: formData.get("subtype"),
    title: formData.get("title"),
    summary: formData.get("summary") || undefined,
    body: formData.get("body"),
    tags: formData.get("tags") || undefined,
    region: String(formData.get("region") ?? ""),
    city: String(formData.get("city") ?? ""),
  });

  if (!parsed.success) {
    return { fieldErrors: parsed.error.flatten().fieldErrors };
  }

  const values = parsed.data;
  if (!isPublishModuleSlug(values.moduleSlug)) return { error: "内容模块无效" };
  const config = publishModules[values.moduleSlug];
  if (!config.subtypes.includes(values.subtype)) {
    return { error: `内容类型不属于${config.label}` };
  }

  const fields = [...new Set(
    formData.getAll("fields")
      .map(String)
      .filter((field) => publicInterestFields.includes(field)),
  )];
  const now = new Date();

  const content = await prisma.content.create({
    data: {
      authorId: session.user.id,
      module: config.module,
      subtype: values.subtype,
      title: values.title,
      summary: values.summary || null,
      body: values.body,
      fields,
      tags: parseTags(values.tags),
      region: values.region,
      city: values.city,
      metadata: { source: "admin-manual" },
      // 管理员手动发布不进入审核队列，状态强制为 PUBLISHED。
      status: "PUBLISHED",
      submittedAt: now,
      reviewedAt: now,
      publishedAt: now,
    },
  });

  revalidatePath("/admin", "layout");
  revalidatePath("/admin/publish");
  revalidatePath("/admin/review");
  revalidatePath("/account/content");
  revalidatePath(moduleHref[config.module]);

  return {
    success: true,
    contentId: content.id,
    message: `已发布到${config.label}。`,
  };
}

export async function approveContent(contentId: string, formData: FormData) {
  await requireAdmin();

  const existing = await prisma.content.findUnique({
    where: { id: contentId },
    select: { module: true, status: true, subtype: true },
  });
  if (!existing || existing.status !== "PENDING_REVIEW") {
    throw new Error("内容不存在或已被处理");
  }

  const config = publishModuleByContentModule[existing.module];
  // 审核员可在通过前修正分类；列表页快速通过未传分类时保留原值。
  const category = String(formData.get("category") ?? "").trim() || existing.subtype;
  if (!config.subtypes.includes(category)) {
    throw new Error(`分类「${category}」不属于${config.label}`);
  }

  const now = new Date();
  const content = await prisma.$transaction(async (tx) => {
    const updated = await tx.content.updateMany({
      where: { id: contentId, status: "PENDING_REVIEW" },
      data: {
        subtype: category,
        status: "PUBLISHED",
        reviewedAt: now,
        publishedAt: now,
        rejectionReason: null,
      },
    });
    if (updated.count !== 1) throw new Error("内容不存在或已被处理");
    return tx.content.findUniqueOrThrow({ where: { id: contentId } });
  });
  await prisma.notification.create({
    data: {
      userId: content.authorId,
      type: "REVIEW_RESULT",
      title: "审核通过",
      message: `“${content.title}”已发布。`,
      href: moduleHref[content.module],
    },
  });
  revalidatePath("/admin", "layout");
  revalidatePath("/admin/review");
  revalidatePath("/account/content");
  revalidatePath(moduleHref[content.module]);
}

export async function rejectContent(contentId: string, formData: FormData) {
  await requireAdmin();
  const rejectionReason = String(
    formData.get("rejectionReason") ?? formData.get("reason") ?? "",
  ).trim();
  if (!rejectionReason) throw new Error("请填写拒绝原因");
  if (rejectionReason.length > 200) throw new Error("拒绝原因最多 200 个字符");

  const content = await prisma.$transaction(async (tx) => {
    const updated = await tx.content.updateMany({
      where: { id: contentId, status: "PENDING_REVIEW" },
      data: { status: "REJECTED", reviewedAt: new Date(), rejectionReason },
    });
    if (updated.count !== 1) throw new Error("内容不存在或已被处理");
    return tx.content.findUniqueOrThrow({ where: { id: contentId } });
  });
  await prisma.notification.create({
    data: {
      userId: content.authorId,
      type: "REVIEW_RESULT",
      title: "内容需要修改",
      message: `“${content.title}”未通过审核：${rejectionReason}`,
      href: "/account/content",
    },
  });
  revalidatePath("/admin", "layout");
  revalidatePath("/admin/review");
  revalidatePath("/account/content");
}

const IMPORT_FILE_SIZE_LIMIT = 8 * 1024 * 1024;
const IMPORT_ROW_LIMIT = 500;

const HEADER_ALIASES = {
  module: ["模块", "内容模块", "所属模块", "module", "contentmodule", "分类", "category"],
  subtype: ["工作性质", "类型", "内容类型", "子类型", "资助类型", "支持类型", "subtype", "type"],
  finalCategory: ["最终发布分类", "最终分类", "发布分类", "finalCategory", "final_category"],
  title: ["标题", "title", "名称", "name"],
  summary: ["摘要", "简介", "summary", "description"],
  body: ["正文", "内容", "详情", "body", "content", "detail"],
  fields: ["领域", "公益领域", "资助领域", "分类标签", "原始分类", "最终发布分类", "最终分类", "发布分类", "fields", "field"],
  tags: ["标签", "tags", "tag"],
  region: ["省份", "地区", "地点", "region", "province"],
  city: ["城市", "city"],
  metadata: ["元数据", "metadata"],
} as const;

type ImportField = keyof typeof HEADER_ALIASES;

const MODULE_ALIASES = new Map<string, PublishModuleSlug>([
  ["update", "updates"],
  ["updates", "updates"],
  ["项目动态", "updates"],
  ["动态", "updates"],
  ["公益项目", "updates"],
  ["公益活动", "updates"],
  ["funding", "funding"],
  ["fundings", "funding"],
  ["资金与物资", "funding"],
  ["资金物资", "funding"],
  ["资金", "funding"],
  ["物资", "funding"],
  ["资助", "funding"],
  ["资助机会", "funding"],
  ["资金资助", "funding"],
  ["物资资助", "funding"],
  ["job", "jobs"],
  ["jobs", "jobs"],
  ["人力资源", "jobs"],
  ["招聘", "jobs"],
  ["招聘岗位", "jobs"],
  ["岗位", "jobs"],
  ["全职", "jobs"],
  ["兼职", "jobs"],
  ["实习", "jobs"],
  ["志愿者", "jobs"],
  ["顾问", "jobs"],
  ["tool", "tools"],
  ["tools", "tools"],
  ["能力工具", "tools"],
  ["工具", "tools"],
  ["课程", "tools"],
  ["培训课程", "tools"],
  ["行业沙龙会议", "tools"],
  ["公益工具模板库", "tools"],
  ["行业报告", "tools"],
  ["行业标准", "tools"],
  ["同行经验文章", "tools"],
  ["国际经验", "tools"],
]);

function normalizeHeader(value: string) {
  return value.trim().toLowerCase().replace(/[\s_\-（）()/]/g, "");
}

const NORMALIZED_HEADER_ALIASES = Object.fromEntries(
  Object.entries(HEADER_ALIASES).map(([key, aliases]) => [
    key,
    new Set(aliases.map((alias) => normalizeHeader(alias))),
  ]),
) as Record<ImportField, Set<string>>;

function normalizeRecord(record: Record<string, unknown>) {
  const normalized: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(record)) {
    const header = normalizeHeader(key);
    if (header && !(header in normalized)) normalized[header] = value;
  }
  return normalized;
}

function valueFor(record: Record<string, unknown>, field: ImportField) {
  for (const alias of NORMALIZED_HEADER_ALIASES[field]) {
    const value = record[alias];
    if (value === null || value === undefined) continue;
    if (typeof value === "string" && value.trim() === "") continue;
    return value;
  }
  return undefined;
}

function stringValue(value: unknown) {
  if (value === null || value === undefined) return "";
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (typeof value === "object") return JSON.stringify(value);
  return String(value).trim();
}

function stringList(value: unknown): string[] {
  if (Array.isArray(value)) {
    return [...new Set(value.flatMap((item) => stringList(item)))].filter(Boolean);
  }
  const text = stringValue(value);
  if (!text) return [];
  return [...new Set(
    text
      .split(/[,，、;\n|]/)
      .map((item) => item.trim().replace(/^#|#$/g, ""))
      .filter(Boolean),
  )];
}

function resolveModule(value: unknown, fallback: PublishModuleSlug | null) {
  const key = normalizeHeader(stringValue(value));
  if (!key) return fallback;
  if (isPublishModuleSlug(key)) return key;
  return MODULE_ALIASES.get(key) ?? null;
}

const SUBTYPE_ALIASES = new Map<string, string>([
  ["资金", "资金资助"],
  ["资金资助", "资金资助"],
  ["基金会资助", "资金资助"],
  ["其他机构资助", "资金资助"],
  ["资助", "资金资助"],
  ["物资", "物资资助"],
  ["物资资助", "物资资助"],
  ["物资捐赠", "物资资助"],
  ["人员招聘", "全职"],
  ["项目动态", "公益项目"],
]);

function resolveSubtype(
  config: PublishModuleConfig,
  rawValue: string,
  finalCategory: string,
) {
  const raw = rawValue.trim();
  if (!raw) {
    if (finalCategory && config.subtypes.includes(finalCategory)) {
      return finalCategory;
    }
    return config.subtypes[0];
  }
  if (config.subtypes.includes(raw)) return raw;
  const mapped = SUBTYPE_ALIASES.get(normalizeHeader(raw));
  if (mapped && config.subtypes.includes(mapped)) return mapped;
  return raw;
}

function parseMetadata(value: unknown, fileName: string): Prisma.InputJsonValue {
  const metadata: Record<string, unknown> = {
    source: "admin-import",
    fileName,
  };
  const parsed = typeof value === "string" ? (() => {
    try {
      return JSON.parse(value) as unknown;
    } catch {
      return null;
    }
  })() : value;
  if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
    for (const [key, item] of Object.entries(parsed)) {
      if (["source", "fileName"].includes(key)) continue;
      metadata[key] = item;
    }
  }
  return metadata as Prisma.InputJsonValue;
}


type ParsedUpload = {
  records: Record<string, unknown>[];
  firstDataLine: number;
  sheetName: string;
};

function hasHeader(headers: Set<string>, field: ImportField) {
  for (const alias of NORMALIZED_HEADER_ALIASES[field]) {
    if (headers.has(alias)) return true;
  }
  return false;
}

function parseJsonUpload(buffer: Buffer): ParsedUpload {
  const text = buffer.toString("utf8").replace(/^\uFEFF/, "");
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error("JSON 文件格式错误，无法解析");
  }

  const candidate = Array.isArray(parsed)
    ? parsed
    : parsed && typeof parsed === "object"
      ? (parsed as Record<string, unknown>).items
        ?? (parsed as Record<string, unknown>).data
        ?? (parsed as Record<string, unknown>).contents
      : null;

  if (!Array.isArray(candidate)) {
    throw new Error("JSON 顶层必须是数组，或包含 items / data / contents 数组");
  }

  const records = candidate.filter(
    (item): item is Record<string, unknown> =>
      Boolean(item) && typeof item === "object" && !Array.isArray(item),
  );
  return { records, firstDataLine: 1, sheetName: "JSON" };
}

function parseWorkbookUpload(buffer: Buffer): ParsedUpload {
  let workbook: XLSX.WorkBook;
  try {
    workbook = XLSX.read(buffer, { type: "buffer", cellDates: false });
  } catch {
    throw new Error("Excel 文件格式错误，无法解析");
  }

  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName];
    const matrix = XLSX.utils.sheet_to_json(sheet, {
      header: 1,
      defval: "",
      raw: false,
      blankrows: false,
    }) as unknown[][];

    const headerRowIndex = matrix.slice(0, 20).findIndex((row) => {
      const headers = new Set(
        row.map((cell) => normalizeHeader(stringValue(cell))).filter(Boolean),
      );
      return hasHeader(headers, "title")
        && (hasHeader(headers, "body") || hasHeader(headers, "summary") || hasHeader(headers, "module"));
    });
    if (headerRowIndex === -1) continue;

    const headerRow = matrix[headerRowIndex] ?? [];
    const headers = headerRow.map((cell) => stringValue(cell));
    const records: Record<string, unknown>[] = [];

    for (let rowIndex = headerRowIndex + 1; rowIndex < matrix.length; rowIndex += 1) {
      const row = matrix[rowIndex];
      if (!Array.isArray(row)) continue;
      if (row.every((cell) => stringValue(cell) === "")) continue;
      const record: Record<string, unknown> = {};
      headers.forEach((header, columnIndex) => {
        if (header) record[header] = row[columnIndex] ?? "";
      });
      records.push(record);
    }

    return {
      records,
      firstDataLine: headerRowIndex + 2,
      sheetName,
    };
  }

  throw new Error("未找到可导入的数据表：表头需要包含「标题」，以及「正文 / 摘要 / 模块」中的至少一列");
}

async function parseUpload(file: File): Promise<ParsedUpload> {
  const fileName = file.name.toLowerCase();
  const buffer = Buffer.from(await file.arrayBuffer());
  if (fileName.endsWith(".json")) return parseJsonUpload(buffer);
  if (fileName.endsWith(".xlsx") || fileName.endsWith(".xls")) {
    return parseWorkbookUpload(buffer);
  }
  throw new Error("仅支持 .xlsx、.xls、.json 文件");
}


export async function bulkImportContent(
  _previous: AdminImportState,
  formData: FormData,
): Promise<AdminImportState> {
  const session = await requireAdmin();

  const file = formData.get("file");
  if (!file || typeof file === "string" || file.size === 0) {
    return { error: "请选择要上传的 Excel 或 JSON 文件" };
  }
  if (file.size > IMPORT_FILE_SIZE_LIMIT) {
    return { error: "文件不能超过 8MB，请拆分后再上传" };
  }

  const defaultModuleRaw = String(formData.get("defaultModule") ?? "").trim();
  const defaultModule = resolveModule(defaultModuleRaw, null);
  if (defaultModuleRaw && !defaultModule) {
    return { error: "默认模块无效，请选择项目动态 / 资金与物资 / 人力资源 / 能力工具" };
  }

  let parsed: ParsedUpload;
  try {
    parsed = await parseUpload(file);
  } catch (error) {
    return { error: error instanceof Error ? error.message : "文件解析失败" };
  }

  if (parsed.records.length === 0) {
    return { error: "文件里没有可导入的数据行" };
  }
  if (parsed.records.length > IMPORT_ROW_LIMIT) {
    return { error: `单次最多导入 ${IMPORT_ROW_LIMIT} 行，请拆分文件后再上传` };
  }

  const now = new Date();
  const data: Prisma.ContentCreateManyInput[] = [];
  const errors: string[] = [];
  const warnings: string[] = [];
  const touchedModules = new Set<string>();

  parsed.records.forEach((rawRecord, index) => {
    const line = parsed.firstDataLine + index;
    const record = normalizeRecord(rawRecord);

    const moduleValue = valueFor(record, "module");
    let fieldsValue = valueFor(record, "fields");
    let moduleSlug = resolveModule(moduleValue, defaultModule);

    // 「分类」列既可能是模块，也可能是公益领域。无法识别为模块时，
    // 如果有默认模块，就把该值当作领域处理。
    if (!moduleSlug && defaultModule) {
      if (moduleValue !== undefined && fieldsValue === undefined) {
        fieldsValue = moduleValue;
      }
      moduleSlug = defaultModule;
      warnings.push(`第 ${line} 行：模块「${stringValue(moduleValue)}」无法识别，已按默认模块发布`);
    }
    if (!moduleSlug) {
      errors.push(`第 ${line} 行：无法识别内容模块，请增加「模块」列或选择默认模块`);
      return;
    }

    const config = publishModules[moduleSlug];
    const subtypeRaw = stringValue(valueFor(record, "subtype"));
    const finalCategory = stringValue(valueFor(record, "finalCategory"));
    const subtype = resolveSubtype(config, subtypeRaw, finalCategory);
    if (!config.subtypes.includes(subtype)) {
      warnings.push(`第 ${line} 行：类型「${subtype}」不在${config.label}标准类型中，已按原文导入`);
    }

    const title = stringValue(valueFor(record, "title"));
    if (!title) {
      errors.push(`第 ${line} 行：缺少标题`);
      return;
    }
    if (title.length > 100) {
      errors.push(`第 ${line} 行：标题超过 100 个字符`);
      return;
    }

    const rawSummary = stringValue(valueFor(record, "summary"));
    const rawBody = stringValue(valueFor(record, "body")) || rawSummary;
    if (!rawBody) {
      errors.push(`第 ${line} 行：缺少正文或摘要`);
      return;
    }
    if (rawSummary.length > 120) {
      warnings.push(`第 ${line} 行：摘要超过 120 个字符，已截断`);
    }
    if (rawBody.length > 5000) {
      warnings.push(`第 ${line} 行：正文超过 5000 个字符，已截断`);
    }
    const summary = rawSummary.slice(0, 120) || null;
    const body = rawBody.slice(0, 5000);

    const fields = stringList(fieldsValue)
      .filter((field) => publicInterestFields.includes(field))
      .slice(0, 12);
    const tags = stringList(valueFor(record, "tags")).slice(0, 10);
    const region = stringValue(valueFor(record, "region")).slice(0, 40) || null;
    const city = stringValue(valueFor(record, "city")).slice(0, 40) || null;

    data.push({
      authorId: session.user.id,
      module: config.module,
      subtype,
      title,
      summary,
      body,
      fields,
      tags,
      region,
      city,
      metadata: parseMetadata(valueFor(record, "metadata"), file.name),
      // 批量导入同样强制发布，表格里的 status 列会被忽略。
      status: "PUBLISHED",
      submittedAt: now,
      reviewedAt: now,
      publishedAt: now,
    });
    touchedModules.add(moduleHref[config.module]);
  });

  if (data.length === 0) {
    return {
      error: "没有可导入的有效数据，请检查标题、正文、模块和类型",
      failed: errors.length,
      errors: errors.slice(0, 20),
    };
  }

  let imported = 0;
  try {
    const result = await prisma.content.createMany({ data });
    imported = result.count;
  } catch (error) {
    console.error("bulkImportContent failed", error);
    return { error: "批量写入数据库失败，请稍后重试" };
  }

  revalidatePath("/admin", "layout");
  revalidatePath("/admin/publish");
  revalidatePath("/admin/review");
  revalidatePath("/account/content");
  for (const href of touchedModules) revalidatePath(href);

  return {
    success: true,
    imported,
    failed: errors.length,
    message: `已导入并发布 ${imported} 条内容${errors.length > 0 ? `，跳过 ${errors.length} 条` : ""}。`,
    warnings: warnings.slice(0, 20),
    errors: errors.slice(0, 20),
  };
}
