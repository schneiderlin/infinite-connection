#!/usr/bin/env node
/**
 * 公益招聘抓取脚本（BAML + MiniMax 版）
 *
 * 业务规则：
 *   - 只保留公益组织 / 社会组织 / 基金会 / 社工机构 / 协会 / 国际组织 /
 *     公益项目的岗位（全职/兼职/实习/志愿者/顾问）；
 *   - 排除商业公司（有限公司、管理咨询、文化发展公司、猎头/劳务）；
 *   - 判断全部交给 MiniMax（baml_src/jobs.baml 的 ExtractJob），
 *     本脚本只保留候选发现与正文抓取。
 *
 * 来源：
 *   1. 中国发展简报 · NGO招聘（/search/jobs/getData 列表 + 详情页正文）
 *   2. 壹基金 · 工作机会（官网列表 + 详情页）
 *   3. 美丽中国支教 · 成为员工（官网博客列表 + 详情页）
 *   4. 中国公共招聘网（社工/公益关键词，详情页）
 *   5. NGO Job Board（公开 RSS）
 *   6. ReliefWeb Jobs（公开 RSS，node:https 抓取——其 ELB 拒绝 undici）
 *
 * 缓存：快照里每条保存 bodyHash + extraction，正文未变化不重复调 LLM。
 *
 * 用法：MINIMAX_API_KEY 配置在 .env 后运行 pnpm scrape:jobs
 * 输出：src/lib/jobs-scraped.json
 */

import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import https from "node:https";
import * as cheerio from "cheerio";
import { b } from "../baml_client/index.ts";
import { setLogLevel } from "@boundaryml/baml";
import type { JobExtraction } from "../baml_client/types.ts";

setLogLevel("ERROR");

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const OUT = path.join(ROOT, "src", "lib", "jobs-scraped.json");
const UA = "InfiniteConnectionPreview/0.1 (+https://github.com/schneiderlin/infinite-connection)";
const GAP_MS = 400;
const LLM_CONCURRENCY = 4;
// 提取缓存版本：换模型或改 baml prompt 时 +1。
const EXTRACTION_VERSION = 7;
const PER_SOURCE = 20;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const clean = (value: unknown) =>
  String(value ?? "")
    .replace(/[\u200b-\u200d\ufeff]/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#(?:39|x27);/gi, "'")
    .replace(/\s+/g, " ")
    .trim();

const cleanJobTitle = (extractedTitle: string, sourceTitle: string) => {
  const source = clean(sourceTitle);
  return clean(extractedTitle).replace(/[（(]([^()（）]+)[）)]/g, (match, note: string) =>
    source.includes(clean(note)) ? match : "",
  );
};
const hashId = (value: string) => createHash("sha1").update(value).digest("hex").slice(0, 12);
// 页面浏览计数（"浏览 1166 次"）每次访问自增，直接 hash 会导致缓存永远失效；
// 计算 bodyHash 前先剥离这类计数。
const hashBody = (body: string) =>
  body.replace(/(浏览|阅读|查看|访问量|分享|收藏|点赞)\s*[:：]?\s*\d[\d,]*\s*(次|人|个|条)?/g, "");
const todayISO = () => new Date().toISOString().slice(0, 10);

function ageOf(dateStr: string) {
  const then = new Date(dateStr).getTime();
  if (Number.isNaN(then)) return { publishedDays: 36500, time: "发布时间未知" };
  const days = Math.max(0, Math.round((Date.now() - then) / 86_400_000));
  const time =
    days === 0 ? "今天发布"
      : days === 1 ? "昨天发布"
        : days < 7 ? `${days}天前发布`
          : days < 30 ? `${Math.floor(days / 7)}周前发布`
            : `${Math.floor(days / 30)}个月前发布`;
  return { publishedDays: days, time };
}

async function request(url: string, options: RequestInit = {}, label: string = url): Promise<Response | null> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      const res = await fetch(url, {
        ...options,
        headers: { "User-Agent": UA, ...(options.headers ?? {}) },
        signal: AbortSignal.timeout(25_000),
      });
      if (res.status === 401 || res.status === 403 || res.status === 429) {
        throw new Error(`blocked: HTTP ${res.status}`);
      }
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res;
    } catch (error) {
      lastError = error;
      if (attempt < 3) await sleep(1_200 * attempt);
    }
  }
  console.warn(`  ! 请求失败 ${label}: ${lastError instanceof Error ? lastError.message : lastError}`);
  return null;
}

