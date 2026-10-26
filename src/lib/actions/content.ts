"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import {
  isPublishModuleSlug,
  moduleHref,
  publicInterestFields,
  publishModules,
} from "@/lib/publishing";

export type ContentFormState = {
  success?: boolean;
  contentId?: string;
  message?: string;
  error?: string;
  fieldErrors?: Record<string, string[]>;
};

const contentInputSchema = z.object({
  moduleSlug: z.string(),
  contentId: z.string().optional(),
  intent: z.enum(["draft", "submit"]),
  subtype: z.string().trim(),
  title: z.string().trim().max(100, "标题最多100个字符"),
  body: z.string().trim().max(5000, "正文最多5000个字符"),
  region: z.string().trim().optional(),
  city: z.string().trim().optional(),
});

const metadataKeys = [
  "direction", "amount", "currency", "validUntil", "requirements",
  "applicationUrl", "contactName", "contactEmail", "contactPhone", "contactWechat",
  "headcount", "workMode", "remote", "salaryMin", "salaryMax", "salaryUnit",
  "education", "experience", "requirementsText", "benefits", "applicationEmail",
  "applicationLink", "urgent", "deadline", "priceType", "price", "provider",
  "relatedLinks", "periodStart", "periodEnd", "ongoing", "copyrightConfirmed",
] as const;

