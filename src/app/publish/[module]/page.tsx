import type { Metadata } from "next";
import { redirect, notFound } from "next/navigation";
import type { Prisma } from "@prisma/client";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { isPublishModuleSlug, publishModules } from "@/lib/publishing";
import { SiteHeader } from "@/components/SiteHeader";
import { PlatformFooter } from "@/components/PlatformFooter";
import { PublishForm } from "@/components/PublishForm";
import "@/app/platform.css";

export const metadata: Metadata = { title: "发布内容｜无限连接" };

export default async function PublishPage({
  params,
  searchParams,
}: {
  params: Promise<{ module: string }>;
  searchParams: Promise<{ id?: string }>;
}) {
  const { module } = await params;
  const { id } = await searchParams;
  if (!isPublishModuleSlug(module)) notFound();

  const session = await auth();
  if (!session?.user) redirect(`/login?callbackUrl=/publish/${module}`);
  const config = publishModules[module];
  if (config.organizationOnly && session.user.accountType !== "ORGANIZATION") {
    redirect("/account?notice=organization-required");
  }

  const [content, userContact] = await Promise.all([
    id ? prisma.content.findFirst({
      where: { id, authorId: session.user.id, module: config.module, status: { in: ["DRAFT", "REJECTED"] } },
      include: { attachments: { select: { id: true, fileName: true } } },
    }) : null,
    module === "updates" ? prisma.user.findUnique({
      where: { id: session.user.id },
      select: { phone: true, wechat: true },
    }) : null,
  ]);
  if (id && !content) notFound();

  const metadataValue = content?.metadata;
  const metadata = metadataValue && typeof metadataValue === "object" && !Array.isArray(metadataValue)
    ? Object.fromEntries(Object.entries(metadataValue as Prisma.JsonObject).map(([key, value]) => [key, String(value ?? "")]))
    : {};

  return (
    <div className="module-page">
      <SiteHeader active="" />
      <main className="publish-page">
        <header className="publish-page-head">
          <span className="home-eyebrow">发布{config.label}</span>
          <p>{config.description}</p>
        </header>
        <PublishForm
          moduleSlug={module}
          config={config}
          identityName={session.user.organizationName ?? session.user.name ?? session.user.email ?? "用户"}
          identityNote={session.user.accountType === "ORGANIZATION"
            ? `机构用户 · ${session.user.organizationStatus === "VERIFIED" ? "已认证" : "认证审核中"}`
            : "个人用户 · 发布动态将标注个人公益"}
          defaultContact={{
            phone: userContact?.phone ?? "",
            wechat: userContact?.wechat ?? "",
          }}
          initial={content ? {
            id: content.id,
            subtype: content.subtype,
            title: content.title,
            body: content.body,
            fields: content.fields,
            tags: content.tags,
            region: content.region ?? "",
            city: content.city ?? "",
            metadata,
            attachments: content.attachments,
          } : undefined}
        />
      </main>
      <PlatformFooter />
    </div>
  );
}