// ReliefWeb 的 ELB 对 undici（Node 全局 fetch）一律 406，node:https 可正常通过。
function httpsGetText(url: string): Promise<string | null> {
  return new Promise((resolve) => {
    https
      .get(url, { headers: { "User-Agent": UA } }, (res) => {
        if (res.statusCode !== 200) {
          res.resume();
          resolve(null);
          return;
        }
        let data = "";
        res.setEncoding("utf8");
        res.on("data", (chunk) => (data += chunk));
        res.on("end", () => resolve(data));
      })
      .on("error", () => resolve(null));
  });
}

const KIND_ZH: Record<string, string> = {
  FULLTIME: "全职", PARTTIME: "兼职", INTERN: "实习", VOLUNTEER: "志愿者", CONSULTANT: "兼职",
};
const GROUP_ZH: Record<string, string> = {
  P: "项目与服务", R: "资源与筹资", C: "合规与ESG", S: "战略与研究", O: "运营与支持",
};
const SUBCATEGORY_ZH: Record<string, string> = {
  P1: "社会工作与社区服务", P2: "公益项目执行", P3: "企业CSR", P4: "企业ESG",
  R1: "公益筹资与拓展",
  C1: "公益组织合规", C2: "ESG信息披露与报告", C3: "ESG评级与合规",
  S1: "政策与倡导", S2: "行业研究与咨询", S3: "战略规划与管理",
  O1: "传播与品牌", O2: "人力与组织发展", O3: "财务与行政", O4: "产品与技术",
};
const LEVEL_ZH: Record<string, string> = {
  L1: "L1 入门执行", L2: "L2 独立执行", L3: "L3 模块主管",
  L4: "L4 中层管理", L5: "L5 高层管理", L6: "L6 决策层",
};
const EDUCATION_ZH: Record<string, string> = {
  DOCTOR: "博士", MASTER: "硕士", BACHELOR: "本科", COLLEGE: "大专", TECHNICAL: "中专/中技", ANY: "不限",
};
const ORGTYPE_ZH: Record<string, string> = {
  FOUNDATION: "基金会", CHARITY_ASSOC: "慈善会", MINFEI: "民非", COMPANY: "企业",
  SOCIAL_WORK: "社工机构", ASSOCIATION: "社会团体/协会", INTERNATIONAL: "国际NGO/国际组织", OTHER: "其他",
};
const PROVINCE_NAMES = [
  "北京", "天津", "上海", "重庆", "河北", "山西", "辽宁", "吉林", "黑龙江", "江苏", "浙江",
  "安徽", "福建", "江西", "山东", "河南", "湖北", "湖南", "广东", "海南", "四川", "贵州",
  "云南", "陕西", "甘肃", "青海", "台湾", "内蒙古", "广西", "西藏", "宁夏", "新疆",
];
const PROVINCE_SUFFIX: Record<string, string> = {
  北京: "市", 天津: "市", 上海: "市", 重庆: "市", 内蒙古: "自治区", 广西: "壮族自治区",
  西藏: "自治区", 宁夏: "回族自治区", 新疆: "维吾尔自治区",
};

function normalizeLocation(value: string | null | undefined): string {
  if (!value) return "详见原帖";
  const v = clean(value);
  if (/线上|远程|remote/i.test(v)) return "线上";
  for (const p of PROVINCE_NAMES) {
    if (v.startsWith(p)) {
      const suffix = PROVINCE_SUFFIX[p] ?? "省";
      const rest = v.slice(p.length).replace(/^[·\-—\s]*/, "");
      const city = rest.match(/^([\u4e00-\u9fa5]{2,7}市)/)?.[1];
      return city ? `${p}${suffix}·${city}` : `${p}${suffix}`;
    }
  }
  return v;
}