export async function saveContent(
  _previous: ContentFormState,
  formData: FormData,
): Promise<ContentFormState> {
  const session = await auth();
  if (!session?.user) return { error: "请先登录后再发布" };

  const parsed = contentInputSchema.safeParse({
    moduleSlug: formData.get("moduleSlug"),
    contentId: formData.get("contentId") || undefined,
    intent: formData.get("intent"),
    subtype: formData.get("subtype"),
    title: formData.get("title"),
    body: formData.get("body"),
    region: formData.get("region") || undefined,
    city: formData.get("city") || undefined,
  });

  if (!parsed.success) {
    return { fieldErrors: parsed.error.flatten().fieldErrors };
  }

  const values = parsed.data;
  if (!isPublishModuleSlug(values.moduleSlug)) return { error: "发布板块不存在" };
  const config = publishModules[values.moduleSlug];
  if (!config.subtypes.includes(values.subtype)) return { error: "内容类型无效" };
  if (config.organizationOnly && session.user.accountType !== "ORGANIZATION") {
    return { error: "该板块仅允许机构用户发布" };
  }

  const metadata = Object.fromEntries(
    metadataKeys
      .map((key) => [key, String(formData.get(key) ?? "").trim()] as const)
      .filter(([, value]) => value.length > 0),
  );
  const fields = formData.getAll("fields").map(String).filter(Boolean);
  const tags = String(formData.get("tags") ?? "")
    .split(/[,，\n]/)
    .map((tag) => tag.trim().replace(/^#|#$/g, ""))
    .filter(Boolean)
    .slice(0, 10);
  const attachmentIds = [...new Set(formData.getAll("attachmentIds").map(String).filter(Boolean))];
  // 普通用户点击“发布”后进入待审核队列，草稿仍保存为 DRAFT。
  const nextStatus = values.intent === "submit" ? "PENDING_REVIEW" : "DRAFT";

  if (attachmentIds.length > 6) return { error: "每篇内容最多上传6张图片" };

  if (values.intent === "submit") {
    const fieldErrors: Record<string, string[]> = {};
    if (!values.region) fieldErrors.region = ["请选择省份/地区"];
    if (!values.city) fieldErrors.city = ["请选择城市"];
    if (values.title.length < 4 || values.title === "未命名草稿") fieldErrors.title = ["标题至少4个字符"];
    if (values.body.length < 10) fieldErrors.body = ["正文至少10个字符"];
    if (fields.length === 0 || fields.some((field) => !publicInterestFields.includes(field))) {
      fieldErrors.fields = ["请至少选择一个有效领域"];
    }
    if (values.moduleSlug === "funding" && !["提供资源", "寻求资源"].includes(metadata.direction)) {
      fieldErrors.direction = ["请选择发布方向"];
    }
    if (values.moduleSlug === "updates" && !metadata.contactPhone && !metadata.contactWechat) {
      fieldErrors.contactPhone = ["请至少填写手机号码或微信号"];
    }
    if (metadata.contactPhone && !/^[0-9+()\s-]{6,30}$/.test(metadata.contactPhone)) {
      fieldErrors.contactPhone = ["请输入有效的手机号码"];
    }
    if (metadata.contactWechat && metadata.contactWechat.length > 50) {
      fieldErrors.contactWechat = ["微信号最多50个字符"];
    }
    if (values.moduleSlug === "tools" && metadata.copyrightConfirmed !== "true") {
      fieldErrors.copyrightConfirmed = ["请确认拥有内容版权或合法授权"];
    }
    const urlFields = ["applicationUrl", "applicationLink"] as const;
    for (const key of urlFields) {
      const value = metadata[key];
      if (value && !z.string().url().safeParse(value).success) fieldErrors[key] = ["请输入完整有效的网址"];
    }
    const relatedLinks = metadata.relatedLinks?.split(/\r?\n/).map((link) => link.trim()).filter(Boolean) ?? [];
    const linkLimit = values.moduleSlug === "updates" ? 5 : 3;
    if (relatedLinks.length > linkLimit || relatedLinks.some((link) => !z.string().url().safeParse(link).success)) {
      fieldErrors.relatedLinks = [`相关链接最多${linkLimit}条，且必须是完整有效的网址`];
    }
    for (const key of ["contactEmail", "applicationEmail"] as const) {
      const value = metadata[key];
      if (value && !z.string().email().safeParse(value).success) fieldErrors[key] = ["请输入有效邮箱"];
    }
    if (values.moduleSlug === "jobs" && !metadata.applicationEmail && !metadata.applicationLink) {
      fieldErrors.applicationEmail = ["请至少填写投递邮箱或投递链接"];
    }
    if (Object.keys(fieldErrors).length > 0) return { fieldErrors };
  }

  if (values.contentId) {
    const existing = await prisma.content.findFirst({
      where: { id: values.contentId, authorId: session.user.id, module: config.module },
      select: { id: true, status: true },
    });
    if (!existing) return { error: "内容不存在或无权编辑" };
    if (!["DRAFT", "REJECTED"].includes(existing.status)) {
      return { error: "当前状态不能编辑" };
    }
  }

  // 防止把其他用户的图片，或已经属于其他内容的图片挂到当前内容上。
  if (attachmentIds.length > 0) {
    const attachments = await prisma.attachment.findMany({
      where: { id: { in: attachmentIds } },
      select: { id: true, ownerId: true, contentId: true },
    });
    if (attachments.length !== attachmentIds.length) {
      return { error: "部分图片不存在，请重新上传" };
    }
    const currentContentId = values.contentId ?? null;
    const invalidAttachment = attachments.find(
      (attachment) =>
        attachment.ownerId !== session.user.id
        || (attachment.contentId !== null && attachment.contentId !== currentContentId),
    );
    if (invalidAttachment) return { error: "部分图片无权使用，请重新上传" };
  }

  const now = new Date();
  const isSubmittingForReview = values.intent === "submit";
  const data = {
    module: config.module,
    subtype: values.subtype,
    title: values.title || "未命名草稿",
    // 发布表单已移除“简介”，同时清空历史内容上的旧摘要，避免前台重复展示。
    summary: null,
    body: values.body,
    fields,
    tags,
    region: values.region || null,
    city: values.city || null,
    metadata,
    status: nextStatus,
    rejectionReason: null,
    submittedAt: isSubmittingForReview ? now : null,
    reviewedAt: null,
    publishedAt: null,
  } as const;

  const attachmentConnections = attachmentIds.map((id) => ({ id }));
  // 在内容写入的同一次请求中同步附件关系：
  // 新建用 connect；编辑用 set，这样用户删除的图片也会被解除关联。
  const content = values.contentId
    ? await prisma.content.update({
        where: { id: values.contentId },
        data: { ...data, attachments: { set: attachmentConnections } },
      })
    : await prisma.content.create({
        data: {
          ...data,
          authorId: session.user.id,
          attachments: { connect: attachmentConnections },
        },
      });

  if (values.moduleSlug === "updates" && (metadata.contactPhone || metadata.contactWechat)) {
    await prisma.user.update({
      where: { id: session.user.id },
      data: {
        phone: metadata.contactPhone || null,
        wechat: metadata.contactWechat || null,
      },
    });
  }

  if (isSubmittingForReview) {
    await prisma.notification.create({
      data: {
        userId: session.user.id,
        type: "SYSTEM",
        title: "内容已提交审核",
        message: `“${content.title}”已提交到${config.label}，请等待管理员审核。`,
        href: "/account/content?status=PENDING_REVIEW",
      },
    });
  }

  revalidatePath("/account");
  revalidatePath("/account/content");
  revalidatePath(moduleHref[config.module]);
  revalidatePath("/admin", "layout");
  revalidatePath("/admin/review");
  return {
    success: true,
    contentId: content.id,
    message: isSubmittingForReview ? "提交成功，请等待管理员审核" : "草稿已保存",
  };
}

export async function deleteContent(contentId: string) {
  const session = await auth();
  if (!session?.user) return;
  await prisma.content.updateMany({
    where: { id: contentId, authorId: session.user.id, status: { not: "DELETED" } },
    data: { status: "DELETED", deletedAt: new Date() },
  });
  revalidatePath("/account/content");
}

export async function restoreContent(contentId: string) {
  const session = await auth();
  if (!session?.user) return;
  await prisma.content.updateMany({
    where: { id: contentId, authorId: session.user.id, status: "DELETED" },
    data: { status: "UNPUBLISHED", deletedAt: null },
  });
  revalidatePath("/account/content");
}
