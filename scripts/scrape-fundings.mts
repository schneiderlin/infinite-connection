#!/usr/bin/env node
/**
 * 公益资助抓取脚本（BAML + MiniMax 版）
 *
 * 业务规则：
 *   - 只保留"面向公益组织 / 社工机构 / 公益团队"的资金、物资或课程类支持信息；
 *   - 排除政府采购/招标/中标、公众筹款、个人/学生/患者招募、会议活动、案例与作品征集。
 *   以上判断全部交给 MiniMax（baml_src/fundings.baml 的 ExtractFunding），
 *   本脚本只保留结构性的列表解析和标题级粗筛。
 *
 * 数据源：
 *   1. 中国发展简报 · 公益资助（/abutment/getData，categoryId=17）
 *   2. 中国发展简报 · 资讯搜索（/search/news/getData）—— 补充 2025 年后项目征集
 *   3. 中国红十字基金会（crcf.org.cn）
 *   4. 中国慈展会 · 资源直通车（cncf.org.cn + 微信公众号）
 *   5. 中国人口福利基金会（cpwf.org.cn）
 *
 * 流水线：collect（URL → 原文 IR）→ extract（IR → MiniMax）→ materialize（JSON 快照）。
 * 原文 IR 保存在 data/scrape-ir/fundings，可脱离来源网站反复回放同一份模型输入。
 *
 * 用法：MINIMAX_API_KEY 配置在 .env 后运行 pnpm scrape:fundings
 * 输出：src/lib/fundings-data.json
 */

import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import * as cheerio from "cheerio";
import { b } from "../baml_client/index.ts";
import { setLogLevel } from "@boundaryml/baml";
import type { FundingExtraction } from "../baml_client/types.ts";
import {
  readCurrentIR,
  updateCurrentIR,
  type ScrapedDocumentIR,
} from "./lib/scrape-ir.mts";

setLogLevel("ERROR");

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const OUT = path.join(ROOT, "src", "lib", "fundings-data.json");
const IR_ROOT = path.join(ROOT, "data", "scrape-ir", "fundings");
const UA = "InfiniteConnectionPreview/0.1 (+https://github.com/schneiderlin/infinite-connection)";
const BROWSER_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36";
const WECHAT_UA =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1";
const GAP_MS = 900;
const CUTOFF = "2023-01-01";
const LLM_CONCURRENCY = 4;
// 提取缓存版本：换模型或改 baml prompt 时 +1，避免复用旧口径的 extraction。
const EXTRACTION_VERSION = 3;
const EXTRACTION_MODEL = "MiniMax-M3.1-Flash";
const IR_ADAPTER_VERSION = 1;

const CNCF_LIST_URL = "https://www.cncf.org.cn/cms/node/53";
const CNCF_MAX_LIST_PAGES = 12;
// 第 37 期先发于微信公众号、官网列表尚未收录；临时入口失效时自动跳过。
const CNCF_EXTRA_ISSUES = [
  {
    issue: 37,
    date: "",
    url: "https://mp.weixin.qq.com/s?__biz=MzI5MjE3MzM5OA==&mid=2247544773&idx=1&sn=fe96cb1b8b4d119d447a02bf9e9V3L&new=1",
  },
];
const CPWF_CATEGORY_URL = "https://www.cpwf.org.cn/category/264";
const CPWF_MAX_PAGES = 24;
const CPWF_MAX_DETAILS = 40;

/* ---------- 标题级粗筛（只用于决定要不要抓详情页，不做内容判断） ---------- */

const WANT = /资助|招募|申报|征集|开放申请|合作伙伴|项目征集|支持计划|资助计划|申请|创投/;
const BLOCK_TITLE =
  /结果|名单|公示|评审|采购|招标|中标|成交|供应商|询价|比选|案例征集|作品征集|摄影|影像/;
const CNCF_JOB_ISSUE = /招聘|招新|岗位|投递|求职|职等|职为|急聘|虚位以待|实习生|人才/;
const CNCF_PROJECT_ISSUE =
  /资助|伙伴|创投|资金|项目(?!经理|主管|专员|助理|岗位|岗|官员|实习|负责人)|助项/;
const CNCF_JOB_TITLE =
  /招聘|招贤|岗位|简历|薪资|薪酬|应聘|求职|实习生|任职|岗位职责|工作地点|全职|兼职|主管|专员|经理|官员|助理|干事|主任|总监|会计|财务|传播岗|运营岗|筹资岗|管理岗|项目岗|工程师|研究员|综合岗|应届|毕业生/;
const CNCF_CALL_TITLE = /资助|招募|征集|申报|申请|创投|伙伴|计划|支持|共建|合作/;
const CPWF_WANT = /资助|招募|申报|征集|开放申请|合作伙伴|项目征集|支持计划|资助计划|申请/;
const CPWF_BLOCK_TITLE =
  /结果|名单|公示|评审|采购|招标|中标|审计|评价|遴选|招聘|委托|体检|会务|课题|研究|学者|学生|医院|医疗机构|妇幼保健院|卫生健康委|医疗物资|医疗设备|医疗仪器|药品|启动|总结|案例|作品|声明|患者|援助项目/;

/* ---------- 提取结果 → 中文字段 ---------- */