function normalizeSalary(value: string | null | undefined): string {
  if (!value) return "详见原帖";
  const v = clean(value);
  if (/^\d[\d,]*[-—~]\d[\d,]*元(\/月|\/天)?$/.test(v)) return v.includes("/") ? v : `${v}/月`;
  if (/^\d[\d,]*元(\/月|\/天)$/.test(v)) return v;
  if (v === "面议" || v === "志愿服务" || v === "详见原帖") return v;
  return "详见原帖";
}

/* ---------- 候选（标题/机构线索/正文/日期/链接） ---------- */

type Candidate = {
  title: string;
  orgHint: string;
  body: string;
  publishedDate: string;
  url: string;
  sourceName: string;
};

function bestBody($: cheerio.CheerioAPI, selectors: string[]) {
  for (const sel of selectors) {
    const text = clean($(sel).first().text());
    if (text.length >= 120) return text;
  }
  return "";
}

/* ---------- 来源 1：中国发展简报 · NGO招聘 ---------- */

async function scrapeCDB(): Promise<Candidate[]> {
  const res = await request(
    "https://www.chinadevelopmentbrief.org.cn/search/jobs/getData",
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: "search=0&pageNum=1&pageSize=500",
    },
    "CDB 招聘列表",
  );
  if (!res) return [];
  const data = await res.json().catch(() => null);
  const list = data?.result?.list ?? [];
  console.log(`CDB 招聘：列表 ${list.length} 条`);

  const accepted: Candidate[] = [];
  for (const row of list) {
    const url = `https://www.chinadevelopmentbrief.org.cn/jobs/detail/${row.id}.html`;
    const detail = await request(url, {}, `CDB job ${row.id}`);
    await sleep(GAP_MS);
    if (!detail) continue;
    const $ = cheerio.load(await detail.text());
    const body = bestBody($, [".content", ".detail-content", ".jobs-detail", "article", "main"]);
    if (body.length < 120) continue;
    accepted.push({
      title: clean(row.title),
      orgHint: clean(row.orgName ?? row.owner ?? ""),
      body,
      publishedDate: (row.updateTime || row.createTime || "").slice(0, 10),
      url,
      sourceName: "中国发展简报·NGO招聘",
    });
  }
  console.log(`CDB 招聘：取得正文 ${accepted.length} 条`);
  return accepted;
}

/* ---------- 来源 2：壹基金 ---------- */

