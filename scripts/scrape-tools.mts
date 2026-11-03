#!/usr/bin/env node
/**
 * 能力工具抓取脚本（BAML + MiniMax 版）
 *
 * 业务规则：
 *   - 只收录面向公益组织 / 社工机构 / 公益从业者的学习资源、工具模板、
 *     培训课程与行业资料；
 *   - 不收录商业广告、招生销售页、与公益能力建设无关的纯新闻。
 *
 * 来源：
 *   1. 恩友财务（cwgzmb / cwplmb）—— 财务工作模板与披露模板（结构化，直接入）
 *   2. 深圳国际公益学院 · 公益网校 —— 公开课程（结构化，直接入）
 *   3. 中国慈善联合会 · 培训动态（结构化，直接入）
 *   4. CFF 长青文献图书馆（结构化，直接入；历史快照里的基业长青 PDF 记录
 *      按 URL 路径里的日期修复 publishDate）
 *   5. 中国发展简报（CDB）—— 历史快照逐条重抓详情页，MiniMax 提取真实
 *      发布日期 / 摘要 / 分类；另从 /news/getData 增量补最新资讯。
 *
 * 缓存：CDB 记录保存 bodyHash + extraction，正文未变化不重复调 LLM。
 *
 * 用法：MINIMAX_API_KEY 配置在 .env 后运行 pnpm scrape:tools
 * 输出：src/lib/tools-data.json
 */

import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import * as cheerio from "cheerio";
import { b } from "../baml_client/index.ts";
import { setLogLevel } from "@boundaryml/baml";
import type { ToolExtraction } from "../baml_client/types.ts";

setLogLevel("ERROR");

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const OUT = path.join(ROOT, "src", "lib", "tools-data.json");
const UA = "InfiniteConnectionPreview/0.1 (+https://github.com/schneiderlin/infinite-connection)";
const GAP_MS = 300;
const LLM_CONCURRENCY = 4;
// 提取缓存版本：换模型或改 baml prompt 时 +1。
const EXTRACTION_VERSION = 1;
// CDB 增量补录：取列表 API 前 N 页（每页 8 条）。
const CDB_INCREMENTAL_PAGES = 5;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const clean = (value: unknown) =>
  String(value ?? "")
    .replace(/[\u200b-\u200d\ufeff]/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
const hashId = (value: string) => createHash("sha1").update(value).digest("hex").slice(0, 12);

function daysSince(dateStr: string) {
  if (!dateStr) return 0;
  const then = new Date(`${dateStr}T00:00:00+08:00`).getTime();
  if (Number.isNaN(then)) return 0;
  return Math.max(0, Math.round((Date.now() - then) / 86_400_000));
}

const normalizeUrl = (value: string) =>
  String(value ?? "").trim().replace(/^http:\/\//i, "https://").replace(/\/+$/, "").toLowerCase();
const titleKey = (item: any) => `${clean(item.org)}|${clean(item.title)}`.toLowerCase();

/* ---------- 展示字段映射 ---------- */

const CATEGORY_META: Record<string, { icon: string; color: string; tone: string; action: string }> = {
  "培训课程": { icon: "🎓", color: "#e8f5e9", tone: "green", action: "查看课程" },
  "行业沙龙会议": { icon: "🎤", color: "#fdf6ec", tone: "orange", action: "查看来源" },
  "公益工具模板库": { icon: "🧰", color: "#e3f2fd", tone: "sky", action: "⬇ 获取模板" },
  "行业报告": { icon: "📊", color: "#f3e5f5", tone: "purple", action: "⬇ 查看报告" },
  "行业标准": { icon: "📋", color: "#fce4ec", tone: "rose", action: "查看来源" },
  "同行经验文章": { icon: "📝", color: "#e0f2f1", tone: "mint", action: "阅读原文" },
  "国际经验": { icon: "🌏", color: "#e8eaf6", tone: "sand", action: "阅读原文" },
  "其他": { icon: "📦", color: "#f5f5f5", tone: "blue", action: "查看来源" },
};
const CATEGORY_ZH: Record<string, string> = {
  TRAINING: "培训课程", SALON: "行业沙龙会议", TEMPLATE: "公益工具模板库",
  REPORT: "行业报告", STANDARD: "行业标准", EXPERIENCE: "同行经验文章",
  INTERNATIONAL: "国际经验", OTHER: "其他",
};
const DOMAIN_ZH: Record<string, string> = {
  PM: "项目管理", FIN: "财务", COMMS: "传播", FUNDRAISE: "筹款",
  TEAM: "团队管理", GENERAL: "综合素养", DEGREE: "学位课程", OTHER: "其他",
};
const FORMAT_ZH: Record<string, string> = { ONLINE: "线上", OFFLINE: "线下", DOWNLOAD: "下载" };
const PERIOD_ZH: Record<string, string> = {
  M1: "1个月内", M6: "6个月内", M6_12: "6-12个月", Y1P: "1年期以上", UNKNOWN: "",
};

async function request(url: string, label: string = url): Promise<Response | null> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      const res = await fetch(url, {
        headers: { "User-Agent": UA },
        signal: AbortSignal.timeout(25_000),
        redirect: "follow",
      });
      if (res.status === 401 || res.status === 403 || res.status === 429) {
        throw new Error(`blocked: HTTP ${res.status}`);
      }
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res;
    } catch (error) {
      lastError = error;
      if (attempt < 3) await sleep(1_000 * attempt);
    }
  }
  console.warn(`  ! 请求失败 ${label}: ${lastError instanceof Error ? lastError.message : lastError}`);
  return null;
}