const FIELD_ZH: Record<string, string> = {
  CP: "儿童与青少年", AG: "长者与残障", ED: "教育与能力建设", EN: "环境与气候",
  AN: "动物福利", CM: "社区发展与减贫", EQ: "社会公平与权利", CA: "文化艺术与体育",
  CR: "企业责任与可持续", SS: "行业支持与基础设施", OTHER: "其他",
};
const ISSUE_ZH: Record<string, string> = {
  CP01: "儿童保护", CP02: "困境儿童关爱", CP03: "儿童教育与发展", CP04: "青少年发展",
  AG01: "老年服务", AG02: "残障融合", AG03: "康复与照护",
  ED01: "教育公平", ED02: "乡村教育", ED03: "职业教育与就业能力", ED04: "终身学习",
  EN01: "环境保护", EN02: "气候变化与减碳", EN03: "自然生态保护",
  AN01: "伴侣动物与流浪动物", AN02: "野生动物保护", AN03: "农场动物与实验动物福利",
  CM01: "乡村振兴", CM02: "城市社区营造", CM03: "减贫与生计", CM04: "灾害救援与重建",
  EQ01: "性别平等", EQ02: "多元包容", EQ03: "劳工权益", EQ04: "健康与医疗可及", EQ05: "法律救助与司法公正",
  CA01: "文化艺术", CA02: "文化遗产保护", CA03: "体育公益",
  CR01: "CSR", CR02: "ESG", CR03: "责任投资与影响力投资",
  SS01: "公益行业赋能", SS02: "志愿服务", SS03: "公益金融与慈善信托", SS04: "研究倡导与行业平台",
  OTHER: "其他",
};
const TYPE_ZH: Record<string, string> = {
  FOUNDATION_GRANT: "慈善会/基金会资助", PARTNER_RECRUITMENT: "公益项目伙伴招募",
  VENTURE: "公益创投", GOVERNMENT: "政府资助", CSR: "企业CSR",
  ACADEMIC: "高校/研究机构", NGO_GRANT: "公益组织资助", MATERIAL: "物资资助",
};
const DURATION_ZH: Record<string, string> = {
  WITHIN_6M: "6个月内", SIX_TO_TWELVE_M: "6-12个月", ONE_TO_TWO_Y: "1-2年",
  OVER_TWO_Y: "2年以上", UNKNOWN: "详见原帖",
};
const PROVINCES = new Set([
  "全国", "北京市", "天津市", "上海市", "重庆市", "河北省", "山西省", "辽宁省", "吉林省",
  "黑龙江省", "江苏省", "浙江省", "安徽省", "福建省", "江西省", "山东省", "河南省",
  "湖北省", "湖南省", "广东省", "海南省", "四川省", "贵州省", "云南省", "陕西省",
  "甘肃省", "青海省", "台湾省", "内蒙古自治区", "广西壮族自治区", "西藏自治区",
  "宁夏回族自治区", "新疆维吾尔自治区", "香港特别行政区", "澳门特别行政区",
]);

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const todayISO = () => new Date().toISOString().slice(0, 10);
const dateInShanghai = (seconds: number) =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Shanghai" }).format(new Date(seconds * 1000));

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

async function requestJSON(url: string, options: RequestInit, label: string) {
  const res = await request(url, options, label);
  if (!res) return null;
  try {
    return await res.json();
  } catch {
    console.warn(`  ! 返回不是 JSON: ${label}`);
    return null;
  }
}

async function requestText(url: string, label: string, headers: Record<string, string> = {}) {
  const res = await request(url, { headers }, label);
  if (!res) return null;
  try {
    return await res.text();
  } catch {
    console.warn(`  ! 读取响应失败: ${label}`);
    return null;
  }
}

