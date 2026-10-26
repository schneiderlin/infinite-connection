import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";

// 临时兜底：对象存储未配置时，把压缩后的图片以 data URL 存进数据库。
// 单张限制 3MB，避免 Postgres 行过大；前端会先缩放到 1600px 并压缩。
const MAX_INLINE_BYTES = 3 * 1024 * 1024;

const inputSchema = z.object({
  fileName: z.string().min(1).max(200),
  mimeType: z.enum(["image/jpeg", "image/png", "image/webp"]),
  size: z.number().int().positive().max(10 * 1024 * 1024),
  dataUrl: z.string().min(1),
});

const MIME_EXTENSION = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
} as const;

function decodeDataUrl(dataUrl: string, mimeType: keyof typeof MIME_EXTENSION) {
  const prefix = `data:${mimeType};base64,`;
  if (!dataUrl.startsWith(prefix)) return null;
  const base64 = dataUrl.slice(prefix.length);
  if (!base64) return null;
  const buffer = Buffer.from(base64, "base64");
  return buffer.length > 0 ? buffer : null;
}

function matchesImageSignature(buffer: Buffer, mimeType: keyof typeof MIME_EXTENSION) {
  if (mimeType === "image/jpeg") {
    return buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
  }
  if (mimeType === "image/png") {
    return buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  }
  return buffer.subarray(0, 4).toString("ascii") === "RIFF"
    && buffer.subarray(8, 12).toString("ascii") === "WEBP";
}

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "请先登录" }, { status: 401 });

  const parsed = inputSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "图片数据格式不正确" }, { status: 400 });
  }

  const { fileName, mimeType, dataUrl } = parsed.data;
  const buffer = decodeDataUrl(dataUrl, mimeType);
  if (!buffer || !matchesImageSignature(buffer, mimeType)) {
    return NextResponse.json({ error: "图片内容校验失败，请重新选择" }, { status: 400 });
  }
  if (buffer.length > MAX_INLINE_BYTES) {
    return NextResponse.json({ error: "图片压缩后仍超过 3MB，请换一张更小的图片" }, { status: 413 });
  }

  const attachment = await prisma.attachment.create({
    data: {
      ownerId: session.user.id,
      objectKey: `inline/${session.user.id}/${randomUUID()}.${MIME_EXTENSION[mimeType]}`,
      dataUrl,
      fileName,
      mimeType,
      size: buffer.length,
    },
    select: { id: true },
  });

  return NextResponse.json({ attachmentId: attachment.id, mode: "inline" });
}
