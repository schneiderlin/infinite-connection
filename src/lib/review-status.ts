/**
 * 抓取快照的人工审核状态。
 *
 * 爬虫写入的快照默认是 PENDING，只有人工审核改为 PUBLISHED 后才会进入前端列表。
 * AI 低置信度分类会写入 PENDING_REVIEW，等待人工复核。
 * 历史快照没有 status 字段，按“已发布”处理，避免升级后整站列表为空。
 */
export type ReviewStatus = "PENDING" | "PENDING_REVIEW" | "PUBLISHED" | "REJECTED";

export type Reviewable = {
  status?: ReviewStatus | string | null;
};

export function isPublished(item: object): boolean {
  const status = (item as Reviewable).status;
  return !status || status === "PUBLISHED";
}
