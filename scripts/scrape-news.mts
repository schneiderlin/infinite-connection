#!/usr/bin/env node
/**
 * 公益资讯/动态抓取脚本（BAML + MiniMax 版）
 *
 * 用途：抓取机构官网的资讯动态（项目进展、活动报道、行业报告发布、救灾响应等），
 * 与资助机会分开存放，供"项目动态"板块使用。
 *
 * 数据源：
 *   1. 中国红十字基金会 · 新闻动态（rdjs_xinwenzhongxin 栏目，按 pn 翻页）
 *
 * 提取与缓存规则同资助脚本：快照里保存 bodyHash + extraction，正文未变化不重复调 LLM。
 *
 * 用法：MINIMAX_API_KEY 配置在 .env 后运行 pnpm scrape:news
 * 输出：src/lib/news-data.json
 */

import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import * as cheerio from "cheerio";
import { b } from "../baml_client/index.ts";
import { setLogLevel } from "@boundaryml/baml";
import type { NewsExtraction } from "../baml_client/types.ts";

setLogLevel("ERROR");

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const OUT = path.join(ROOT, "src", "lib", "news-data.json");
const UA = "InfiniteConnectionPreview/0.1 (+https://github.com/schneiderlin/infinite-connection)";
const GAP_MS = 900;
const LLM_CONCURRENCY = 4;
// 提取缓存版本：换模型或改 baml prompt 时 +1。
const EXTRACTION_VERSION = 1;

const CRCF_NEWS_BASE =
  "https://www.crcf.org.cn/web/newspage/xinwenzhongxin_rendaojishi.thtml?classFlag=rdjs_xinwenzhongxin";
const CRCF_MAX_PAGES = 6;

const FIELD_ZH: Record<string, string> = {
  RURAL_EDU: "乡村教育", ECO: "生态环保", LIVELIHOOD: "产业生计", CULTURE: "文化传承",
  TALENT: "人才培育", DISABILITY: "残障融合", CHILD: "儿童保护", YOUTH: "青少年发展",
  ELDERLY: "老龄关怀", HEALTH: "医疗健康", MENTAL: "心理健康", WOMEN: "女性关怀",
  COMMUNITY: "社区营造", EMERGENCY: "应急救援", VOLUNTEER: "志愿服务",
  ORG_SUPPORT: "社会组织支持", INNOVATION: "创新探索", OTHER: "其他",
};
const NEWS_TYPE_ZH: Record<string, string> = {
  PROJECT_PROGRESS: "项目进展", ORGANIZATION_NEWS: "机构动态", EVENT_REPORT: "活动报道",
  INDUSTRY_INSIGHT: "行业观察", POLICY_RELEASE: "政策发布", RELIEF_RESPONSE: "救灾响应",
  OTHER: "其他",
};

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const todayISO = () => new Date().toISOString().slice(0, 10);
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

async function requestText(url: string, label: string) {
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
      return await res.text();
    } catch (error) {
      lastError = error;
      if (attempt < 3) await sleep(1_200 * attempt);
    }
  }
  console.warn(`  ! 请求失败 ${label}: ${lastError instanceof Error ? lastError.message : lastError}`);
  return null;
}

type Candidate = {
  title: string;
  publishedDate: string;
  body: string;
  url: string;
  sourceName: string;
};

async function scrapeCRCFNews(): Promise<Candidate[]> {
  const found = new Map<string, Candidate>();

  for (let pn = 1; pn <= CRCF_MAX_PAGES; pn += 1) {
    const listUrl = `${CRCF_NEWS_BASE}&pn=${pn}`;
    const html = await requestText(listUrl, `CRCF 新闻动态 p${pn}`);
    if (!html) break;
    const $ = cheerio.load(html);
    let added = 0;
    $("a[href*='cid=']").each((_, el) => {
      const title = clean($(el).text());
      const href = $(el).attr("href");
      if (!title || !href || title.length < 6) return;
      const url = new URL(href, CRCF_NEWS_BASE).href;
      if (found.has(url)) return;
      const listDate = clean($(el).closest("li").find(".am-list-date, .s_lm_date, .time").text());
      found.set(url, { title, publishedDate: listDate, body: "", url, sourceName: "中国红十字基金会" });
      added += 1;
    });
    console.log(`CRCF 新闻动态 p${pn}：新增 ${added} 条`);
    await sleep(GAP_MS);
    if (!added) break;
  }

  const accepted: Candidate[] = [];
  for (const row of found.values()) {
    const detail = await requestText(row.url, `CRCF ${row.title}`);
    await sleep(GAP_MS);
    if (!detail) continue;
    const page = cheerio.load(detail);
    const body = clean(page(".r_detail_body").text() || page(".content").text());
    if (body.length < 120) continue;
    const dateText =
      clean(page(".r_detail_title_date").text()) ||
      clean(page(".r_detail_time").text()) ||
      row.publishedDate ||
      body.match(/20\d{2}[-./年]\d{1,2}[-./月]\d{1,2}/)?.[0] ||
      "";
    const dateMatch = dateText.match(/(20\d{2})[年\-/.](\d{1,2})[月\-/.](\d{1,2})/);
    accepted.push({
      ...row,
      body,
      publishedDate: dateMatch
        ? `${dateMatch[1]}-${String(dateMatch[2]).padStart(2, "0")}-${String(dateMatch[3]).padStart(2, "0")}`
        : todayISO(),
    });
  }
  console.log(`CRCF 新闻动态：取得正文 ${accepted.length} 条`);
  return accepted;
}