type AnyRecord = Record<string, any>;

function makeTool(opts: Partial<AnyRecord> & { title: string; url: string; category: string }): AnyRecord {
  const meta = CATEGORY_META[opts.category] ?? CATEGORY_META["其他"];
  const isFree = opts.isFree ?? true;
  const publishDate = opts.publishDate ?? "";
  return {
    id: `tool-${hashId(opts.url)}`,
    category: opts.category,
    title: clean(opts.title).slice(0, 180),
    url: opts.url,
    summary: clean(opts.summary ?? "").slice(0, 220),
    org: opts.org ?? "",
    isFree,
    priceText: isFree ? "免费" : (opts.priceText ?? "付费"),
    tags: [opts.category, opts.domain, isFree ? "免费" : "付费"].filter(Boolean),
    icon: meta.icon,
    color: meta.color,
    domain: opts.domain ?? "",
    format: opts.format ?? "",
    period: opts.period ?? "",
    dateText: publishDate ? publishDate.replace(/-/g, ".") : "",
    locationText: opts.locationText ?? "",
    sourceName: opts.sourceName ?? opts.org ?? "",
    downloadUrl: opts.downloadUrl ?? opts.url,
    publishDate,
    publishedDays: daysSince(publishDate),
    tone: meta.tone,
    action: meta.action,
  };
}

/* ---------- 结构化来源（字段由页面结构直接给出，不经 LLM） ---------- */

function inferDomain(text: string) {
  const t = String(text ?? "");
  if (/财务|会计|预算|报销|税务|出纳|审计|内控/.test(t)) return "财务";
  if (/筹款|募捐|捐赠|资助方/.test(t)) return "筹款";
  if (/传播|品牌|媒体|公关|舆情/.test(t)) return "传播";
  if (/团队|人力|治理|理事会|秘书长|领导力|战略|组织发展/.test(t)) return "团队管理";
  if (/项目|计划书|设计思维|评估|监测|逻辑模型|利益相关方/.test(t)) return "项目管理";
  return "综合素养";
}

const NFRIEND_PAGES = [
  {
    url: "http://www.nfriend.org/cwgzmb/",
    label: "恩友财务·财务工作模板",
    summary: "恩友财务提供的社会组织财务工作模板",
  },
  {
    url: "http://www.nfriend.org/cwplmb/",
    label: "恩友财务·披露模板",
    summary: "恩友财务提供的公益组织财务信息披露模板",
  },
];

