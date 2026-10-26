import { SiteHeader } from "@/components/SiteHeader";
import { PlatformFooter } from "@/components/PlatformFooter";
import { UpdatesBrowser } from "@/components/UpdatesBrowser";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { provinceNames } from "@/lib/cn-divisions";
import { publicInterestFields } from "@/lib/publishing";
import { formatRelativeHours, hoursSince } from "@/lib/relative-time";
import type { UpdateItem } from "@/lib/platform-types";
import "../platform.css";

// 列表数据来自数据库，禁用缓存以保证发布后立刻可见。
export const dynamic = "force-dynamic";

export const metadata = {
  title: "项目动态 · 无限连接",
};

function readMetadata(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

export default async function UpdatesPage() {
  const [contents, session] = await Promise.all([
    prisma.content.findMany({
      where: { module: "UPDATE", status: "PUBLISHED" },
      include: {
        author: { include: { organization: true } },
        attachments: {
          select: { id: true, fileName: true },
          orderBy: { createdAt: "asc" },
          take: 3,
        },
      },
      orderBy: { publishedAt: "desc" },
      take: 50,
    }),
    auth(),
  ]);

  const userId = session?.user?.id;
  const contentIds = contents.map((content) => content.id);
  let likedIds = new Set<string>();
  let helpedIds = new Set<string>();

  if (userId && contentIds.length > 0) {
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

  const items: UpdateItem[] = contents.map((content) => {
    const publishedAt = content.publishedAt ?? content.createdAt;
    const publishedHours = hoursSince(publishedAt);
    const metadata = readMetadata(content.metadata);
    const period = [metadata.periodStart, metadata.periodEnd]
      .filter((value): value is string => typeof value === "string" && value.length > 0)
      .join(" 至 ") || "长期";

    return {
      id: content.id,
      kind: "最新动态",
      posterType: content.author.accountType === "ORGANIZATION" ? "机构" : "个人",
      field: content.fields[0] ?? "其他",
      fields: content.fields,
      region: content.region ?? "全国",
      rating: 0,
      publishedHours,
      time: formatRelativeHours(publishedHours),
      source: "来自 项目主页",
      org: content.author.organization?.name ?? content.author.name ?? "公益伙伴",
      title: content.title,
      content: content.body,
      hashtags: content.tags,
      location: [content.region, content.city].filter(Boolean).join(" · ") || "全国",
      period,
      images: content.attachments.map((attachment) => ({
        id: attachment.id,
        fileName: attachment.fileName,
      })),
      shares: 0,
      comments: content.commentsCount,
      likes: content.likesCount,
      helps: content.helpsCount,
      isLiked: likedIds.has(content.id),
      isHelped: helpedIds.has(content.id),
    };
  });

  return (
    <div className="module-page">
      <SiteHeader active="updates" />
      <UpdatesBrowser
        items={items}
        fieldOptions={["全部", ...publicInterestFields]}
        regionOptions={["全部", "全国", ...provinceNames]}
      />
      <PlatformFooter />
    </div>
  );
}
