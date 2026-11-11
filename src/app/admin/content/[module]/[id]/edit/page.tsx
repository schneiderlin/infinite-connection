import Link from "next/link";
import { notFound } from "next/navigation";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { requireAdminSession } from "@/lib/require-admin";
import {
  isPublishModuleSlug,
  publishModules,
  type PublishModuleConfig,
} from "@/lib/publishing";
import { PublishForm } from "@/components/PublishForm";

export default async function AdminEditContentPage({
  params,
}: {
  params: Promise<{ module: string; id: string }>;
}) {
  const session = await requireAdminSession();
  const { module, id } = await params;
  if (!isPublishModuleSlug(module)) notFound();

  const baseConfig = publishModules[module];
  const content = await prisma.content.findFirst({
    where: { id, module: baseConfig.module },
    include: {
      author: { include: { organization: true } },
      attachments: { select: { id: true, fileName: true }, orderBy: { createdAt: "asc" } },
    },
  });
  if (!content) notFound();

  const config: PublishModuleConfig = baseConfig.subtypes.includes(content.subtype)
    ? baseConfig
    : { ...baseConfig, subtypes: [content.subtype, ...baseConfig.subtypes] };
  const metadataValue = content.metadata;
  const metadata = metadataValue && typeof metadataValue === "object" && !Array.isArray(metadataValue)
    ? Object.fromEntries(
        Object.entries(metadataValue as Prisma.JsonObject).map(([key, value]) => [key, String(value ?? "")]),
      )
    : {};
  const publisher = content.author.organization?.name
    ?? content.author.name
    ?? content.author.email;
  const returnHref = `/admin/content/${module}`;

  return (
    <main className="admin-main admin-edit-main">
      <header className="admin-page-head">
        <div>
          <span className="admin-eyebrow">EDIT CONTENT</span>
          <h1>编辑{config.label}</h1>
          <p>修改会直接写入数据库；如果当前内容已上架，保存后前台立即使用新内容。</p>
        </div>
        <Link className="admin-btn admin-btn-view" href={returnHref}>← 返回数据表</Link>
      </header>
      <PublishForm
        moduleSlug={module}
        config={config}
        identityName={publisher}
        identityNote={`原发布方 · 管理员 ${session.user.email ?? ""} 正在编辑`}
        defaultContact={{ phone: "", wechat: "" }}
        adminMode
        returnHref={returnHref}
        initial={{
          id: content.id,
          subtype: content.subtype,
          title: content.title,
          summary: content.summary ?? "",
          body: content.body,
          fields: content.fields,
          tags: content.tags,
          region: content.region ?? "",
          city: content.city ?? "",
          metadata,
          metadataJson: JSON.stringify(metadataValue, null, 2),
          attachments: content.attachments,
        }}
      />
    </main>
  );
}