async function scrapeNfriend(): Promise<AnyRecord[]> {
  const items: AnyRecord[] = [];
  for (const page of NFRIEND_PAGES) {
    const res = await request(page.url, page.label);
    if (!res) continue;
    const html = await res.text();
    const $ = cheerio.load(html);
    $("a").each((_, el) => {
      const href = $(el).attr("href") ?? "";
      if (!/\/file\/|youku\.com/i.test(href)) return;
      const title = clean($(el).text());
      if (!title || title.length < 2) return;
      const url = new URL(href, page.url).href;
      const isVideo = /youku\.com|视频/i.test(`${href} ${title}`);
      items.push(
        makeTool({
          title,
          url,
          summary: `${page.summary}${isVideo ? "（填报指南视频）" : "（可直接下载）"}`,
          org: "北京恩友财务",
          category: isVideo ? "培训课程" : "公益工具模板库",
          domain: "财务",
          format: isVideo ? "线上" : "下载",
          locationText: isVideo ? "线上" : "",
          sourceName: "恩友财务",
        }),
      );
    });
    await sleep(GAP_MS);
  }
  return items;
}

async function scrapeCGPI(): Promise<AnyRecord[]> {
  const url = "https://poa.cgpi.org.cn/course/explore";
  const res = await request(url, "公益网校");
  if (!res) return [];
  const html = await res.text();
  const $ = cheerio.load(html);
  const items: AnyRecord[] = [];
  $(".course-item").each((_, el) => {
    const anchor = $(el).find(".title a").first();
    const title = clean(anchor.text());
    const href = anchor.attr("href");
    if (!title || !href) return;
    const priceText = clean($(el).find(".course-price-widget").text()) || "免费";
    const isFree = /免费|free/i.test(priceText) && !/¥|￥|\d+元/.test(priceText);
    items.push(
      makeTool({
        title,
        url: new URL(href, url).href,
        summary: `深圳国际公益学院公益网校公开课${isFree ? "，可免费学习" : ""}`,
        org: "深圳国际公益学院",
        category: "培训课程",
        domain: inferDomain(title),
        format: "线上",
        locationText: "线上",
        isFree,
        priceText: isFree ? "免费" : priceText,
        sourceName: "公益网校",
      }),
    );
  });
  await sleep(GAP_MS);
  return items;
}

// 新闻宣传稿特征：结业 / 活动报道 / 政策解读，不是可报名的课程，不能归入"培训课程"。
const NEWS_RELEASE_PATTERN =
  /圆满结束|顺利举办|圆满落幕|圆满收官|圆满完成|成功举办|顺利举行|圆满举行|顺利召开|圆满召开|结业|开班|解读|宣贯|新闻稿|宣传报道|举办$/;

function inferTrainingCategory(title: string) {
  if (/沙龙|圆桌|研讨会|交流会|论坛|年会/.test(title)) return "行业沙龙会议";
  return NEWS_RELEASE_PATTERN.test(title) ? "其他" : "培训课程";
}

async function scrapeCharityAlliance(): Promise<AnyRecord[]> {
  const url = "https://www.charityalliance.org.cn/dl/xOqNx-252B.html";
  const res = await request(url, "中慈联培训动态");
  if (!res) return [];
  const html = await res.text();
  const $ = cheerio.load(html);
  const items: AnyRecord[] = [];
  $("a[href*='/ds/']").each((_, el) => {
    const raw = clean($(el).text());
    const dateMatch = raw.match(/(20\d{2})-(\d{2})-(\d{2})\s*$/);
    if (!dateMatch) return;
    const title = clean(raw.replace(/(20\d{2})-(\d{2})-(\d{2})\s*$/, ""));
    if (title.length < 8) return;
    const href = $(el).attr("href");
    if (!href) return;
    const publishDate = `${dateMatch[1]}-${dateMatch[2]}-${dateMatch[3]}`;
    const category = inferTrainingCategory(title);
    const online = /线上|在线|直播/.test(title);
    items.push(
      makeTool({
        title,
        url: new URL(href, url).href,
        summary: `中国慈善联合会培训动态：${title}`,
        org: "中国慈善联合会",
        category,
        domain: inferDomain(title),
        format: online ? "线上" : "线下",
        locationText: online ? "线上" : "",
        sourceName: "中国慈善联合会",
        publishDate,
      }),
    );
  });
  await sleep(GAP_MS);
  return items;
}