function mapRecord(candidate: Candidate, extraction: NewsExtraction, bodyHash: string) {
  return {
    id: `news-${hashId(candidate.url)}`,
    title: candidate.title,
    summary: extraction.summary,
    org: clean(extraction.org) || "中国红十字基金会",
    newsType: NEWS_TYPE_ZH[extraction.news_type] ?? "其他",
    field: extraction.field ? FIELD_ZH[extraction.field] ?? "其他" : "",
    publishedDate: candidate.publishedDate,
    publishedDays: daysSince(candidate.publishedDate),
    sourceName: candidate.sourceName,
    url: candidate.url,
    bodyHash,
    extractionVersion: EXTRACTION_VERSION,
    extraction,
  };
}

type AnyRecord = Record<string, any>;

async function extractAll(candidates: Candidate[], previousByUrl: Map<string, AnyRecord>) {
  const kept: AnyRecord[] = [];
  let reused = 0;
  let extracted = 0;
  let rejected = 0;

  const tasks = candidates.map((candidate) => ({ candidate, previous: previousByUrl.get(candidate.url) }));
  let cursor = 0;
  const worker = async () => {
    while (cursor < tasks.length) {
      const task = tasks[cursor];
      cursor += 1;
      const { candidate, previous } = task;
      const bodyHash = hashId(candidate.body);

      let extraction: NewsExtraction | undefined;
      if (previous?.bodyHash === bodyHash && previous.extraction && previous.extractionVersion === EXTRACTION_VERSION) {
        extraction = previous.extraction as NewsExtraction;
        reused += 1;
      } else {
        try {
          extraction = await b.ExtractNews(
            candidate.title,
            candidate.sourceName,
            candidate.publishedDate,
            candidate.body,
          );
          extracted += 1;
        } catch (error) {
          console.warn(`  ! 提取失败，跳过: ${candidate.title} (${error instanceof Error ? error.message : error})`);
          continue;
        }
      }

      if (!extraction.is_relevant) {
        rejected += 1;
        console.log(`  - 不收录（${extraction.reject_reason ?? "未说明"}）: ${candidate.title.slice(0, 36)}`);
        continue;
      }
      kept.push(mapRecord(candidate, extraction, bodyHash));
    }
  };
  await Promise.all(Array.from({ length: LLM_CONCURRENCY }, worker));
  console.log(`MiniMax 提取：复用 ${reused}，新提取 ${extracted}，判为不收录 ${rejected}，入库 ${kept.length}`);
  return kept;
}

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
    console.log(`已有资讯记录：${existing.length} 条`);
  } catch {
    console.log("未找到既有 news-data.json，将从空列表开始。");
  }
  const previousByUrl = new Map<string, AnyRecord>(
    existing.filter((item) => item.url).map((item) => [item.url, item]),
  );

  const candidates = await scrapeCRCFNews();
  console.log(`\n候选合计 ${candidates.length} 条，开始 MiniMax 提取…`);
  const records = await extractAll(candidates, previousByUrl);
  if (candidates.length > 0 && records.length === 0) {
    console.error("提取结果为空：疑似 LLM 调用全部失败，已保留原快照不做覆盖。");
    process.exit(1);
  }

  const seen = new Set<string>();
  const deduped = records.filter((item) => {
    const key = item.title.replace(/[^\u4e00-\u9fa5A-Za-z0-9]/g, "").slice(0, 14);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  console.log(`去重后 ${deduped.length} 条（原始 ${records.length} 条）`);

  const all = deduped.sort((a, b) => a.publishedDays - b.publishedDays);

  await writeFile(OUT, `${JSON.stringify(all, null, 2)}\n`, "utf8");
  console.log("\n写入完成：", OUT);
  console.log(`总计 ${all.length} 条`);
  for (const item of all) {
    console.log(`- ${item.publishedDate} | ${item.newsType} | ${item.org} | ${item.title}`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
