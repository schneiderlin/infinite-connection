import type { FundingItem, JobItem, ToolItem } from "@/lib/platform-types";
import fundingSnapshot from "@/lib/fundings-data.json";
import jobSnapshot from "@/lib/jobs-scraped.json";
import toolSnapshot from "@/lib/tools-data.json";

// Only serialize public display fields; keep extraction and provenance internals out of the payload.
export const fundings: FundingItem[] = (fundingSnapshot as FundingItem[]).map(({
  id, kind, type, supportType, duration, field, issue, region, title, summary,
  org, location, amount, amountWan, due, publishedDays, openStatus, sourceName, publishedDate, url,
}) => ({
  id, kind, type, supportType, duration, field, issue, region, title, summary,
  org, location, amount, amountWan, due, publishedDays, openStatus, sourceName, publishedDate, url,
}));

export const jobs: JobItem[] = (jobSnapshot as JobItem[]).map(({
  id, category, kind, role, jobGroup, subCategory, level, education, orgType, servicePeriod,
  time, publishedDays, title, summary, org, location, salary, due, sourceName, url,
}) => ({
  id, category, kind, role, jobGroup, subCategory, level, education, orgType, servicePeriod,
  time, publishedDays, title, summary, org, location, salary, due, sourceName, url,
}));

export const tools: ToolItem[] = toolSnapshot.map((item) => ({
  id: item.id,
  category: item.category,
  field: item.domain,
  forms: item.format ? [item.format] : [],
  duration: item.period,
  title: item.title,
  summary: item.summary,
  publisher: item.org,
  tone: item.tone,
  icon: item.icon,
  priceTag: item.isFree ? "免费" : "商业付费",
  meta: [item.dateText, item.locationText].filter(Boolean).join(" · "),
  price: item.isFree ? undefined : item.priceText,
  action: item.action,
  publishedDays: item.publishedDays,
  downloads: 0,
  rating: 0,
  url: item.downloadUrl || item.url,
}));