async function scrapeCFF(): Promise<AnyRecord[]> {
  const pages = [
    "https://www.cfforum.org.cn/category/166",
    "https://www.cfforum.org.cn/category/332",
  ];
  const items: AnyRecord[] = [];
  for (const url of pages) {
    const res = await request(url, "CFF 长青文献图书馆");
    if (!res) continue;
    const html = await res.text();
    const $ = cheerio.load(html);
    $(".listRight a").each((_, el) => {
      const href = $(el).attr("href") ?? "";
      if (!/\.pdf($|\?)/i.test(href)) return;
      const title = clean($(el).text());
      if (!title) return;
      items.push(
        makeTool({
          title,
          url: new URL(href, url).href,
          summary: `CFF 长青文献图书馆资料：${title}`,
          org: "北京基业长青社会组织服务中心",
          category: "行业报告",
          domain: inferDomain(title),
          format: "下载",
          sourceName: "CFF 长青文献图书馆",
        }),
      );
    });
    await sleep(GAP_MS);
  }
  return items;
}

/* ---------- CDB：详情页重抓 + MiniMax 提取 ---------- */

async function fetchCDBDetail(url: string) {
  const res = await request(url, `CDB ${url.split("/").pop()}`);
  if (!res) return null;
  const html = await res.text();
  const $ = cheerio.load(html);
  const body = clean($(".detail-content").text());
  const publishDate =
    clean($(".tips .time span").first().text()).match(/20\d{2}-\d{2}-\d{2}/)?.[0] ?? "";
  return { body, publishDate };
}

function mapCDBRecord(
  previous: AnyRecord | undefined,
  url: string,
  title: string,
  publishDate: string,
  bodyHash: string,
  extraction: ToolExtraction,
): AnyRecord {
  const category = CATEGORY_ZH[extraction.category] ?? "其他";
  const record = makeTool({
    title,
    url,
    category,
    summary: extraction.summary,
    org: clean(extraction.org) || previous?.org || "中国发展简报",
    domain: DOMAIN_ZH[extraction.domain] ?? "其他",
    format: extraction.format ? FORMAT_ZH[extraction.format] ?? "" : "",
    period: PERIOD_ZH[extraction.period] ?? "",
    isFree: extraction.is_free,
    locationText: extraction.format === "ONLINE" ? "线上" : "",
    sourceName: "中国发展简报",
    publishDate,
  });
  return {
    ...record,
    bodyHash,
    extractionVersion: EXTRACTION_VERSION,
    extraction,
  };
}

async function extractTools(
  tasks: { url: string; title: string; publishDate: string; body: string; previous?: AnyRecord }[],
) {
  const kept: AnyRecord[] = [];
  let reused = 0;
  let extracted = 0;
  let rejected = 0;

  let cursor = 0;
  const worker = async () => {
    while (cursor < tasks.length) {
      const task = tasks[cursor];
      cursor += 1;
      const bodyHash = hashId(task.body);

      let extraction: ToolExtraction | undefined;
      if (
        task.previous?.bodyHash === bodyHash &&
        task.previous.extraction &&
        task.previous.extractionVersion === EXTRACTION_VERSION
      ) {
        extraction = task.previous.extraction as ToolExtraction;
        reused += 1;
      } else {
        try {
          extraction = await b.ExtractTool(task.title, task.publishDate, task.body);
          extracted += 1;
        } catch (error) {
          console.warn(`  ! 提取失败，跳过: ${task.title.slice(0, 36)} (${error instanceof Error ? error.message : error})`);
          continue;
        }
      }

      if (!extraction.is_relevant) {
        rejected += 1;
        console.log(`  - 不收录（${extraction.reject_reason ?? "未说明"}）: ${task.title.slice(0, 36)}`);
        continue;
      }
      kept.push(mapCDBRecord(task.previous, task.url, task.title, task.publishDate, bodyHash, extraction));
    }
  };
  await Promise.all(Array.from({ length: LLM_CONCURRENCY }, worker));
  console.log(`MiniMax 提取：复用 ${reused}，新提取 ${extracted}，判为不收录 ${rejected}，入库 ${kept.length}`);
  return kept;
}

