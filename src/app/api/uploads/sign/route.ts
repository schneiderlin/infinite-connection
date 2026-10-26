import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { createUploadUrl, isObjectStorageConfigured } from "@/lib/storage";

const inputSchema = z.object({
  fileName: z.string().min(1).max(200),
  mimeType: z.enum(["image/jpeg", "image/png", "image/webp"]),
  size: z.number().int().positive().max(10 * 1024 * 1024),
});

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "请先登录" }, { status: 401 });

  const parsed = inputSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "仅支持10MB以内的 JPG、PNG 或 WebP 图片" }, { status: 400 });
  }

  if (!isObjectStorageConfigured()) {
    return NextResponse.json(
      {
        error: "对象存储尚未配置",
        code: "STORAGE_NOT_CONFIGURED",
        fallback: "inline",
      },
      { status: 503 },
    );
  }

  const { fileName, mimeType, size } = parsed.data;
  const extension = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" }[mimeType];
  const objectKey = `users/${session.user.id}/uploads/${randomUUID()}.${extension}`;

  try {
    const uploadUrl = await createUploadUrl(objectKey, mimeType);
    const attachment = await prisma.attachment.create({
      data: {
        ownerId: session.user.id,
        objectKey,
        fileName,
        mimeType,
        size,
      },
      select: { id: true },
    });
    return NextResponse.json({ uploadUrl, attachmentId: attachment.id });
  } catch (error) {
    const message = error instanceof Error ? error.message : "无法创建上传地址";
    return NextResponse.json({ error: message }, { status: 503 });
  }
}