const clean = (value: unknown) =>
  String(value ?? "")
    .replace(/[\u200b-\u200d\ufeff]/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const hashId = (value: string) => createHash("sha1").update(value).digest("hex").slice(0, 12);
const sha256 = (value: string) => createHash("sha256").update(value).digest("hex");
// 页面浏览计数（"浏览 1166 次"）每次访问自增，直接 hash 会导致缓存永远失效；
// 计算 bodyHash 前先剥离这类计数。
const hashBody = (body: string) =>
  body.replace(/(浏览|阅读|查看|访问量|分享|收藏|点赞)\s*[:：]?\s*\d[\d,]*\s*(次|人|个|条)?/g, "");

function daysSince(dateStr: string) {
  if (!dateStr) return 0;
  const then = new Date(`${dateStr}T00:00:00+08:00`).getTime();
  if (Number.isNaN(then)) return 0;
  return Math.max(0, Math.round((Date.now() - then) / 86_400_000));
}

function daysUntil(dateStr: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return 0;
  return Math.round(
    (new Date(`${dateStr}T00:00:00+08:00`).getTime() - new Date(`${todayISO()}T00:00:00+08:00`).getTime()) /
      86_400_000,
  );
}

/* ---------- 候选条目（各来源只负责把正文抓回来） ---------- */

type Candidate = {
  title: string;
  orgHint: string;
  address: string;
  beginDay: string;
  endDayHint: string;
  body: string;
  url: string;
  sourceName: string;
};

type FundingIR = ScrapedDocumentIR & { dataset: "fundings" };

function sourceKey(candidate: Candidate) {
  return `fund-${hashId(candidate.url || `${candidate.title}-${candidate.orgHint}`)}`;
}

function modelInputHash(candidate: Candidate) {
  return sha256(JSON.stringify([
    candidate.title,
    candidate.orgHint,
    candidate.beginDay,
    candidate.endDayHint,
    candidate.body,
  ]));
}

function documentHash(candidate: Candidate) {
  return sha256(JSON.stringify([
    candidate.title,
    candidate.orgHint,
    candidate.address,
    candidate.beginDay,
    candidate.endDayHint,
    candidate.body,
    candidate.url,
    candidate.sourceName,
  ]));
}

function candidateToIR(candidate: Candidate, fetchedAt: string): FundingIR {
  return {
    schemaVersion: 1,
    dataset: "fundings",
    sourceKey: sourceKey(candidate),
    sourceName: candidate.sourceName,
    sourceUrl: candidate.url,
    canonicalUrl: candidate.url,
    fetchedAt,
    title: candidate.title,
    organizationHint: candidate.orgHint,
    addressHint: candidate.address,
    publishedDateHint: candidate.beginDay,
    deadlineHint: candidate.endDayHint,
    bodyText: candidate.body,
    contentHash: sha256(candidate.body),
    modelInputHash: modelInputHash(candidate),
    documentHash: documentHash(candidate),
    adapterVersion: IR_ADAPTER_VERSION,
  };
}

function irToCandidate(document: ScrapedDocumentIR): Candidate {
  return {
    title: document.title,
    orgHint: document.organizationHint,
    address: document.addressHint,
    beginDay: document.publishedDateHint,
    endDayHint: document.deadlineHint,
    body: document.bodyText,
    url: document.canonicalUrl,
    sourceName: document.sourceName,
  };
}

/* ---------- 来源 1：中国发展简报 · 公益资助 ---------- */

async function scrapeCDBFundings(): Promise<Candidate[]> {
  const json = await requestJSON(
    "https://www.chinadevelopmentbrief.org.cn/abutment/getData",
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: "categoryId=17&pageNum=1&pageSize=500",
    },
    "CDB 公益资助列表",
  );
  if (!json?.result?.list) throw new Error("CDB 公益资助列表接口失败");
  const rows = json.result.list;
  console.log(`CDB 公益资助：接口返回 ${rows.length} 条`);

  const candidates = rows
    .filter((row: any) => (row.beginDay || row.endDay || "") >= CUTOFF)
    .filter((row: any) => !BLOCK_TITLE.test(row.title))
    .filter((row: any) => WANT.test(row.title))
    .sort((a: any, b: any) => String(b.beginDay || "").localeCompare(String(a.beginDay || "")));

  console.log(`CDB 公益资助：${CUTOFF} 后且标题粗筛通过 ${candidates.length} 条`);

  const accepted: Candidate[] = [];
  for (const row of candidates) {
    const url = `https://www.chinadevelopmentbrief.org.cn/abutment/detail/${row.id}.html`;
    const html = await requestText(url, `CDB ${row.id}`);
    await sleep(GAP_MS);
    if (!html) continue;

    const $ = cheerio.load(html);
    const body = clean($(".detail-content").text() || $(".content").text());
    if (body.length < 160) {
      console.log(`  - 跳过（正文过短/图片正文）: ${row.title}`);
      continue;
    }
    accepted.push({
      title: clean(row.title),
      orgHint: clean(row.owner),
      address: clean(row.address),
      beginDay: row.beginDay || "",
      endDayHint: row.endDay || "",
      body,
      url,
      sourceName: "中国发展简报·公益资助",
    });
  }
  console.log(`CDB 公益资助：取得正文 ${accepted.length} 条`);
  return accepted;
}

/* ---------- 来源 2：中国发展简报 · 资讯搜索（补充最新项目征集） ---------- */

async function scrapeCDBNews(): Promise<Candidate[]> {
  const terms = ["开放申请", "项目征集", "伙伴招募", "资助计划", "小额资助", "公益创投", "支持计划", "招募合作伙伴", "合作伙伴招募", "资助项目"];
  const found = new Map<string, any>();

  for (const term of terms) {
    const json = await requestJSON(
      "https://www.chinadevelopmentbrief.org.cn/search/news/getData",
      {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ search: "1", title: term, pageNum: "1", pageSize: "50" }).toString(),
      },
      `CDB 资讯搜索 ${term}`,
    );
    for (const row of json?.result?.list ?? []) {
      if ((row.createTime || "") < "2025-01-01") continue;
      if (BLOCK_TITLE.test(row.title)) continue;
      if (!WANT.test(row.title)) continue;
      found.set(String(row.id), row);
    }
    await sleep(GAP_MS);
  }

  console.log(`CDB 资讯搜索：2025 年后候选 ${found.size} 条`);
  const accepted: Candidate[] = [];
  for (const row of found.values()) {
    const url = `https://www.chinadevelopmentbrief.org.cn/news/detail/${row.id}.html`;
    const html = await requestText(url, `CDB news ${row.id}`);
    await sleep(GAP_MS);
    if (!html) continue;
    const $ = cheerio.load(html);
    const body = clean($(".detail-content").text() || $(".content").text());
    if (body.length < 200) {
      console.log(`  - 跳过（正文过短/图片正文）: ${row.title}`);
      continue;
    }
    accepted.push({
      title: clean(row.title),
      orgHint: "",
      address: "",
      beginDay: row.createTime || "",
      endDayHint: "",
      body,
      url,
      sourceName: "中国发展简报·资讯",
    });
  }
  console.log(`CDB 资讯搜索：取得正文 ${accepted.length} 条`);
  return accepted;
}

