"use client";

import Image from "next/image";
import { useState } from "react";
import { approveContent, rejectContent } from "@/lib/actions/admin";

type ReviewAttachment = {
  id: string;
  fileName: string;
};

export function ReviewDetailDialog({
  contentId,
  title,
  body,
  subtype,
  categoryOptions,
  moduleName,
  publisher,
  submittedAt,
  fields,
  region,
  city,
  tags,
  attachments,
}: {
  contentId: string;
  title: string;
  body: string;
  subtype: string;
  categoryOptions: string[];
  moduleName: string;
  publisher: string;
  submittedAt: string;
  fields: string[];
  region: string | null;
  city: string | null;
  tags: string[];
  attachments: ReviewAttachment[];
}) {
  const [open, setOpen] = useState(false);
  const approveFormId = `review-approve-${contentId}`;

  return (
    <>
      <button
        type="button"
        className="admin-btn admin-btn-view"
        onClick={() => setOpen(true)}
      >
        查看详情
      </button>

      {open && (
        <div
          className="modal-overlay"
          role="dialog"
          aria-modal="true"
          aria-label="审核内容详情"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setOpen(false);
          }}
        >
          <article className="modal review-detail-modal">
            <div className="modal-head">
              <div>
                <span className="admin-eyebrow">REVIEW DETAIL</span>
                <h2>{title}</h2>
              </div>
              <button type="button" className="modal-close" onClick={() => setOpen(false)} aria-label="关闭">
                ✕
              </button>
            </div>

            <div className="review-detail-meta">
              <span className="tag tag-green">{moduleName}</span>
              <label className="review-detail-category">
                <span>分类</span>
                <select
                  name="category"
                  form={approveFormId}
                  defaultValue={subtype}
                  aria-label="修正分类"
                  required
                >
                  {categoryOptions.map((option) => (
                    <option key={option} value={option}>{option}</option>
                  ))}
                  {!categoryOptions.includes(subtype) && (
                    <option value={subtype}>{subtype}（当前值，请重新选择）</option>
                  )}
                </select>
              </label>
              {fields.map((field) => <span key={field} className="tag tag-green">{field}</span>)}
            </div>

            <dl className="review-detail-facts">
              <div><dt>发布人</dt><dd>{publisher}</dd></div>
              <div><dt>提交时间</dt><dd>{submittedAt}</dd></div>
              <div><dt>地域</dt><dd>{[region, city].filter(Boolean).join(" · ") || "未填写"}</dd></div>
            </dl>

            <section className="review-detail-section">
              <h3>完整正文</h3>
              <div className="review-detail-body">{body}</div>
            </section>

            {attachments.length > 0 && (
              <section className="review-detail-section">
                <h3>图片（{attachments.length}）</h3>
                <div className="review-detail-images">
                  {attachments.map((attachment) => (
                    <figure key={attachment.id}>
                      <Image
                        src={`/api/uploads/${attachment.id}`}
                        width={800}
                        height={520}
                        unoptimized
                        alt={attachment.fileName}
                      />
                      <figcaption>{attachment.fileName}</figcaption>
                    </figure>
                  ))}
                </div>
              </section>
            )}

            {tags.length > 0 && (
              <div className="review-detail-tags">
                {tags.map((tag) => <span key={tag} className="hashtag">#{tag}# </span>)}
              </div>
            )}

            <footer className="review-detail-actions">
              <form
                className="review-reject-form"
                action={rejectContent.bind(null, contentId)}
              >
                <label className="review-reject-field">
                  <span>拒绝原因<em>*</em></span>
                  <textarea
                    name="rejectionReason"
                    className="review-reject-reason"
                    rows={2}
                    maxLength={200}
                    placeholder="请说明需要发布者修改的内容，提交后会展示在对方的内容管理页"
                    required
                  />
                </label>
                <button className="admin-btn admin-btn-reject" type="submit">
                  拒绝
                </button>
              </form>
              <form
                id={approveFormId}
                className="review-approve-form"
                action={approveContent.bind(null, contentId)}
              >
                <button className="admin-btn admin-btn-approve" type="submit">
                  通过并发布
                </button>
              </form>
            </footer>
          </article>
        </div>
      )}
    </>
  );
}
