import Link from "next/link";
import { notFound } from "next/navigation";
import type { ContentStatus, Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { requireAdminSession } from "@/lib/require-admin";
import {
  isPublishModuleSlug,
  moduleHref,
  publishModules,
  type PublishModuleSlug,
} from "@/lib/publishing";
import { setAdminContentStatus } from "@/lib/actions/admin";

const PAGE_SIZE = 40;
const statusLabels: Record<ContentStatus, string> = {
  DRAFT: "草稿",
  PENDING_REVIEW: "待审核",
  PUBLISHED: "已上架",
  REJECTED: "已驳回",
  UNPUBLISHED: "已下架",
  DELETED: "已删除",
};
const statuses = Object.keys(statusLabels) as ContentStatus[];

function dateTime(value: Date) {
  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(value);
}

function metadataText(value: Prisma.JsonValue, key: string) {
  if (!value || Array.isArray(value) || typeof value !== "object") return "";
  const item = value[key];
  return typeof item === "string" ? item.trim() : "";
}

function queryHref(
  module: PublishModuleSlug,
  values: { status?: string; q?: string; page?: number },
) {
  const params = new URLSearchParams();
  if (values.status) params.set("status", values.status);
  if (values.q) params.set("q", values.q);
  if (values.page && values.page > 1) params.set("page", String(values.page));
  const query = params.toString();
  return `/admin/content/${module}${query ? `?${query}` : ""}`;
}

export default async function AdminModuleContentPage({
  params,
  searchParams,
}: {
  params: Promise<{ module: string }>;
  searchParams: Promise<{ status?: string; q?: string; page?: string }>;
}) {
  await requireAdminSession();
  const [{ module }, query] = await Promise.all([params, searchParams]);
  if (!isPublishModuleSlug(module)) notFound();

  const config = publishModules[module];
  const status = statuses.includes(query.status as ContentStatus)
    ? query.status as ContentStatus
    : undefined;
  const q = query.q?.trim().slice(0, 100) ?? "";
  const requestedPage = Math.max(1, Number.parseInt(query.page ?? "1", 10) || 1);
  const where: Prisma.ContentWhereInput = {
    module: config.module,
    ...(status ? { status } : {}),
    ...(q ? {
      OR: [
        { title: { contains: q, mode: "insensitive" } },
        { summary: { contains: q, mode: "insensitive" } },
        { body: { contains: q, mode: "insensitive" } },
      ],
    } : {}),
  };

  const [total, groupedStatuses] = await Promise.all([
    prisma.content.count({ where }),
    prisma.content.groupBy({
      by: ["status"],
      where: { module: config.module },
      _count: { _all: true },
    }),
  ]);
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const page = Math.min(requestedPage, pageCount);
  const contents = await prisma.content.findMany({
    where,
    include: { author: { include: { organization: true } } },
    orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
    skip: (page - 1) * PAGE_SIZE,
    take: PAGE_SIZE,
  });
  const statusCounts = Object.fromEntries(
    groupedStatuses.map((item) => [item.status, item._count._all]),
  ) as Partial<Record<ContentStatus, number>>;
  const allCount = Object.values(statusCounts).reduce((sum, count) => sum + (count ?? 0), 0);

  return (
    <main className="admin-main">
      <header className="admin-page-head">
        <div>
          <span className="admin-eyebrow">CONTENT DATABASE</span>
          <h1>{config.label}</h1>
          <p>这里汇总该板块的全部数据库记录。已上架内容具备前台展示资格，前台仍会按截止日期、去重等规则筛选；管理员可直接编辑、下架或重新上架。</p>
        </div>
        <div className="admin-stat-card"><b>{allCount}</b><span>条数据</span></div>
      </header>

      <section className="admin-module-cards" aria-label="四大内容板块">
        {(Object.keys(publishModules) as PublishModuleSlug[]).map((slug) => (
          <Link
            key={slug}
            href={`/admin/content/${slug}`}
            className={`admin-module-card${slug === module ? " active" : ""}`}
          >
            <small>{publishModules[slug].module}</small>
            <strong>{publishModules[slug].label}</strong>
            <span>{slug === module ? `${allCount} 条数据` : "查看数据 →"}</span>
          </Link>
        ))}
      </section>

      <section className="pc-card admin-panel">
        <div className="admin-content-toolbar">
          <nav className="admin-status-tabs" aria-label="内容状态">
            <Link href={queryHref(module, { q })} className={!status ? "active" : ""}>全部 <b>{allCount}</b></Link>
            {statuses.map((item) => (
              <Link
                key={item}
                href={queryHref(module, { status: item, q })}
                className={status === item ? "active" : ""}
              >
                {statusLabels[item]} <b>{statusCounts[item] ?? 0}</b>
              </Link>
            ))}
          </nav>
          <form className="admin-content-search">
            {status && <input type="hidden" name="status" value={status} />}
            <input name="q" defaultValue={q} placeholder="搜索标题、简介或正文" aria-label="搜索内容" />
            <button type="submit">搜索</button>
          </form>
        </div>

        {contents.length === 0 ? (
          <div className="admin-empty"><strong>没有符合条件的数据</strong><p>可以切换状态或调整搜索关键词。</p></div>
        ) : (
          <div className="admin-table-wrap">
            <table className="admin-table admin-content-table">
              <thead>
                <tr>
                  <th scope="col">标题 / 类型</th>
                  <th scope="col">列表摘要</th>
                  <th scope="col">发布方</th>
                  <th scope="col">地区</th>
                  <th scope="col">状态</th>
                  <th scope="col">最近更新</th>
                  <th scope="col">操作</th>
                </tr>
              </thead>
              <tbody>
                {contents.map((content) => {
                  const publisher = content.author.organization?.name
                    ?? (metadataText(content.metadata, "org") || content.author.name || content.author.email);
                  const summary = content.summary?.trim() || content.body.replace(/\s+/g, " ").trim();
                  return (
                    <tr key={content.id}>
                      <td className="admin-table-title">
                        <strong>{content.title}</strong>
                        <small>{content.subtype}</small>
                      </td>
                      <td className="admin-table-body"><span className="admin-content-summary">{summary}</span></td>
                      <td><span className="admin-publisher">{publisher}</span></td>
                      <td>{[content.region, content.city].filter(Boolean).join(" · ") || "—"}</td>
                      <td><span className={`admin-content-status status-${content.status.toLowerCase()}`}>{statusLabels[content.status]}</span></td>
                      <td><time dateTime={content.updatedAt.toISOString()}>{dateTime(content.updatedAt)}</time></td>
                      <td>
                        <div className="admin-row-actions">
                          <Link className="admin-btn admin-btn-view" href={`/admin/content/${module}/${content.id}/edit`}>编辑</Link>
                          <Link className="admin-btn admin-btn-view" href={content.module === "UPDATE" ? `/updates/${content.id}` : moduleHref[content.module]} target="_blank">前台</Link>
                          {content.status === "PUBLISHED" && (
                            <form action={setAdminContentStatus.bind(null, content.id, "UNPUBLISHED")}>
                              <button className="admin-btn admin-btn-reject" type="submit">下架</button>
                            </form>
                          )}
                          {content.status === "UNPUBLISHED" && (
                            <form action={setAdminContentStatus.bind(null, content.id, "PUBLISHED")}>
                              <button className="admin-btn admin-btn-approve" type="submit">上架</button>
                            </form>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {pageCount > 1 && (
          <nav className="admin-pagination" aria-label="数据分页">
            <Link aria-disabled={page === 1} href={queryHref(module, { status, q, page: page - 1 })}>上一页</Link>
            <span>第 {page} / {pageCount} 页，共 {total} 条</span>
            <Link aria-disabled={page === pageCount} href={queryHref(module, { status, q, page: page + 1 })}>下一页</Link>
          </nav>
        )}
      </section>
    </main>
  );
}