/* ---------- 来源 3：中国红十字基金会 · 公告公示 ---------- */

// 只排除明显不是"机构可申报机会"的标题（结果公示、名单、捐赠致谢等），
// 其余标题一律抓详情页，由 MiniMax 判断是否收录。
const CRCF_SKIP_TITLE = /公示|名单|结果|捐赠|致谢|简报|回顾|报道$/;
const CRCF_MAX_PAGES = 4;

async function scrapeCRCF(): Promise<Candidate[]> {
  const listBase =
    "https://www.crcf.org.cn/web/newspage/xinwenzhongxin_gonggaogongshi.thtml?classFlag=gggs_xinwenzhongxin";
  const found = new Map<string, { title: string; url: string; date: string }>();

  for (let pn = 1; pn <= CRCF_MAX_PAGES; pn += 1) {
    const listUrl = `${listBase}&pn=${pn}`;
    const html = await requestText(listUrl, `CRCF 公告公示 p${pn}`);
    if (!html) {
      if (pn === 1) throw new Error("CRCF 公告公示列表抓取失败");
      break;
    }
    const $ = cheerio.load(html);
    let added = 0;
    $("a[href*='cid=']").each((_, el) => {
      const title = clean($(el).text());
      const href = $(el).attr("href");
      if (!title || !href || title.length < 6) return;
      if (CRCF_SKIP_TITLE.test(title)) return;
      const url = new URL(href, listBase).href;
      if (found.has(url)) return;
      const date = clean($(el).closest("li").find(".s_lm_date").text());
      found.set(url, { title, url, date });
      added += 1;
    });
    console.log(`CRCF 公告公示 p${pn}：新增候选 ${added} 条`);
    await sleep(GAP_MS);
    if (!added) break;
  }

  console.log(`CRCF：候选 ${found.size} 条`);
  const accepted: Candidate[] = [];
  for (const row of found.values()) {
    const detail = await requestText(row.url, `CRCF ${row.title}`);
    await sleep(GAP_MS);
    if (!detail) continue;
    const page = cheerio.load(detail);
    const body = clean(page(".r_detail_body").text() || page(".content").text());
    if (body.length < 150) continue;

    const dateText =
      clean(page(".r_detail_title_date").text()) ||
      clean(page(".r_detail_time").text()) ||
      clean(page(".time").text()) ||
      row.date ||
      body.match(/20\d{2}[-./年]\d{1,2}[-./月]\d{1,2}/)?.[0] ||
      "";
    const dateMatch = dateText.match(/(20\d{2})[年\-/.](\d{1,2})[月\-/.](\d{1,2})/);
    const beginDay = dateMatch
      ? `${dateMatch[1]}-${String(dateMatch[2]).padStart(2, "0")}-${String(dateMatch[3]).padStart(2, "0")}`
      : todayISO();
    accepted.push({
      title: row.title,
      orgHint: "中国红十字基金会",
      address: "",
      beginDay,
      endDayHint: "",
      body,
      url: row.url,
      sourceName: "中国红十字基金会",
    });
  }
  console.log(`CRCF：取得正文 ${accepted.length} 条`);
  return accepted;
}

/* ---------- 来源 4：中国慈展会 · 资源直通车 ---------- */

function parseCNCFSections(paras: string[]) {
  const starts: { start: number; title: string }[] = [];
  for (let i = 0; i < paras.length - 1; i += 1) {
    if (!/^\d{1,2}$/.test(paras[i])) continue;
    const title = clean(paras[i + 1]);
    if (title.length < 6 || title.length > 90) continue;
    if (!CNCF_CALL_TITLE.test(title)) continue;
    if (/^(项目简介|申报要求|招募对象|申请条件|截止时间|招募链接|申报对象)/.test(title)) continue;
    starts.push({ start: i, title });
  }
  return starts.map((section, index) => ({
    title: section.title,
    text: paras.slice(section.start, index + 1 < starts.length ? starts[index + 1].start : paras.length).join("\n"),
  }));
}

function cncfSectionBody(section: { title: string; text: string }) {
  const lines = section.text.split("\n");
  if (/^\d{1,2}$/.test(lines[0] ?? "")) lines.shift();
  if (lines[0] === section.title) lines.shift();
  return clean(
    lines
      .join("\n")
      .replace(/招募链接[：:][\s\S]*$/, "")
      .replace(/详情请戳[：:][\s\S]*$/, "")
      .replace(/END\s*来源[\/／][\s\S]*$/i, ""),
  );
}

function tidyCNCFOwner(value: string, fallback: string) {
  const owner = clean(value)
    .replace(/^由\s*/, "")
    .replace(/^(?:在|是|为|以|将|对|与|和|及)\s*/, "")
    .replace(/^(?:20\d{2}年|第[一二三四五六七八九十百]+届)\s*/, "")
    .replace(/^(?:依照|根据)[^及。；]*及/, "")
    .replace(/^能够[^与。；]*与/, "")
    .replace(/^(?:认同|引领|号召|鼓励|支持|推动)\s*/, "")
    .replace(/(?:于)?20\d{2}年.*$/, "")
    .replace(/[，,；;、].*$/, "")
    .replace(/[。；].*$/, "")
    .replace(/[\s\-—–:：]+$/, "");
  if (owner.length < 2 || owner.length > 80) return fallback;
  if (/^(?:广大|青年|儿童|项目|活动|机构|单位|人员|家庭|公众|践行|当地|入选|庭|国家|相关|符合|面向|计划|通过|围绕)/.test(owner)) {
    return fallback;
  }
  return owner;
}

