import Image from "next/image";
import type { ContentModule } from "@prisma/client";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { ContentActions } from "@/components/ContentActions";

export async function PublishedContentSection({ module }: { module: ContentModule }) {
  const contents = await prisma.content.findMany({
    where: { module, status: "PUBLISHED" },
    include: {
      author: { include: { organization: true } },
      attachments: {
        select: { id: true, fileName: true },
        take: 3,
        orderBy: { createdAt: "asc" },
      },
    },
    orderBy: { publishedAt: "desc" },
    take: 20,
  });
  if (contents.length === 0) return null;

  const session = module === "UPDATE" ? await auth() : null;
  const userId = session?.user?.id;
  const contentIds = contents.map((content) => content.id);
  let likedIds = new Set<string>();
  let helpedIds = new Set<string>();

  if (module === "UPDATE" && userId && contentIds.length > 0) {
    const [likes, helps] = await Promise.all([
      prisma.like.findMany({
        where: { userId, contentId: { in: contentIds } },
        select: { contentId: true },
      }),
      prisma.help.findMany({
        where: { userId, contentId: { in: contentIds } },
        select: { contentId: true },
      }),
    ]);
    likedIds = new Set(likes.map((like) => like.contentId));
    helpedIds = new Set(helps.map((help) => help.contentId));
  }

  return (
    <section className="published-section">
      <header><h2>社区发布</h2><p>以下内容由用户提交并经平台审核后发布</p></header>
      <div className="published-content-list">
        {contents.map((content) => (
          <article key={content.id} className="pc-card published-content-card">
            <div className="card-head">
              <span className="tag tag-green">{content.subtype}</span>
              {content.fields.slice(0, 2).map((field) => <span key={field} className="tag tag-blue">{field}</span>)}
              <span className="spacer" />
              <time>{content.publishedAt?.toLocaleDateString("zh-CN")}</time>
            </div>
            <div className="feed-author">
              <span className="avatar av-green">{(content.author.organization?.name ?? content.author.name ?? "用").slice(0, 1)}</span>
              <div className="feed-author-text">
                <strong>{content.author.organization?.name ?? content.author.name}</strong>
                <span className="feed-sub">{content.author.accountType === "ORGANIZATION" ? "机构发布" : "个人公益"}</span>
              </div>
            </div>
            <h3>{content.title}</h3>
            <p className="published-body">{content.body}</p>
            {content.attachments.length > 0 && (
              <div className="published-images">
                {content.attachments.map((attachment) => (
                  <Image key={attachment.id} src={`/api/uploads/${attachment.id}`} width={320} height={200} unoptimized alt={attachment.fileName} />
                ))}
              </div>
            )}
            <div className="card-meta">📍 {[content.region, content.city].filter(Boolean).join(" · ") || "全国"}{content.tags.length > 0 && ` · ${content.tags.map((tag) => `#${tag}`).join(" ")}`}</div>
            {module === "UPDATE" && (
              <ContentActions
                key={`${content.id}:${content.likesCount}:${likedIds.has(content.id)}:${content.helpsCount}:${helpedIds.has(content.id)}`}
                contentId={content.id}
                title={content.title}
                text={content.body}
                href={`/updates/${content.id}`}
                likesCount={content.likesCount}
                commentsCount={content.commentsCount}
                helpsCount={content.helpsCount}
                isLiked={likedIds.has(content.id)}
                isHelped={helpedIds.has(content.id)}
                className="published-feed-actions"
              />
            )}
          </article>
        ))}
      </div>
    </section>
  );
}
