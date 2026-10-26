import type { Metadata } from "next";
import { prisma } from "@/lib/db";
import { requireAdminSession } from "@/lib/require-admin";
import { approveContent, rejectContent } from "@/lib/actions/admin";
import { moduleLabel, publishModuleByContentModule } from "@/lib/publishing";
import { ReviewDetailDialog } from "@/components/ReviewDetailDialog";

export const metadata: Metadata = {
  title: "审核管理｜管理后台｜无限连接",
};

function formatDateTime(value: Date | null) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(value);
}

function bodyPreview(body: string) {
  const text = body.replace(/\s+/g, " ").trim();
  const chars = Array.from(text);
  return chars.length > 100 ? `${chars.slice(0, 100).join("")}…` : text;
}

export default async function AdminReviewPage() {
  await requireAdminSession();

  const contents = await prisma.content.findMany({
    where: { status: "PENDING_REVIEW" },
    include: {
      author: { include: { organization: true } },
      attachments: {
        select: { id: true, fileName: true },
        orderBy: { createdAt: "asc" },
      },
    },
    orderBy: { submittedAt: "asc" },
  });

  return (
    <main className="admin-main">
      <header className="admin-page-head">
        <div>
          <span className="admin-eyebrow">REVIEW</span>
          <h1>审核管理</h1>
          <p>审核用户提交的内容：核对并修正分类后通过，或填写原因拒绝。通过后立即出现在前台，拒绝理由会展示给发布者。</p>
        </div>
        <div className="admin-stat-card">
          <b>{contents.length}</b>
          <span>条待审核</span>
        </div>
      </header>

      <section className="pc-card admin-panel">
        <header className="admin-panel-head">
          <div>
            <h2>待审核内容</h2>
            <p>按提交时间从早到晚排列，建议先处理等待最久的记录。</p>
          </div>
          <span className="admin-panel-badge">PENDING_REVIEW</span>
        </header>

        {contents.length === 0 ? (
          <div className="admin-empty">
            <strong>当前没有待审核内容</strong>
            <p>用户提交新内容后，会在这里出现。</p>
          </div>
        ) : (
          <div className="admin-table-wrap">
            <table className="admin-table">
              <colgroup>
                <col style={{ width: "19%" }} />
                <col style={{ width: "27%" }} />
                <col style={{ width: "10%" }} />
                <col style={{ width: "10%" }} />
                <col style={{ width: "12%" }} />
                <col style={{ width: "22%" }} />
              </colgroup>
              <thead>
                <tr>
                  <th scope="col">标题</th>
                  <th scope="col">正文预览</th>
                  <th scope="col">发布人</th>
                  <th scope="col">模块 / 分类</th>
                  <th scope="col">提交时间</th>
                  <th scope="col">操作</th>
                </tr>
              </thead>
              <tbody>
                {contents.map((content) => {
                  const submittedAt = content.submittedAt ?? content.createdAt;
                  const publisher =
                    content.author.organization?.name
                    ?? content.author.name
                    ?? content.author.email;
                  return (
                    <tr key={content.id}>
                      <td className="admin-table-title">
                        <strong>{content.title}</strong>
                      </td>
                      <td className="admin-table-body">
                        {bodyPreview(content.body)}
                      </td>
                      <td>
                        <span className="admin-publisher">{publisher}</span>
                      </td>
                      <td>
                        <span className="tag tag-green">
                          {moduleLabel[content.module]}
                        </span>
                        <small className="admin-subtype">{content.subtype}</small>
                      </td>
                      <td>
                        <time dateTime={submittedAt.toISOString()}>
                          {formatDateTime(submittedAt)}
                        </time>
                      </td>
                      <td>
                        <div className="admin-row-actions">
                          <ReviewDetailDialog
                            contentId={content.id}
                            title={content.title}
                            body={content.body}
                            subtype={content.subtype}
                            categoryOptions={publishModuleByContentModule[content.module].subtypes}
                            moduleName={moduleLabel[content.module]}
                            publisher={publisher}
                            submittedAt={formatDateTime(submittedAt)}
                            fields={content.fields}
                            region={content.region}
                            city={content.city}
                            tags={content.tags}
                            attachments={content.attachments}
                          />
                          <form action={approveContent.bind(null, content.id)}>
                            <input type="hidden" name="category" value={content.subtype} />
                            <button className="admin-btn admin-btn-approve" type="submit">
                              通过
                            </button>
                          </form>
                          <form action={rejectContent.bind(null, content.id)}>
                            <input
                              type="hidden"
                              name="rejectionReason"
                              value="管理员在审核列表驳回，请修改后重新提交"
                            />
                            <button className="admin-btn admin-btn-reject" type="submit">
                              拒绝
                            </button>
                          </form>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </main>
  );
}