function inferCNCFOwner(sectionText: string, title: string, fallback: string) {
  const by = sectionText.match(/由([^。；]{2,90}?)(?:于\d{4}年)?(?:共同|联合)?(?:立项)?(?:发起|主办|资助|支持|开展|实施)/);
  if (by) return tidyCNCFOwner(by[1], fallback);
  const org = sectionText.match(
    /([\u4e00-\u9fa5A-Za-z0-9（）()·\-]{2,40}(?:公益基金会|基金会|慈善会|联合会|协会|社会工作服务中心|研究院|中心|民政局|总工会|妇联|团委|人民政府))/,
  );
  if (org) return tidyCNCFOwner(org[1], fallback);
  const titled = title.match(
    /^([\u4e00-\u9fa5A-Za-z0-9（）()·\-]{2,40}(?:公益基金会|基金会|慈善会|联合会|协会|社会工作服务中心|研究院|中心|民政局|总工会|妇联|团委))/,
  );
  if (titled) return tidyCNCFOwner(titled[1], fallback);
  return fallback;
}

async function collectCNCFIssues() {
  const found = new Map<number, { issue: number; title: string; url: string; date: string }>();
  for (let page = 1; page <= CNCF_MAX_LIST_PAGES; page += 1) {
    const url = `${CNCF_LIST_URL}${page > 1 ? `?page=${page}` : ""}`;
    const html = await requestText(url, `CNCF 列表 p${page}`, { "User-Agent": BROWSER_UA });
    if (!html) {
      if (page === 1) throw new Error("CNCF 列表抓取失败");
      break;
    }
    const $ = cheerio.load(html);
    let added = 0;
    $("a[href]").each((_, el) => {
      const text = clean($(el).text());
      const href = $(el).attr("href");
      if (!href || !href.includes("mp.weixin.qq.com") || !/2026年\d+期/.test(text)) return;
      const issue = Number(text.match(/2026年(\d+)期/)?.[1]);
      if (!issue || found.has(issue)) return;
      const parent = clean($(el).closest("li, .item, .news-item, .list-item, div").text());
      const date = parent.match(/20\d{2}-\d{2}-\d{2}/)?.[0] ?? "";
      found.set(issue, { issue, title: text, url: href, date });
      added += 1;
    });
    await sleep(300);
    if (!added && page > 1) break;
  }
  for (const extra of CNCF_EXTRA_ISSUES) {
    if (!found.has(extra.issue)) {
      found.set(extra.issue, { ...extra, title: `2026年${extra.issue}期` });
    }
  }
  return [...found.values()].sort((a, b) => b.issue - a.issue);
}

async function scrapeCNCF(): Promise<Candidate[]> {
  const issues = await collectCNCFIssues();
  console.log(`CNCF：2026 年资源直通车 ${issues.length} 期`);
  const accepted: Candidate[] = [];
  const seen = new Set<string>();

  for (const issue of issues) {
    if (CNCF_JOB_ISSUE.test(issue.title) && !CNCF_PROJECT_ISSUE.test(issue.title)) {
      console.log(`  - 跳过（招聘专场）: ${issue.issue}期 ${issue.title.slice(0, 40)}`);
      continue;
    }
    const html = await requestText(issue.url, `CNCF ${issue.issue}期`, { "User-Agent": WECHAT_UA });
    await sleep(GAP_MS);
    if (!html) continue;
    const $ = cheerio.load(html);
    const paras = $("#js_content p")
      .map((_, el) => clean($(el).text()))
      .get()
      .filter(Boolean);
    if (paras.length < 10) {
      console.log(`  - 跳过（正文过短/图片正文）: ${issue.issue}期`);
      continue;
    }
    const ct = Number(html.match(/var ct = "(\d+)"/)?.[1] || 0);
    const published = ct ? dateInShanghai(ct) : issue.date || todayISO();
    const links: { title: string; href: string }[] = [];
    $("#js_content a[href]").each((_, el) => {
      const title = clean($(el).text());
      const href = $(el).attr("href");
      if (href && title.length >= 5 && !href.startsWith("#")) links.push({ title, href });
    });
    const sections = parseCNCFSections(paras);
    let added = 0;

    for (const section of sections) {
      const full = clean(section.text);
      const body = cncfSectionBody(section);
      if (body.length < 80) continue;
      if (CNCF_JOB_TITLE.test(section.title)) continue;

      let link: { title: string; href: string } | null = null;
      let linkIndex = -1;
      for (const candidate of links) {
        const index = full.lastIndexOf(candidate.title);
        if (index > linkIndex) {
          link = candidate;
          linkIndex = index;
        }
      }
      if (!link || linkIndex < 0) continue;
      const url = new URL(link.href, issue.url).href;
      if (seen.has(url)) continue;
      seen.add(url);

      accepted.push({
        title: section.title,
        orgHint: inferCNCFOwner(full, section.title, "中国慈展会"),
        address: "",
        beginDay: published,
        endDayHint: "",
        body,
        url,
        sourceName: "中国慈展会·资源直通车",
      });
      added += 1;
    }
    console.log(`  · ${issue.issue}期 ${published}: ${added} 条`);
  }

  console.log(`CNCF：取得正文 ${accepted.length} 条`);
  return accepted;
}

