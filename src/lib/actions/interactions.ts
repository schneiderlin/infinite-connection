"use server";

import { Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";

const contentIdSchema = z.string().trim().min(1).max(64);
const commentSchema = z.object({
  contentId: contentIdSchema,
  body: z
    .string()
    .trim()
    .min(1, "评论内容不能为空")
    .max(1000, "评论内容最多 1000 个字"),
});

const emailPattern = /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i;
const phonePattern = /(?<!\d)(?:\+?86)?1[3-9]\d{9}(?!\d)/;
const bankCardPattern = /(?<!\d)\d{12,19}(?!\d)/;
const idCardPattern = /(?<!\d)(?:\d{15}|\d{17}[\dx])(?!\d)/i;

export type InteractionResult =
  | { success: true; active: boolean; count: number }
  | { success: false; error: string; requiresAuth?: boolean };

export type AddCommentResult =
  | { success: true; commentId: string; count: number }
  | { success: false; error: string; requiresAuth?: boolean };

export type CommentView = {
  id: string;
  body: string;
  createdAt: string;
  authorName: string;
  authorImage: string | null;
  isOrganization: boolean;
};

async function currentUserId(): Promise<string | null> {
  const session = await auth();
  return session?.user?.id ?? null;
}

function loginRequired() {
  return { success: false as const, error: "请先登录", requiresAuth: true };
}

function containsSensitiveInfo(value: string): boolean {
  if (emailPattern.test(value)) return true;
  const compact = value.replace(/[\s\-()]/g, "");
  return (
    phonePattern.test(compact) ||
    bankCardPattern.test(compact) ||
    idCardPattern.test(compact)
  );
}

function revalidateInteractions(contentId: string) {
  revalidatePath(`/updates/${contentId}`);
  revalidatePath("/updates");
}

function isUniqueConstraintError(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === "P2002"
  );
}

export async function toggleLike(contentId: string): Promise<InteractionResult> {
  const parsedId = contentIdSchema.safeParse(contentId);
  if (!parsedId.success) {
    return { success: false, error: "内容标识无效" };
  }

  const userId = await currentUserId();
  if (!userId) return loginRequired();

  try {
    const result = await prisma.$transaction(
      async (tx): Promise<InteractionResult> => {
        const content = await tx.content.findFirst({
          where: { id: parsedId.data, status: "PUBLISHED" },
          select: { id: true, likesCount: true },
        });
        if (!content) {
          return { success: false, error: "内容不存在或尚未发布" };
        }

        const existing = await tx.like.findUnique({
          where: {
            userId_contentId: { userId, contentId: content.id },
          },
          select: { id: true },
        });

        if (existing) {
          await tx.like.delete({ where: { id: existing.id } });
          const updated = await tx.content.update({
            where: { id: content.id },
            data: {
              likesCount: { decrement: content.likesCount > 0 ? 1 : 0 },
            },
            select: { likesCount: true },
          });
          return { success: true, active: false, count: updated.likesCount };
        }

        await tx.like.create({ data: { userId, contentId: content.id } });
        const updated = await tx.content.update({
          where: { id: content.id },
          data: { likesCount: { increment: 1 } },
          select: { likesCount: true },
        });
        return { success: true, active: true, count: updated.likesCount };
      },
    );

    if (result.success) revalidateInteractions(parsedId.data);
    return result;
  } catch (error) {
    if (isUniqueConstraintError(error)) {
      return { success: false, error: "操作太频繁，请刷新后重试" };
    }
    console.error("toggleLike failed", error);
    return { success: false, error: "操作失败，请稍后重试" };
  }
}

export async function toggleHelp(contentId: string): Promise<InteractionResult> {
  const parsedId = contentIdSchema.safeParse(contentId);
  if (!parsedId.success) {
    return { success: false, error: "内容标识无效" };
  }

  const userId = await currentUserId();
  if (!userId) return loginRequired();

  try {
    const result = await prisma.$transaction(
      async (tx): Promise<InteractionResult> => {
        const content = await tx.content.findFirst({
          where: { id: parsedId.data, status: "PUBLISHED" },
          select: { id: true, helpsCount: true },
        });
        if (!content) {
          return { success: false, error: "内容不存在或尚未发布" };
        }

        const existing = await tx.help.findUnique({
          where: {
            userId_contentId: { userId, contentId: content.id },
          },
          select: { id: true },
        });

        if (existing) {
          await tx.help.delete({ where: { id: existing.id } });
          const updated = await tx.content.update({
            where: { id: content.id },
            data: {
              helpsCount: { decrement: content.helpsCount > 0 ? 1 : 0 },
            },
            select: { helpsCount: true },
          });
          return { success: true, active: false, count: updated.helpsCount };
        }

        await tx.help.create({ data: { userId, contentId: content.id } });
        const updated = await tx.content.update({
          where: { id: content.id },
          data: { helpsCount: { increment: 1 } },
          select: { helpsCount: true },
        });
        return { success: true, active: true, count: updated.helpsCount };
      },
    );

    if (result.success) revalidateInteractions(parsedId.data);
    return result;
  } catch (error) {
    if (isUniqueConstraintError(error)) {
      return { success: false, error: "操作太频繁，请刷新后重试" };
    }
    console.error("toggleHelp failed", error);
    return { success: false, error: "操作失败，请稍后重试" };
  }
}

export async function addComment(
  contentId: string,
  body: string,
): Promise<AddCommentResult> {
  const parsed = commentSchema.safeParse({ contentId, body });
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "评论内容无效",
    };
  }

  const userId = await currentUserId();
  if (!userId) return loginRequired();

  if (containsSensitiveInfo(parsed.data.body)) {
    return {
      success: false,
      error: "评论中不能包含手机号、银行卡号、身份证号或邮箱等敏感信息",
    };
  }

  try {
    const result = await prisma.$transaction(
      async (tx): Promise<AddCommentResult> => {
        const content = await tx.content.findFirst({
          where: { id: parsed.data.contentId, status: "PUBLISHED" },
          select: { id: true },
        });
        if (!content) {
          return { success: false, error: "内容不存在或尚未发布" };
        }

        const comment = await tx.comment.create({
          data: {
            contentId: content.id,
            authorId: userId,
            body: parsed.data.body,
          },
          select: { id: true },
        });
        const updated = await tx.content.update({
          where: { id: content.id },
          data: { commentsCount: { increment: 1 } },
          select: { commentsCount: true },
        });

        return {
          success: true,
          commentId: comment.id,
          count: updated.commentsCount,
        };
      },
    );

    if (result.success) revalidateInteractions(parsed.data.contentId);
    return result;
  } catch (error) {
    console.error("addComment failed", error);
    return { success: false, error: "评论发布失败，请稍后重试" };
  }
}

export async function getComments(contentId: string): Promise<CommentView[]> {
  const parsedId = contentIdSchema.safeParse(contentId);
  if (!parsedId.success) return [];

  const comments = await prisma.comment.findMany({
    where: { contentId: parsedId.data },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      body: true,
      createdAt: true,
      author: {
        select: {
          name: true,
          image: true,
          accountType: true,
          organization: { select: { name: true } },
        },
      },
    },
  });

  return comments.map((comment) => ({
    id: comment.id,
    body: comment.body,
    createdAt: comment.createdAt.toISOString(),
    authorName:
      comment.author.organization?.name ?? comment.author.name ?? "匿名用户",
    authorImage: comment.author.image,
    isOrganization: comment.author.accountType === "ORGANIZATION",
  }));
}
