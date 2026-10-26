import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { createDownloadUrl } from "@/lib/storage";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await auth();
  const attachment = await prisma.attachment.findUnique({
    where: { id },
    include: { content: { select: { status: true } } },
  });
  if (!attachment) return new NextResponse("Not found", { status: 404 });

  const canRead = attachment.content?.status === "PUBLISHED"
    || attachment.ownerId === session?.user?.id
    || session?.user?.role === "ADMIN";
  if (!canRead) return new NextResponse("Forbidden", { status: 403 });

  // 临时内联图片：直接从数据库解码返回，不依赖对象存储。
  if (attachment.dataUrl) {
    const match = /^data:([^;]+);base64,([\s\S]+)$/.exec(attachment.dataUrl);
    if (!match) return new NextResponse("Invalid inline image", { status: 404 });
    const mimeType = match[1];
    const bytes = Buffer.from(match[2], "base64");
    if (!mimeType.startsWith("image/") || bytes.length === 0) {
      return new NextResponse("Invalid inline image", { status: 404 });
    }
    const isPublished = attachment.content?.status === "PUBLISHED";
    return new NextResponse(new Uint8Array(bytes), {
      headers: {
        "Content-Type": mimeType,
        "Content-Length": String(bytes.length),
        "Content-Disposition": "inline",
        "Cache-Control": isPublished
          ? "public, max-age=31536000, immutable"
          : "private, max-age=0, must-revalidate",
      },
    });
  }

  return NextResponse.redirect(await createDownloadUrl(attachment.objectKey));
}