/* ---------- 来源 5：中国人口福利基金会 ---------- */

async function scrapeCPWF(): Promise<Candidate[]> {
  const found = new Map<string, { title: string; url: string; date: string }>();
  for (let page = 1; page <= CPWF_MAX_PAGES; page += 1) {
    const url = `${CPWF_CATEGORY_URL}?page=${page}`;
    const html = await requestText(url, `CPWF 列表 p${page}`);
    if (!html) {
      if (page === 1) throw new Error("CPWF 列表抓取失败");
      break;
    }
    const $ = cheerio.load(html);
    const rows = $(".dynamic-item");
    if (!rows.length) break;
    let added = 0;
    rows.each((_, el) => {
      const anchor = $(el).find("a.content").first().length
        ? $(el).find("a.content").first()
        : $(el).find("a[href]").first();
      const title = clean($(el).find(".title").text() || anchor.text());
      const href = anchor.attr("href");
      if (!title || !href) return;
      const date = clean($(el).find(".time").text()).match(/20\d{2}-\d{2}-\d{2}/)?.[0] ?? "";
      if (date && date < "2025-01-01") return;
      if (!CPWF_WANT.test(title) || CPWF_BLOCK_TITLE.test(title)) return;
      const detailUrl = new URL(href, CPWF_CATEGORY_URL).href;
      if (found.has(detailUrl)) return;
      found.set(detailUrl, { title, url: detailUrl, date });
      added += 1;
    });
    console.log(`CPWF 列表 p${page}：新增候选 ${added} 条`);
    await sleep(300);
  }

  const rows = [...found.values()]
    .sort((a, b) => String(b.date).localeCompare(String(a.date)))
    .slice(0, CPWF_MAX_DETAILS);
  console.log(`CPWF：2025 年后候选 ${found.size} 条，取详情前 ${rows.length} 条`);

  const accepted: Candidate[] = [];
  for (const row of rows) {
    const detail = await requestText(row.url, `CPWF ${row.title}`);
    await sleep(GAP_MS);
    if (!detail) continue;
    const $ = cheerio.load(detail);
    const body = clean($(".content").text() || $(".article-content").text() || $(".detail-content").text());
    if (body.length < 200) continue;
    accepted.push({
      title: row.title,
      orgHint: "中国人口福利基金会",
      address: "",
      beginDay: row.date || todayISO(),
      endDayHint: "",
      body,
      url: row.url,
      sourceName: "中国人口福利基金会",
    });
  }
  console.log(`CPWF：取得正文 ${accepted.length} 条`);
  return accepted;
}

/* ---------- MiniMax 提取 ---------- */

function normalizeRegion(value: string | null | undefined): string {
  if (!value) return "全国";
  const v = clean(value);
  if (PROVINCES.has(v)) return v;
  for (const p of PROVINCES) {
    if (p !== "全国" && v.startsWith(p)) return p;
  }
  return v.includes("全国") ? "全国" : "全国";
}

function mapRecord(
  candidate: Candidate,
  extraction: FundingExtraction,
  bodyHash: string,
  inputHash: string,
  extractionMeta: AnyRecord,
) {
  const today = todayISO();
  const kind = extraction.deadline_kind;

  let due: string;
  let openStatus: string;
  let dueDays = 0;
  if (kind === "EXPLICIT" && extraction.deadline && /^\d{4}-\d{2}-\d{2}$/.test(extraction.deadline)) {
    due = extraction.deadline;
    dueDays = daysUntil(due);
    openStatus = due < today ? "已截止" : "开放中";
  } else if (kind === "ROLLING" || kind === "LONG_TERM") {
    due = "长期有效";
    openStatus = "开放中";
  } else {
    due = "详见原帖";
    openStatus = "以原帖为准";
  }

  let amount = "详见原帖";
  let amountWan = 0;
  if (extraction.amount_scope === "PER_PROJECT" && extraction.amount_wan && extraction.amount_wan > 0) {
    amountWan = Math.round(extraction.amount_wan * 10) / 10;
    amount = amountWan < 1 ? `${Math.round(extraction.amount_wan * 10000)}元` : `${amountWan}万`;
  }

  return {
    id: sourceKey(candidate),
    kind: "资助",
    type: TYPE_ZH[extraction.funding_type] ?? "公益组织资助",
    supportType: extraction.support_type === "IN_KIND" ? "物资" : "资金",
    duration: DURATION_ZH[extraction.duration] ?? "详见原帖",
    field: FIELD_ZH[extraction.field] ?? "其他",
    issue: ISSUE_ZH[extraction.issue ?? "OTHER"] ?? "其他",
    region: normalizeRegion(extraction.region),
    title: candidate.title,
    summary: extraction.summary,
    org: clean(extraction.org) || candidate.orgHint || "来源机构未注明",
    location: candidate.address,
    amount,
    amountWan,
    dueDays,
    due,
    publishedDays: daysSince(candidate.beginDay),
    openStatus,
    sourceName: candidate.sourceName,
    publishedDate: candidate.beginDay || today,
    url: candidate.url,
    bodyHash,
    modelInputHash: inputHash,
    extractionVersion: EXTRACTION_VERSION,
    extractionMeta,
    extraction,
  };
}

type AnyRecord = Record<string, any>;