// 历史 CDB 记录：重抓详情页修日期/摘要/分类；抓取失败（404 等）的丢弃。
async function rebuildCDB(existing: AnyRecord[]): Promise<AnyRecord[]> {
  const cdb = existing.filter((item) => item.sourceName === "中国发展简报");
  console.log(`CDB 重建：${cdb.length} 条历史记录，开始重抓详情页…`);
  const tasks: { url: string; title: string; publishDate: string; body: string; previous: AnyRecord }[] = [];
  const carryover: AnyRecord[] = [];
  let cursor = 0;
  const FETCH_CONCURRENCY = 4;
  const worker = async () => {
    while (cursor < cdb.length) {
      const item = cdb[cursor];
      cursor += 1;
      const detail = await fetchCDBDetail(item.url);
      await sleep(GAP_MS);
      if (!detail || detail.body.length < 100) {
        // 抓取失败（含 404）：原样保留旧记录（去掉审核时代字段），不因一次网络问题丢数据。
        carryover.push(fixLegacyRecord(item));
        continue;
      }
      tasks.push({
        url: item.url,
        title: item.title,
        publishDate: detail.publishDate || item.publishDate,
        body: detail.body,
        previous: item,
      });
    }
  };
  await Promise.all(Array.from({ length: FETCH_CONCURRENCY }, worker));
  // 并发抓取失败的，串行重试一次（部分老文章偶发响应慢）。
  if (carryover.length) {
    const retry: AnyRecord[] = [];
    for (const item of carryover) {
      const detail = await fetchCDBDetail(item.url);
      await sleep(1_000);
      if (detail && detail.body.length >= 100) {
        retry.push(item);
        tasks.push({
          url: item.url,
          title: item.title,
          publishDate: detail.publishDate || item.publishDate,
          body: detail.body,
          previous: item,
        });
      }
    }
    for (const item of retry) carryover.splice(carryover.indexOf(item), 1);
    if (retry.length) console.log(`CDB 重建：串行重试救回 ${retry.length} 条`);
  }
  console.log(`CDB 重建：详情页获取成功 ${tasks.length} 条，失败 ${carryover.length} 条`);
  // 失败记录里从未成功提取过的（图文型老文章，纯文本过短）：没有可靠字段可保留，直接丢弃。
  // 提取过的记录保留（可能只是一时网络抖动）。
  const keep = carryover.filter((item) => item.extraction);
  const dropped = carryover.length - keep.length;
  if (dropped) {
    console.log(`CDB 重建：丢弃 ${dropped} 条图文型老记录（正文过短无法提取）`);
    for (const item of carryover.filter((i) => !i.extraction)) {
      console.log(`  - 丢弃：${item.title.slice(0, 40)}`);
    }
  }
  const rebuilt = await extractTools(tasks);
  return [...rebuilt, ...keep];
}

// CDB 增量：列表 API 前 N 页里的新 id。
async function incrementalCDB(knownUrls: Set<string>): Promise<AnyRecord[]> {
  const fresh: { id: number; title: string; createTime: string }[] = [];
  for (let pageNum = 1; pageNum <= CDB_INCREMENTAL_PAGES; pageNum += 1) {
    const res = await request(
      "https://www.chinadevelopmentbrief.org.cn/news/getData",
      `CDB 资讯列表 p${pageNum}`,
    );
    if (!res) break;
    try {
      const json = await res.json();
      const list = json?.result?.list ?? [];
      for (const row of list) {
        const url = `https://www.chinadevelopmentbrief.org.cn/news/detail/${row.id}.html`;
        if (!knownUrls.has(normalizeUrl(url))) {
          fresh.push({ id: row.id, title: row.title, createTime: row.createTime });
        }
      }
    } catch {
      break;
    }
    await sleep(GAP_MS);
  }
  const novel = [...new Map(fresh.map((row) => [row.id, row])).values()];
  console.log(`CDB 增量：列表前 ${CDB_INCREMENTAL_PAGES} 页中新 URL ${novel.length} 条`);
  const tasks: { url: string; title: string; publishDate: string; body: string }[] = [];
  for (const row of novel) {
    const url = `https://www.chinadevelopmentbrief.org.cn/news/detail/${row.id}.html`;
    const detail = await fetchCDBDetail(url);
    await sleep(GAP_MS);
    if (!detail || detail.body.length < 100) continue;
    tasks.push({ url, title: row.title, publishDate: detail.publishDate || row.createTime, body: detail.body });
  }
  return extractTools(tasks);
}

/* ---------- 历史非 CDB 记录：修 CFF 的 publishDate（URL 路径含日期） ---------- */