async function scrapeOneFoundation(): Promise<Candidate[]> {
  const listUrl = "https://onefoundation.cn/jobs";
  const html = await request(listUrl, {}, "壹基金列表");
  if (!html) return [];
  // 职位链接在 JS 数据里，直接用裸 HTML 正则发现；标题取详情页的 .form_header h3。
  const rawHtml = await html.text();
  const urls = [...new Set(
    [...rawHtml.matchAll(/\/jobs\/[0-9a-z]{10,}\//g)].map((m) => new URL(m[0], listUrl).href),
  )];
  console.log(`壹基金：列表 ${urls.length} 条`);

  const accepted: Candidate[] = [];
  for (const url of urls.slice(0, PER_SOURCE)) {
    const detail = await request(url, {}, `壹基金 ${url.split("/").at(-2)}`);
    await sleep(GAP_MS);
    if (!detail) continue;
    const page = cheerio.load(await detail.text());
    const title = clean(page(".form_header h3").first().text()) || clean(page("h1").first().text());
    const body = bestBody(page, [".job_list", ".text_content", "article", "main"]);
    if (!title || body.length < 120) continue;
    accepted.push({ title, orgHint: "壹基金", body, publishedDate: "", url, sourceName: "壹基金·工作机会" });
  }
  console.log(`壹基金：取得正文 ${accepted.length} 条`);
  return accepted;
}

/* ---------- 来源 3：美丽中国支教 ---------- */

async function scrapeMlzg(): Promise<Candidate[]> {
  const listUrl = "http://www.meilizhongguo.org/join-us";
  const res = await request(listUrl, {}, "美丽中国列表");
  if (!res) return [];
  const html = await res.text();
  const links = new Map<string, string>();
  for (const match of html.matchAll(/<a[^>]+href="(?:https?:\/\/www\.meilizhongguo\.org)?(\/blog\/[0-9a-z]+)"[^>]*>([\s\S]*?)<\/a>/gi)) {
    const url = `http://www.meilizhongguo.org${match[1]}`;
    const title = clean(match[2].replace(/<[^>]+>/g, " "));
    if (title.length >= 4 && !links.has(url)) links.set(url, title);
  }
  console.log(`美丽中国：列表 ${links.size} 条`);

  const accepted: Candidate[] = [];
  for (const [url, title] of [...links].slice(0, PER_SOURCE)) {
    const detail = await request(url, {}, `美丽中国 ${title.slice(0, 20)}`);
    await sleep(GAP_MS);
    if (!detail) continue;
    const page = cheerio.load(await detail.text());
    const body = bestBody(page, [".s-blog-content", ".blog-content", ".content", "article", ".detail", "main"]);
    if (body.length < 120) continue;
    // 列表锚文本是"查看职位详情"按钮，真实职位名取详情页标题。
    const realTitle =
      clean(page(".s-blog-title").first().text()) ||
      clean(page("h1").first().text()) ||
      clean(page("title").text()).split(/[|｜-]/)[0].trim();
    accepted.push({ title: realTitle || title, orgHint: "美丽中国支教", body, publishedDate: "", url, sourceName: "美丽中国支教·成为员工" });
  }
  console.log(`美丽中国：取得正文 ${accepted.length} 条`);
  return accepted;
}

/* ---------- 来源 4：中国公共招聘网 ---------- */

const MOHRSS_KEYWORDS = ["社会工作", "社工", "公益"];
const MOHRSS_LIST = "http://job.mohrss.gov.cn/cjobs/jobinfolist/listJobinfolist";
const MOHRSS_DETAIL = "http://job.mohrss.gov.cn/cjobs/jobinfolist/cb21/showgw?id=";

function decodeEntities(s: string) {
  return s
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&");
}

async function scrapeMohrss(): Promise<Candidate[]> {
  const found = new Map<string, any>();
  for (const keyword of MOHRSS_KEYWORDS) {
    const url = `${MOHRSS_LIST}?pageNo=1&orderType=time&textfield=${encodeURIComponent(keyword)}`;
    const res = await request(url, {}, `公共招聘网 ${keyword}`);
    await sleep(GAP_MS);
    if (!res) continue;
    const html = await res.text();
    const raw = html.match(/<input[^>]*id="findjoblist"[^>]*value="([\s\S]*?)"/)?.[1];
    if (!raw) continue;
    try {
      const rows = JSON.parse(decodeEntities(raw));
      for (const row of Array.isArray(rows) ? rows : rows?.data ?? []) {
        const id = row.acb200 ?? row.id;
        if (id && !found.has(String(id))) found.set(String(id), row);
      }
    } catch { /* 忽略本关键词解析失败 */ }
  }
  console.log(`公共招聘网：候选 ${found.size} 条`);

  const accepted: Candidate[] = [];
  for (const row of [...found.values()].slice(0, PER_SOURCE)) {
    const id = String(row.acb200 ?? row.id);
    const url = `${MOHRSS_DETAIL}${id}`;
    const detail = await request(url, {}, `公共招聘网 ${id}`);
    await sleep(GAP_MS);
    if (!detail) continue;
    const $ = cheerio.load(await detail.text());
    const body = bestBody($, [".job-detail", ".detail", ".content", "article", "main", "body"]);
    if (body.length < 120) continue;
    accepted.push({
      title: clean(row.aca112 ?? row.gwmc ?? row.zwmc ?? row.title ?? "岗位"),
      orgHint: clean(row.aab004 ?? row.dwmc ?? row.orgName ?? ""),
      body,
      publishedDate: "",
      url,
      sourceName: "中国公共招聘网",
    });
  }
  console.log(`公共招聘网：取得正文 ${accepted.length} 条`);
  return accepted;
}

/* ---------- 来源 5/6：RSS（NGO Job Board / ReliefWeb） ---------- */

function parseRssItems(xml: string) {
  const items: { title: string; link: string; pubDate: string; body: string }[] = [];
  for (const match of xml.matchAll(/<item>([\s\S]*?)<\/item>/g)) {
    const block = match[1];
    const pick = (tag: string) => {
      const m = block.match(new RegExp(`<${tag}[^>]*><!\\[CDATA\\[([\\s\\S]*?)\\]\\]></${tag}>|<${tag}[^>]*>([\\s\\S]*?)</${tag}>`));
      return (m?.[1] ?? m?.[2] ?? "").trim();
    };
    const title = clean(pick("title").replace(/<[^>]+>/g, " "));
    const link = pick("link");
    const pubDate = pick("pubDate");
    const body = clean(pick("description").replace(/<[^>]+>/g, " "));
    if (title && link && body.length >= 80) items.push({ title, link, pubDate, body });
  }
  return items;
}

async function scrapeNgoJobBoard(): Promise<Candidate[]> {
  const xml = await httpsGetText("https://ngojobboard.org/feed/");
  if (!xml) return [];
  const items = parseRssItems(xml).slice(0, PER_SOURCE);
  console.log(`NGO Job Board：RSS ${items.length} 条`);
  return items.map((item) => ({
    title: item.title,
    orgHint: "",
    body: item.body,
    publishedDate: item.pubDate ? new Date(item.pubDate).toISOString().slice(0, 10) : "",
    url: item.link,
    sourceName: "NGO Job Board",
  }));
}

const RELIEFWEB_FEEDS = [
  { url: "https://reliefweb.int/jobs/rss.xml?advanced-search=(C58)", sourceName: "ReliefWeb" },
  { url: "https://reliefweb.int/jobs/rss.xml?view=unspecified-location", sourceName: "ReliefWeb" },
];

async function scrapeReliefWeb(): Promise<Candidate[]> {
  const out: Candidate[] = [];
  for (const feed of RELIEFWEB_FEEDS) {
    const xml = await httpsGetText(feed.url);
    if (!xml) {
      console.warn(`  ! ReliefWeb 抓取失败: ${feed.url}`);
      continue;
    }
    for (const item of parseRssItems(xml).slice(0, PER_SOURCE)) {
      out.push({
        title: item.title,
        orgHint: "",
        body: item.body,
        publishedDate: item.pubDate ? new Date(item.pubDate).toISOString().slice(0, 10) : "",
        url: item.link,
        sourceName: "ReliefWeb",
      });
    }
  }
  console.log(`ReliefWeb：RSS ${out.length} 条`);
  return out;
}

/* ---------- 来源 7：民政部 · 社会组织人才服务和培训平台 ---------- */

const MCA_BASE = "https://px.chinanpo.mca.gov.cn";
const MCA_MAX = 150;

// 该站 API 要求签名头：Web-Secret-Key = md5(md5("sshzPx" + yyyyMMdd))（逆向自其前端 bundle）。
function mcaHeaders() {
  const d = new Date();
  const datestr = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`;
  const secret = createHash("md5")
    .update(createHash("md5").update(`sshzPx${datestr}`).digest("hex"))
    .digest("hex");
  return {
    "Web-Secret-Key": secret,
    "TOKEN-TYPE": "pc",
    "Client-Type": "operator",
    Referer: `${MCA_BASE}/`,
  };
}

async function scrapeMca(): Promise<Candidate[]> {
  const headers = mcaHeaders();
  const today = todayISO();

  // 省市代码表：省一次拿全，市按省懒加载缓存，把 yaoqiu 里的代码翻译成地名。
  const provinceName = new Map<string, string>();
  try {
    const res = await request(`${MCA_BASE}/api/open/province/list`, { headers }, "民政部省份表");
    const data = await res?.json().catch(() => null);
    for (const row of data?.rows ?? []) provinceName.set(String(row.code), row.name);
  } catch { /* 表拉取失败时退化为只用正文 */ }
  const cityNameCache = new Map<string, Map<string, string>>();
  const cityName = async (provinceCode: string, cityCode: string) => {
    if (!cityNameCache.has(provinceCode)) {
      const map = new Map<string, string>();
      try {
        const res = await request(
          `${MCA_BASE}/api/open/city/list?provinceCode=${provinceCode}`,
          { headers },
          `民政部城市表 ${provinceCode}`,
        );
        const data = await res?.json().catch(() => null);
        for (const row of data?.rows ?? []) map.set(String(row.code), row.name);
      } catch { /* 忽略 */ }
      cityNameCache.set(provinceCode, map);
    }
    return cityNameCache.get(provinceCode)?.get(cityCode) ?? "";
  };
  const placeOf = async (p: any) => {
    const prov = provinceName.get(String(p.province ?? "")) ?? "";
    if (!prov) return "";
    const city = p.city ? await cityName(String(p.province), String(p.city)) : "";
    const cityPart = city && !/直辖市|市辖区/.test(city) ? `·${city}` : "";
    return `${prov}${cityPart}`;
  };
  const rows: any[] = [];
  for (let pageNum = 1; pageNum <= 12 && rows.length < MCA_MAX; pageNum += 1) {
    const url = `${MCA_BASE}/api/open/recruit/list?pageNum=${pageNum}&pageSize=50`;
    const res = await request(url, { headers }, `民政部招聘 p${pageNum}`);
    await sleep(GAP_MS);
    if (!res) break;
    const data = await res.json().catch(() => null);
    const list = data?.rows ?? [];
    if (!list.length) break;
    for (const row of list) {
      const eTime = String(row.eTime ?? "").slice(0, 10);
      if (eTime && eTime < today) continue; // 已截止的不取
      rows.push(row);
      if (rows.length >= MCA_MAX) break;
    }
  }
  console.log(`民政部平台：未截止候选 ${rows.length} 条`);

  const accepted: Candidate[] = [];
  for (const row of rows) {
    const detail = await request(
      `${MCA_BASE}/api/open/recruit/getInfoAndAddLookNum/${row.id}`,
      { headers },
      `民政部 ${row.id}`,
    );
    await sleep(GAP_MS);
    if (!detail) continue;
    const data = await detail.json().catch(() => null);
    const info = data?.data;
    if (!info) continue;

    let positions = "";
    try {
      const list = JSON.parse(info.yaoqiu ?? "[]");
      const parts = [];
      for (const p of list) {
        const place = await placeOf(p);
        parts.push(
          `岗位：${clean(p.gangwei)}（${p.zhaopin ?? "?"}人）${place ? `\n工作地点：${place}` : ""}\n${clean(p.yaoqiu)}`,
        );
      }
      positions = parts.join("\n\n");
    } catch { /* yaoqiu 解析失败时只用正文 */ }
    const deadline = String(info.eTime ?? "").slice(0, 10);
    const body = clean(
      `${clean(info.content)}\n\n${positions}${deadline ? `\n\n报名截止：${deadline}` : ""}`,
    );
    if (body.length < 120) continue;
    accepted.push({
      title: clean(info.title),
      orgHint: clean(info.partyName),
      body,
      publishedDate: String(info.createTime ?? "").slice(0, 10),
      url: `${MCA_BASE}/zpxx/view/${info.id}`,
      sourceName: "民政部社会组织人才平台",
    });
  }
  console.log(`民政部平台：取得正文 ${accepted.length} 条`);
  return accepted;
}

/* ---------- MiniMax 提取 ---------- */

type AnyRecord = Record<string, any>;

function mapRecord(candidate: Candidate, extraction: JobExtraction, bodyHash: string): AnyRecord {
  const kind = KIND_ZH[extraction.kind] ?? "全职";
  const { publishedDays, time } = ageOf(candidate.publishedDate);
  return {
    id: `job-${hashId(candidate.url)}`,
    category: kind === "志愿者" ? "志愿者招募" : "人员招聘",
    kind,
    jobGroup: GROUP_ZH[extraction.job_group] ?? "运营与支持",
    subCategory: SUBCATEGORY_ZH[extraction.sub_category] ?? "公益项目执行",
    level: LEVEL_ZH[extraction.level] ?? "L2 独立执行",
    education: EDUCATION_ZH[extraction.education] ?? "不限",
    orgType: ORGTYPE_ZH[extraction.org_type] ?? "其他",
    role: SUBCATEGORY_ZH[extraction.sub_category] ?? "公益项目执行",
    publishedDays,
    time,
    title: cleanJobTitle(extraction.title, candidate.title) || candidate.title,
    summary: extraction.summary,
    org: clean(extraction.org) || candidate.orgHint || "机构未注明",
    location: normalizeLocation(extraction.location),
    salary: normalizeSalary(extraction.salary),
    due: extraction.deadline && /^\d{4}-\d{2}-\d{2}$/.test(extraction.deadline) ? extraction.deadline : "详见原帖",
    sourceName: candidate.sourceName,
    url: candidate.url,
    bodyHash,
    extractionVersion: EXTRACTION_VERSION,
    extraction,
  };
}

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
      const bodyHash = hashId(hashBody(candidate.body));

      let extraction: JobExtraction | undefined;
      if (previous?.bodyHash === bodyHash && previous.extraction && previous.extractionVersion === EXTRACTION_VERSION) {
        extraction = previous.extraction as JobExtraction;
        reused += 1;
      } else {
        try {
          extraction = await b.ExtractJob(candidate.title, candidate.orgHint, candidate.sourceName, candidate.body);
          extracted += 1;
        } catch (error) {
          console.warn(`  ! 提取失败，跳过: ${candidate.title.slice(0, 36)} (${error instanceof Error ? error.message : error})`);
          continue;
        }
      }

      if (!extraction.is_relevant) {
        rejected += 1;
        console.log(`  - 不相关（${extraction.reject_reason ?? "未说明"}）: ${candidate.title.slice(0, 36)}`);
        continue;
      }
      kept.push(mapRecord(candidate, extraction, bodyHash));
    }
  };
  await Promise.all(Array.from({ length: LLM_CONCURRENCY }, worker));
  console.log(`MiniMax 提取：复用 ${reused}，新提取 ${extracted}，判为不相关 ${rejected}，入库 ${kept.length}`);
  return kept;
}

/* ---------- 主流程 ---------- */

function dedupe(items: AnyRecord[]) {
  const seen = new Set<string>();
  return items.filter((item) => {
    const key = `${item.title}|${item.org}`;
    if (seen.has(key) || seen.has(item.url)) return false;
    seen.add(key);
    seen.add(item.url);
    return true;
  });
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
    console.log(`已有记录：${existing.length} 条（复用提取缓存）`);
  } catch {
    console.log("未找到既有 jobs-scraped.json，将从空列表开始。");
  }
  const previousByUrl = new Map<string, AnyRecord>(
    existing.filter((item) => item.url).map((item) => [item.url, item]),
  );

  const [cdb, one, mlzg, mohrss, board, relief, mca] = await Promise.all([
    scrapeCDB(),
    scrapeOneFoundation(),
    scrapeMlzg(),
    scrapeMohrss(),
    scrapeNgoJobBoard(),
    scrapeReliefWeb(),
    scrapeMca(),
  ]);

  const candidates = [...cdb, ...one, ...mlzg, ...mohrss, ...board, ...relief, ...mca];
  console.log(`\n候选合计 ${candidates.length} 条，开始 MiniMax 提取…`);
  const records = await extractAll(candidates, previousByUrl);
  if (candidates.length > 0 && records.length === 0) {
    console.error("提取结果为空：疑似 LLM 调用全部失败，已保留原快照不做覆盖。");
    process.exit(1);
  }

  const all = dedupe(records).sort((a, b) => a.publishedDays - b.publishedDays);
  await writeFile(OUT, `${JSON.stringify(all, null, 2)}\n`, "utf8");

  console.log("\n写入完成：", OUT);
  const bySource: Record<string, number> = {};
  for (const item of all) {
    bySource[item.sourceName] = (bySource[item.sourceName] ?? 0) + 1;
  }
  console.log(`总计 ${all.length} 条，来源统计：`, bySource);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
