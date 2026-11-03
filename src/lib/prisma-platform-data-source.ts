import "server-only";

import type { Prisma } from "@prisma/client";
import { connection } from "next/server";
import { prisma } from "@/lib/db";
import type { PlatformDataSource } from "@/lib/platform-data-source";
import type { FundingItem, JobItem, ToolItem } from "@/lib/platform-types";

const contentSelect = {
  id: true,
  subtype: true,
  title: true,
  summary: true,
  body: true,
  fields: true,
  region: true,
  city: true,
  metadata: true,
  publishedAt: true,
  author: {
    select: {
      name: true,
      organization: { select: { name: true } },
    },
  },
} satisfies Prisma.ContentSelect;

type PublishedContent = Prisma.ContentGetPayload<{ select: typeof contentSelect }>;
type Metadata = Record<string, string>;

const shanghaiDate = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Shanghai" });

function metadata(value: Prisma.JsonValue): Metadata {
  if (!value || Array.isArray(value) || typeof value !== "object") return {};
  return Object.fromEntries(
    Object.entries(value)
      .filter((entry): entry is [string, string | number | boolean] =>
        ["string", "number", "boolean"].includes(typeof entry[1]),
      )
      .map(([key, item]) => [key, String(item).trim()]),
  );
}

function organization(content: PublishedContent): string {
  // 爬虫入库的内容在 metadata 里带真实机构名；用户发布的内容取作者机构。
  const data = metadata(content.metadata);
  return data.org || content.author.organization?.name || content.author.name || "平台官方";
}

function summary(content: PublishedContent): string {
  return content.summary?.trim() || content.body.trim().slice(0, 190);
}

function location(content: PublishedContent): string {
  return [content.region, content.city].filter(Boolean).join(" · ") || "全国";
}

function publishedDate(content: PublishedContent): Date {
  return content.publishedAt ?? new Date();
}

function publishedDays(content: PublishedContent): number {
  const date = publishedDate(content);
  const today = Date.parse(`${shanghaiDate.format(new Date())}T00:00:00Z`);
  const published = Date.parse(`${shanghaiDate.format(date)}T00:00:00Z`);
  return Math.max(0, Math.round((today - published) / 86_400_000));
}

function amountWan(value: string): number {
  const match = value.match(/(\d[\d,]*(?:\.\d+)?)\s*万/);
  if (match) return Number(match[1].replaceAll(",", ""));
  const yuan = value.match(/(\d[\d,]*(?:\.\d+)?)\s*元/);
  return yuan ? Number(yuan[1].replaceAll(",", "")) / 10_000 : 0;
}

function validDate(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function fundingDuration(value: string): FundingItem["duration"] {
  const allowed: FundingItem["duration"][] = ["6个月内", "6-12个月", "1-2年", "2年以上"];
  return allowed.includes(value as FundingItem["duration"])
    ? (value as FundingItem["duration"])
    : "详见原帖";
}

function fundingKind(value: string, subtype: string): FundingItem["kind"] {
  if (value === "寻求资源") return subtype.includes("物资") ? "物资" : "需求";
  return subtype.includes("物资") ? "物资" : "资助";
}

function employmentType(subtype: string): JobItem["kind"] {
  const allowed: JobItem["kind"][] = ["全职", "兼职", "实习", "志愿者", "顾问"];
  return allowed.includes(subtype as JobItem["kind"])
    ? (subtype as JobItem["kind"])
    : "全职";
}

function actionLabel(category: string): string {
  if (category === "公益工具模板库") return "⬇ 获取模板";
  if (category === "行业报告") return "⬇ 查看报告";
  if (category === "培训课程") return "查看课程";
  return "查看来源";
}

function firstLink(value: string): string {
  return value.split(/\r?\n/).map((link) => link.trim()).find(Boolean) ?? "#";
}

export class PrismaPlatformDataSource implements PlatformDataSource {
  async getFundings(): Promise<FundingItem[]> {
    await connection();
    const contents = await prisma.content.findMany({
      where: { module: "FUNDING", status: "PUBLISHED" },
      select: contentSelect,
      orderBy: { publishedAt: "desc" },
    });

    return contents.map((content) => {
      const data = metadata(content.metadata);
      const due = data.validUntil || (data.ongoing === "true" ? "长期有效" : "详见原帖");
      const today = shanghaiDate.format(new Date());
      const supportType = content.subtype.includes("物资") ? "物资" : "资金";
      const amount = data.amount || "详见原帖";

      return {
        id: content.id,
        kind: fundingKind(data.direction, content.subtype),
        type: data.type || content.subtype,
        supportType,
        duration: fundingDuration(data.duration),
        field: content.fields[0] ?? "其他",
        region: content.region || "全国",
        title: content.title,
        summary: summary(content),
        org: organization(content),
        location: location(content),
        amount,
        amountWan: amountWan(amount),
        due,
        publishedDays: publishedDays(content),
        openStatus: validDate(due) ? (due < today ? "已截止" : "开放中") : "以原帖为准",
        sourceName: data.sourceName || "平台发布",
        publishedDate: shanghaiDate.format(publishedDate(content)),
        url: data.applicationUrl || firstLink(data.relatedLinks || ""),
      };
    });
  }

  async getJobs(): Promise<JobItem[]> {
    await connection();
    const contents = await prisma.content.findMany({
      where: { module: "JOB", status: "PUBLISHED" },
      select: contentSelect,
      orderBy: { publishedAt: "desc" },
    });

    return contents.map((content) => {
      const data = metadata(content.metadata);
      const kind = employmentType(content.subtype);
      const salary = data.salary || [data.salaryMin, data.salaryMax]
        .filter(Boolean)
        .join("-");

      return {
        id: content.id,
        category: kind === "志愿者" ? "志愿者招募" : "人员招聘",
        kind,
        role: data.role || "其他",
        servicePeriod: data.servicePeriod === "短期" || data.servicePeriod === "长期"
          ? data.servicePeriod
          : undefined,
        time: `${publishedDays(content)}天前发布`,
        publishedDays: publishedDays(content),
        title: content.title,
        summary: summary(content),
        org: organization(content),
        location: location(content),
        salary: salary || "面议",
        due: data.deadline || "详见原帖",
        sourceName: data.sourceName || "平台发布",
        url: data.applicationLink || undefined,
      };
    });
  }

  async getTools(): Promise<ToolItem[]> {
    await connection();
    const contents = await prisma.content.findMany({
      where: { module: "TOOL", status: "PUBLISHED" },
      select: contentSelect,
      orderBy: { publishedAt: "desc" },
    });

    return contents.map((content) => {
      const data = metadata(content.metadata);
      const isFree = data.isFree === "true" || data.priceType === "免费";
      const meta = [data.dateText, location(content)].filter(Boolean).join(" · ");

      return {
        id: content.id,
        category: content.subtype,
        field: data.domain || content.fields[0] || "",
        forms: data.format ? [data.format] : [],
        duration: data.period || "",
        title: content.title,
        summary: summary(content),
        publisher: organization(content),
        tone: data.tone || "green",
        icon: data.icon || "📦",
        priceTag: isFree ? "免费" : data.priceType || "商业付费",
        meta,
        price: isFree ? undefined : data.price || undefined,
        action: data.action || actionLabel(content.subtype),
        publishedDays: publishedDays(content),
        downloads: Number(data.downloads) || 0,
        rating: Number(data.rating) || 5,
        url: data.downloadUrl || firstLink(data.relatedLinks || ""),
      };
    });
  }
}