async function extractAll(
  candidates: Candidate[],
  previousByUrl: Map<string, AnyRecord>,
  forceExtract = false,
) {
  const kept: AnyRecord[] = [];
  const outcomes: { sourceKey: string; extraction: FundingExtraction; record: AnyRecord | null }[] = [];
  let reused = 0;
  let extracted = 0;
  let rejected = 0;

  type Task = { candidate: Candidate; previous?: AnyRecord };
  const tasks: Task[] = candidates.map((candidate) => ({
    candidate,
    previous: previousByUrl.get(candidate.url),
  }));

  let cursor = 0;
  const worker = async () => {
    while (cursor < tasks.length) {
      const task = tasks[cursor];
      cursor += 1;
      const { candidate, previous } = task;
      // 失败源兜底：正文为空时整条沿用旧记录（含提取结果），不调 LLM。
      if (!candidate.body && previous) {
        kept.push(previous);
        reused += 1;
        continue;
      }
      const bodyHash = hashId(hashBody(candidate.body));
      const inputHash = modelInputHash(candidate);

      let extraction: FundingExtraction | undefined;
      let extractionMeta: AnyRecord;
      const inputMatches = previous?.modelInputHash
        ? previous.modelInputHash === inputHash
        : previous?.bodyHash === bodyHash;
      if (
        !forceExtract &&
        inputMatches &&
        previous?.extraction &&
        previous.extractionVersion === EXTRACTION_VERSION
      ) {
        extraction = previous.extraction as FundingExtraction;
        extractionMeta = previous.extractionMeta ?? {
          inputHash,
          extractorVersion: EXTRACTION_VERSION,
          model: null,
          generatedAt: null,
        };
        reused += 1;
      } else {
        try {
          extraction = await b.ExtractFunding(
            candidate.title,
            candidate.orgHint,
            candidate.beginDay,
            candidate.endDayHint,
            candidate.body,
          );
          extractionMeta = {
            inputHash,
            extractorVersion: EXTRACTION_VERSION,
            model: EXTRACTION_MODEL,
            generatedAt: new Date().toISOString(),
          };
          extracted += 1;
        } catch (error) {
          console.warn(`  ! 提取失败，跳过: ${candidate.title} (${error instanceof Error ? error.message : error})`);
          continue;
        }
      }

      if (!extraction.is_relevant) {
        outcomes.push({ sourceKey: sourceKey(candidate), extraction, record: null });
        rejected += 1;
        console.log(`  - 不相关（${extraction.reject_reason ?? "未说明"}）: ${candidate.title.slice(0, 40)}`);
        continue;
      }
      const record = mapRecord(candidate, extraction, bodyHash, inputHash, extractionMeta!);
      kept.push(record);
      outcomes.push({ sourceKey: sourceKey(candidate), extraction, record });
    }
  };
  await Promise.all(Array.from({ length: LLM_CONCURRENCY }, worker));
  console.log(`MiniMax 提取：复用 ${reused}，新提取 ${extracted}，判为不相关 ${rejected}，入库 ${kept.length}`);
  return { records: kept, outcomes };
}

/* ---------- 合并输出 ---------- */

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

function argumentValue(name: string) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : null;
}

function printComparison(
  outcomes: { sourceKey: string; extraction: FundingExtraction; record: AnyRecord | null }[],
  previousById: Map<string, AnyRecord>,
) {
  const fields: (keyof FundingExtraction)[] = [
    "is_relevant",
    "reject_reason",
    "org",
    "deadline",
    "deadline_kind",
    "amount_wan",
    "amount_scope",
    "support_type",
    "funding_type",
    "field",
    "issue",
    "region",
    "duration",
    "summary",
  ];
  let changedRecords = 0;
  for (const outcome of outcomes.sort((left, right) => left.sourceKey.localeCompare(right.sourceKey))) {
    const previous = previousById.get(outcome.sourceKey);
    const before = previous?.extraction as FundingExtraction | undefined;
    const changes = fields.filter((field) => JSON.stringify(before?.[field] ?? null) !== JSON.stringify(outcome.extraction[field] ?? null));
    if (!changes.length) continue;
    changedRecords += 1;
    console.log(`\n[${outcome.sourceKey}] ${previous?.title ?? outcome.record?.title ?? "未收录候选"}`);
    for (const field of changes) {
      console.log(`  ${field}:`);
      console.log(`    旧: ${JSON.stringify(before?.[field] ?? null)}`);
      console.log(`    新: ${JSON.stringify(outcome.extraction[field] ?? null)}`);
    }
  }
  console.log(`\n对比完成：${outcomes.length} 条回放，${changedRecords} 条发生变化。`);
}