function fixLegacyRecord(item: AnyRecord): AnyRecord {
  // 去掉审核时代的遗留字段（status / aiSuggestedCategory / aiConfidence），
  // 并按分类重算展示字段（修掉老数据里"立即报名"这类错配的 action）。
  const { status: _s, aiSuggestedCategory: _a, aiConfidence: _c, ...fixed } = item;
  const meta = CATEGORY_META[fixed.category];
  if (meta) {
    fixed.icon = meta.icon;
    fixed.color = meta.color;
    fixed.tone = meta.tone;
    fixed.action = meta.action;
  }
  const urlDate = String(item.url ?? "").match(/\/(20\d{6})\//)?.[1];
  if (urlDate) {
    const iso = `${urlDate.slice(0, 4)}-${urlDate.slice(4, 6)}-${urlDate.slice(6, 8)}`;
    if (iso !== item.publishDate) {
      fixed.publishDate = iso;
      fixed.publishedDays = daysSince(iso);
      fixed.dateText = iso.replace(/-/g, ".");
    }
  }
  return fixed;
}

/* ---------- 主流程 ---------- */

async function main() {
  if (!process.env.MINIMAX_API_KEY) {
    try {
      process.loadEnvFile(path.join(ROOT, ".env"));
    } catch {}
    if (!process.env.MINIMAX_API_KEY) {
      console.error("缺少 MINIMAX_API_KEY：请在 .env 中配置后再运行。");
      process.exit(1);
    }
  }

  let existing: AnyRecord[] = [];
  try {
    existing = JSON.parse(await readFile(OUT, "utf8"));
    console.log(`已有记录：${existing.length} 条（审核状态与已审核分类保留）`);
  } catch {
    console.log("未找到既有 tools-data.json，将从空列表开始。");
  }

  const cdbRebuilt = await rebuildCDB(existing);
  const legacyOthers = existing
    .filter((item) => item.sourceName !== "中国发展简报")
    .map(fixLegacyRecord);

  const knownUrls = new Set(
    [...cdbRebuilt, ...legacyOthers].map((item) => normalizeUrl(item.url)).filter(Boolean),
  );
  const cdbIncremental = await incrementalCDB(knownUrls);

  const structured: AnyRecord[] = [];
  const sources = [
    { name: "恩友财务", scrape: scrapeNfriend },
    { name: "深圳国际公益学院·公益网校", scrape: scrapeCGPI },
    { name: "中国慈善联合会·培训", scrape: scrapeCharityAlliance },
    { name: "CFF 长青文献图书馆", scrape: scrapeCFF },
  ];
  for (const [i, src] of sources.entries()) {
    if (i > 0) await sleep(GAP_MS);
    try {
      const items = await src.scrape();
      console.log(`✅ ${src.name}: ${items.length} 条`);
      structured.push(...items);
    } catch (error) {
      console.log(`❌ ${src.name}: ${error instanceof Error ? error.message : error}`);
    }
  }

  // 合并：CDB 重建结果 + 增量 + 结构化新源 + 历史非 CDB 记录，按 URL/标题去重。
  const merged: AnyRecord[] = [];
  const seenUrls = new Set<string>();
  const seenTitles = new Set<string>();
  const push = (item: AnyRecord, isNew: boolean) => {
    if (!item.url || !item.title) return;
    const urlKey = normalizeUrl(item.url);
    const key = titleKey(item);
    if (seenUrls.has(urlKey) || seenTitles.has(key)) return;
    seenUrls.add(urlKey);
    seenTitles.add(key);
    merged.push(item);
    if (isNew) console.log(`  + 新增：${item.title.slice(0, 40)}`);
  };
  for (const item of cdbRebuilt) push(item, false);
  for (const item of cdbIncremental) push(item, true);
  for (const item of structured) {
    // 结构化来源的新记录默认 PENDING；与历史记录重复时保留历史记录。
    push(item, true);
  }
  for (const item of legacyOthers) push(item, false);

  const final = merged.sort((a, b) => a.publishedDays - b.publishedDays);

  await writeFile(OUT, `${JSON.stringify(final, null, 2)}\n`, "utf8");

  const bySource: Record<string, number> = {};
  for (const item of final) {
    const name = item.sourceName || item.org || "未知来源";
    bySource[name] = (bySource[name] ?? 0) + 1;
  }
  console.log("\n来源统计：", bySource);
  console.log(`\n📊 合计 ${final.length} 条`);
  console.log(`✅ 已写入 ${path.relative(ROOT, OUT)}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
