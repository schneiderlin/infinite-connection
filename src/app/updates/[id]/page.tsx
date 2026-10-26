import Image from "next/image";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { getComments } from "@/lib/actions/interactions";
import { SiteHeader } from "@/components/SiteHeader";
import { PlatformFooter } from "@/components/PlatformFooter";
import { ContentActions } from "@/components/ContentActions";
import { CommentForm } from "@/components/CommentForm";
import Link from "next/link";
import "../../platform.css";

// 详情页同样读取数据库，避免发布后的动态点进去显示“未找到”。
export const dynamic = "force-dynamic";

const avatarTones = ["av-green", "av-blue", "av-orange", "av-purple", "av-rose", "av-teal"];

function readMetadata(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function avatarTone(name: string): string {
  let hash = 0;
  for (const char of name) hash = (hash * 31 + char.charCodeAt(0)) % 997;
  return avatarTones[hash % avatarTones.length];
}

function formatCommentTime(value: string): string {
  return new Date(value).toLocaleString("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default async function UpdateDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [content, session] = await Promise.all([
    prisma.content.findFirst({
      where: { id, module: "UPDATE", status: "PUBLISHED" },
      include: {
        author: { include: { organization: true } },
        attachments: {
          select: { id: true, fileName: true },
          orderBy: { createdAt: "asc" },
        },
      },
    }),
    auth(),
  ]);

  if (content) {
    const org = content.author.organization?.name ?? content.author.name ?? "公益伙伴";
    const publishedAt = content.publishedAt ?? content.createdAt;
    const userId = session?.user?.id;
    const [comments, liked, helped] = await Promise.all([
      getComments(content.id),
      userId
        ? prisma.like.findUnique({
            where: { userId_contentId: { userId, contentId: content.id } },
            select: { id: true },
          })
        : Promise.resolve(null),
      userId
        ? prisma.help.findUnique({
            where: { userId_contentId: { userId, contentId: content.id } },
            select: { id: true },
          })
        : Promise.resolve(null),
    ]);
    const commentsLoginHref = `/login?callbackUrl=${encodeURIComponent(
      `/updates/${content.id}#comments`,
    )}`;
    const metadata = readMetadata(content.metadata);
    const period = [metadata.periodStart, metadata.periodEnd]
      .filter((value): value is string => typeof value === "string" && value.length > 0)
      .join(" 至 ");

    return (
      <div className="module-page">
        <SiteHeader active="updates" />
        <main className="detail-page">
          <div className="detail-topbar">
            <Link href="/updates" className="detail-back">← 返回项目动态</Link>
          </div>

          <article className="pc-card detail-card">
            <div className="detail-tags">
              {(content.fields.length > 0 ? content.fields : ["其他"]).map((field) => (
                <span key={field} className="tag tag-green">{field}</span>
              ))}
              <span className="tag tag-blue">{content.subtype}</span>
            </div>

            <h1 className="detail-title">{content.title}</h1>

            <div className="detail-meta">
              <span>发布机构：{org}</span>
              <span>发布时间：{publishedAt.toLocaleDateString("zh-CN")}</span>
              <span>地域：{[content.region, content.city].filter(Boolean).join(" · ") || "全国"}</span>
            </div>

            <div className="detail-divider" />
            <div className="detail-body">{content.body}</div>

            {content.attachments.length > 0 && (
              <section className="detail-image-section" aria-label="内容图片">
                <div
                  className={`detail-images${
                    content.attachments.length > 1 ? " detail-images-grid" : ""
                  }`}
                >
                  {content.attachments.map((attachment) => (
                    <figure key={attachment.id} className="detail-image">
                      <Image
                        src={`/api/uploads/${attachment.id}`}
                        width={1200}
                        height={800}
                        unoptimized
                        alt={attachment.fileName}
                        className="detail-image-el"
                      />
                      <figcaption>{attachment.fileName}</figcaption>
                    </figure>
                  ))}
                </div>
              </section>
            )}

            {content.tags.length > 0 && (
              <div className="detail-hashtags">
                {content.tags.map((tag) => (
                  <span key={tag} className="hashtag">#{tag}# </span>
                ))}
              </div>
            )}

            {period && <div className="detail-period">🕐 项目期：{period}</div>}
          </article>

          <section className="pc-card detail-actions-card" aria-label="内容互动">
            <div className="detail-actions-head">
              <h2>支持这个项目</h2>
              <p>分享给朋友，或登录后点赞、搭把手和发表评论。</p>
            </div>
            <ContentActions
              key={`${content.id}:${content.likesCount}:${Boolean(liked)}:${content.helpsCount}:${Boolean(helped)}`}
              contentId={content.id}
              title={content.title}
              text={content.body}
              likesCount={content.likesCount}
              commentsCount={content.commentsCount}
              helpsCount={content.helpsCount}
              isLiked={Boolean(liked)}
              isHelped={Boolean(helped)}
            />
          </section>

          <section
            id="comments"
            className="pc-card detail-comments-card"
            aria-label="评论区"
          >
            <div className="detail-comments-head">
              <h2>评论（{comments.length}）</h2>
              <p>理性交流，保护隐私，请勿填写手机号、银行卡号等信息。</p>
            </div>
            <CommentForm
              contentId={content.id}
              isAuthenticated={Boolean(userId)}
              loginHref={commentsLoginHref}
            />
            {comments.length === 0 ? (
              <p className="comment-empty">还没有评论，来做第一个交流的人吧。</p>
            ) : (
              <ul className="comment-list">
                {comments.map((comment) => (
                  <li key={comment.id} className="comment-item">
                    <span
                      className={`avatar comment-avatar ${avatarTone(comment.authorName)}`}
                    >
                      {comment.authorImage ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={comment.authorImage}
                          alt=""
                          loading="lazy"
                          referrerPolicy="no-referrer"
                        />
                      ) : (
                        comment.authorName.slice(0, 1)
                      )}
                    </span>
                    <div className="comment-main">
                      <div className="comment-head">
                        <strong className="comment-author">
                          {comment.authorName}
                        </strong>
                        {comment.isOrganization && (
                          <span className="tag tag-blue">机构</span>
                        )}
                        <time
                          className="comment-time"
                          dateTime={comment.createdAt}
                        >
                          {formatCommentTime(comment.createdAt)}
                        </time>
                      </div>
                      <p className="comment-body">{comment.body}</p>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </main>
        <PlatformFooter />
      </div>
    );
  }

  return (
    <div className="module-page">
      <SiteHeader active="updates" />
      <div className="detail-not-found" style={{ textAlign: "center", padding: "100px 20px" }}>
        <h2 style={{ fontSize: "24px", marginBottom: "20px" }}>未找到该动态</h2>
        <Link href="/updates" className="card-link" style={{ color: "var(--primary-color)" }}>
          ← 返回项目动态列表
        </Link>
      </div>
      <PlatformFooter />
    </div>
  );
}