async function main() {
  const mode = argumentValue("--mode") ?? "all";
  const compare = process.argv.includes("--compare");
  const noWrite = process.argv.includes("--no-write");
  const forceExtract = process.argv.includes("--force");
  const sourceKeyFilter = argumentValue("--source-key");
  if (!["all", "collect", "extract"].includes(mode)) {
    throw new Error(`未知 mode：${mode}（可选 all / collect / extract）`);
  }
  if (mode === "collect" && (compare || sourceKeyFilter)) {
    throw new Error("collect 模式不支持 --compare 或 --source-key；请在 extract/replay 阶段使用。");
  }

  if (mode !== "collect" && !process.env.MINIMAX_API_KEY) {
    try {
      process.loadEnvFile(path.join(ROOT, ".env"));
    } catch {}
    if (!process.env.MINIMAX_API_KEY) {
      console.error("缺少 MINIMAX_API_KEY：请在 .env 中配置后再运行。");
      process.exit(1);
    }
  }

  // 抓取会重建整份资助快照；读取旧快照只为复用提取缓存（bodyHash）。
  let existing: AnyRecord[] = [];
  try {
    existing = JSON.parse(await readFile(OUT, "utf8"));
    console.log(`已有记录：${existing.length} 条（复用提取缓存）`);
  } catch {
    console.log("未找到既有 fundings-data.json，将从空列表开始。");
  }

  const previousByUrl = new Map<string, AnyRecord>(
    existing.filter((item) => item.url).map((item) => [item.url, item]),
  );
  const previousById = new Map<string, AnyRecord>(
    existing.filter((item) => item.id).map((item) => [item.id, item]),
  );

  const SOURCE_NAMES = [
    "中国发展简报·公益资助",
    "中国发展简报·资讯",
    "中国红十字基金会",
    "中国慈展会·资源直通车",
    "中国人口福利基金会",
  ];
  const fallbackCandidates: Candidate[] = [];

  if (mode !== "extract") {
    // 任一源关键请求失败时只保留该来源原有 manifest 指针，绝不以空正文覆盖 IR。
    const results = await Promise.allSettled([
      scrapeCDBFundings(),
      scrapeCDBNews(),
      scrapeCRCF(),
      scrapeCNCF(),
      scrapeCPWF(),
    ]);
    const collected: Candidate[] = [];
    const refreshedSources = new Set<string>();
    results.forEach((result, index) => {
      const sourceName = SOURCE_NAMES[index];
      if (result.status === "fulfilled" && result.value.length > 0) {
        refreshedSources.add(sourceName);
        collected.push(...result.value);
        return;
      }
      const reason = result.status === "rejected"
        ? result.reason?.message ?? result.reason
        : "抓取结果为 0 条，疑似页面结构变化";
      console.error(`  ✗ ${sourceName} 抓取失败：${reason}`);
      const fallback = existing.filter((item) => item.sourceName === sourceName);
      console.error(`    保留旧 IR；若尚无 IR，则沿用旧快照 ${fallback.length} 条`);
      fallbackCandidates.push(...fallback.map((item) => ({
        title: item.title,
        orgHint: item.org,
        address: item.location ?? "",
        beginDay: item.publishedDate ?? "",
        endDayHint: "",
        body: "",
        url: item.url,
        sourceName,
      })));
    });

    const fetchedAt = new Date().toISOString();
    const documents = collected.filter((candidate) => candidate.body).map((candidate) => candidateToIR(candidate, fetchedAt));
    const manifestRecords = await updateCurrentIR(IR_ROOT, "fundings", documents, refreshedSources);
    console.log(`\n原文 IR：本次写入 ${documents.length} 条，current manifest 共 ${Object.keys(manifestRecords).length} 条`);
    if (mode === "collect") {
      console.log(`collect 完成：${IR_ROOT}`);
      return;
    }
  }

  const documents = await readCurrentIR(IR_ROOT, "fundings");
  let candidates = documents.map(irToCandidate);
  const irUrls = new Set(candidates.map((candidate) => candidate.url));
  candidates.push(...fallbackCandidates.filter((candidate) => !irUrls.has(candidate.url)));
  if (sourceKeyFilter) candidates = candidates.filter((candidate) => sourceKey(candidate) === sourceKeyFilter);
  if (!candidates.length) {
    throw new Error(sourceKeyFilter
      ? `IR 中找不到 ${sourceKeyFilter}`
      : `没有可提取的 IR；请先运行 pnpm collect:fundings`);
  }

  console.log(`\n从 IR 读取 ${candidates.length} 条，开始 MiniMax 提取…`);
  const { records, outcomes } = await extractAll(candidates, previousByUrl, forceExtract);
  if (compare) printComparison(outcomes, previousById);

  if (candidates.length > 0 && records.length === 0 && outcomes.length === 0) {
    throw new Error("所有提取调用均失败，已保留原快照不做覆盖。");
  }
  if (noWrite) {
    console.log("--no-write：未修改 fundings-data.json。");
    return;
  }

  let outputRecords = records;
  if (sourceKeyFilter) {
    const selected = new Set(candidates.map(sourceKey));
    outputRecords = [...existing.filter((item) => !selected.has(item.id)), ...records];
  }
  const all = dedupe(outputRecords)
    .sort((a, b) => {
      if (a.openStatus !== b.openStatus) return a.openStatus === "开放中" ? -1 : 1;
      return a.publishedDays - b.publishedDays;
    });

  await writeFile(OUT, `${JSON.stringify(all, null, 2)}\n`, "utf8");

  console.log("\n写入完成：", OUT);
  const byStatus = all.reduce<Record<string, number>>((acc, item) => {
    acc[item.openStatus] = (acc[item.openStatus] ?? 0) + 1;
    return acc;
  }, {});
  console.log(`总计 ${all.length} 条（${Object.entries(byStatus).map(([k, v]) => `${k} ${v}`).join("，")}）`);
  for (const item of all) {
    console.log(
      `- [${item.openStatus}] ${item.publishedDate} | ${item.supportType} | ${item.type} | ${item.org} | ${item.title}`,
    );
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
