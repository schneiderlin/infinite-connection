"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { ContentStatus, Prisma } from "@prisma/client";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import {
  isPublishModuleSlug,
  moduleHref,
  publicInterestFields,
  publishModuleByContentModule,
  publishModules,
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

export type AdminEditState = {
  success?: boolean;
  contentId?: string;
  message?: string;
  error?: string;
  fieldErrors?: Record<string, string[]>;
};

const adminEditSchema = z.object({
  contentId: z.string().min(1),
  moduleSlug: z.string().trim(),
  subtype: z.string().trim().min(1, "请选择内容类型"),
  title: z.string().trim().min(1, "请填写标题").max(100, "标题最多 100 个字符"),
  summary: z.string().trim().max(120, "简介最多 120 个字符").optional(),
  body: z.string().trim().min(1, "请填写正文").max(5000, "正文最多 5000 个字符"),
  region: z.string().trim().max(40, "地区名称过长").optional(),
  city: z.string().trim().max(40, "城市名称过长").optional(),
  metadataJson: z.string(),
});

const editableMetadataKeys = [
  "direction", "amount", "currency", "validUntil", "requirements",
  "applicationUrl", "contactName", "contactEmail", "contactPhone", "contactWechat",
  "headcount", "workMode", "remote", "salaryMin", "salaryMax", "salaryUnit",
  "education", "experience", "requirementsText", "benefits", "applicationEmail",
  "applicationLink", "urgent", "deadline", "priceType", "price", "provider",
  "relatedLinks", "periodStart", "periodEnd", "ongoing", "copyrightConfirmed",
] as const;

function revalidateContentRoutes(module: keyof typeof moduleHref) {
  revalidatePath("/admin", "layout");
  revalidatePath("/admin/content", "layout");
  revalidatePath("/account/content");
  revalidatePath(moduleHref[module]);
}

export async function updateAdminContent(
  _previous: AdminEditState,
  formData: FormData,
): Promise<AdminEditState> {
  const session = await requireAdmin();
  const parsed = adminEditSchema.safeParse({
    contentId: formData.get("contentId"),
    moduleSlug: formData.get("moduleSlug"),
    subtype: formData.get("subtype"),
    title: formData.get("title"),
    summary: formData.get("summary") || undefined,
    body: formData.get("body"),
    region: formData.get("region") || undefined,
    city: formData.get("city") || undefined,
    metadataJson: formData.get("metadataJson") ?? "{}",
  });
  if (!parsed.success) return { fieldErrors: parsed.error.flatten().fieldErrors };

  const values = parsed.data;
  if (!isPublishModuleSlug(values.moduleSlug)) return { error: "内容模块无效" };
  const config = publishModules[values.moduleSlug];
  const existing = await prisma.content.findUnique({
    where: { id: values.contentId },
    select: { id: true, module: true, subtype: true },
  });
  if (!existing || existing.module !== config.module) return { error: "内容不存在或模块不匹配" };
  if (!config.subtypes.includes(values.subtype) && values.subtype !== existing.subtype) {
    return { error: `内容类型不属于${config.label}` };
  }

  let metadata: Prisma.JsonObject;
  try {
    const value = JSON.parse(values.metadataJson) as unknown;
    if (!value || Array.isArray(value) || typeof value !== "object") {
      return { fieldErrors: { metadataJson: ["扩展数据必须是 JSON 对象"] } };
    }
    metadata = value as Prisma.JsonObject;
  } catch {
    return { fieldErrors: { metadataJson: ["扩展数据不是有效的 JSON"] } };
  }

  for (const key of editableMetadataKeys) {
    if (!formData.has(key)) continue;
    const value = String(formData.get(key) ?? "").trim();
    if (value) metadata[key] = value;
    else delete metadata[key];
  }
  // 爬虫下次同步时保留管理员人工修订，不用新快照覆盖。
  metadata.adminEdited = "true";

  const fields = [...new Set(
    formData.getAll("fields").map(String).filter((field) => publicInterestFields.includes(field)),
  )];
  const tags = parseTags(String(formData.get("tags") ?? ""));
  const attachmentIds = [...new Set(formData.getAll("attachmentIds").map(String).filter(Boolean))];
  if (attachmentIds.length > 6) return { error: "每篇内容最多上传 6 张图片" };

  if (attachmentIds.length > 0) {
    const attachments = await prisma.attachment.findMany({
      where: { id: { in: attachmentIds } },
      select: { id: true, ownerId: true, contentId: true },
    });
    if (attachments.length !== attachmentIds.length) return { error: "部分图片不存在，请重新上传" };
    const invalid = attachments.find((attachment) =>
      attachment.contentId !== existing.id
      && (attachment.contentId !== null || attachment.ownerId !== session.user.id),
    );
    if (invalid) return { error: "部分图片无权使用，请重新上传" };
  }

  await prisma.content.update({
    where: { id: existing.id },
    data: {
      subtype: values.subtype,
      title: values.title,
      summary: values.summary || null,
      body: values.body,
      fields,
      tags,
      region: values.region || null,
      city: values.city || null,
      metadata,
      attachments: { set: attachmentIds.map((id) => ({ id })) },
    },
  });
  revalidateContentRoutes(existing.module);
  return { success: true, message: "内容已更新，前台会显示最新信息。" };
}

export async function setAdminContentStatus(contentId: string, status: ContentStatus) {
  await requireAdmin();
  if (status !== "PUBLISHED" && status !== "UNPUBLISHED") {
    throw new Error("不支持的内容状态");
  }
  const existing = await prisma.content.findUnique({
    where: { id: contentId },
    select: { module: true, metadata: true },
  });
  if (!existing) throw new Error("内容不存在");

  const now = new Date();
  const metadata = existing.metadata && typeof existing.metadata === "object" && !Array.isArray(existing.metadata)
    ? { ...(existing.metadata as Prisma.JsonObject) }
    : {};
  if (status === "UNPUBLISHED") metadata.adminHidden = "true";
  else delete metadata.adminHidden;
  await prisma.content.update({
    where: { id: contentId },
    data: status === "PUBLISHED"
      ? { status, metadata, publishedAt: now, reviewedAt: now, deletedAt: null, rejectionReason: null }
      : { status, metadata, deletedAt: null },
  });
  revalidateContentRoutes(existing.module);
}

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

