import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { buildImportRows, IMPORT_ROW_CHUNK } from "@/lib/import-records";
import { isPublishModuleSlug, type PublishModuleSlug } from "@/lib/publishing";

// 浏览器端解析好表格后，按小块（每块 IMPORT_ROW_CHUNK 条）POST 到这里入库。
// 走分块是为了绕开 Server Action / Serverless 的请求体上限（Vercel 4.5MB），
// 这样几万行的表格也能稳定导入，不会出现「选了文件点了没反应」。
const entrySchema = z.object({
  line: z.number().int().min(1),
  record: z.record(z.unknown()),
});

const payloadSchema = z.object({
  fileName: z.string().trim().min(1).max(200),
  defaultModule: z.string().trim().max(40).optional().nullable(),
  entries: z.array(entrySchema).min(1).max(IMPORT_ROW_CHUNK),
});

export async function POST(request: Request) {
  const session = await auth();
  if (session?.user?.role !== "ADMIN" || !session.user.id) {
    return NextResponse.json({ error: "没有权限执行导入，请重新登录管理员账号" }, { status: 403 });
  }

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "上传的数据不是合法的 JSON" }, { status: 400 });
  }

  const parsed = payloadSchema.safeParse(payload);
  if (!parsed.success) {
    return NextResponse.json({ error: "导入数据格式不正确，请刷新页面后重试" }, { status: 400 });
  }

  const defaultModuleRaw = (parsed.data.defaultModule ?? "").trim();
  let defaultModule: PublishModuleSlug | null = null;
  if (defaultModuleRaw) {
    if (!isPublishModuleSlug(defaultModuleRaw)) {
      return NextResponse.json({ error: "默认模块无效" }, { status: 400 });
    }
    defaultModule = defaultModuleRaw;
  }

  const built = buildImportRows({
    entries: parsed.data.entries,
    defaultModule,
    fileName: parsed.data.fileName,
    authorId: session.user.id,
    now: new Date(),
  });

  let imported = 0;
  if (built.rows.length > 0) {
    try {
      const result = await prisma.content.createMany({
        data: built.rows as unknown as Prisma.ContentCreateManyInput[],
      });
      imported = result.count;
    } catch (error) {
      console.error("admin import failed", error);
      return NextResponse.json({ error: "批量写入数据库失败，请稍后重试" }, { status: 500 });
    }

    revalidatePath("/admin", "layout");
    revalidatePath("/admin/publish");
    revalidatePath("/admin/review");
    revalidatePath("/account/content");
    for (const href of built.touchedModules) revalidatePath(href);
  }

  return NextResponse.json({
    imported,
    failed: built.errors.length,
    errors: built.errors.slice(0, 20),
    warnings: built.warnings.slice(0, 20),
  });
}
