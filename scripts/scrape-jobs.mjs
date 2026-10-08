#!/usr/bin/env node
/**
 * 招聘数据抓取脚本（预览用）
 *
 * 来源清单：docs/references/公益招聘网站信息库.xlsx（35 个带 URL 的来源）。
 * 当前接入：
 *   1. 中国发展简报 · NGO招聘（chinadevelopmentbrief.org.cn）—— 站内列表接口
 *
 * 暂未接入（附原因）：
 *   - ReliefWeb：API 需申请获批 appname（https://apidoc.reliefweb.int/parameters#appname），
 *     且 RSS 端点拒绝非白名单 UA（自定义 UA 返回 406），获批前不抓。
 *   - NGO英才网 / NGO Job Board：本机连接超时，暂不可用。
 *
 * 抓取约定（沿用 docs 里的采集规范）：
 *   - 固定可识别 User-Agent；请求间隔 ≥ 1.5s；每来源最多 20 条；
 *   - 遇到 401/403/429 直接标记失败跳过，不绕过；
 *   - 只保存事实性摘要 + 原始链接，投递跳转原站。
 *
 * 用法：node scripts/scrape-jobs.mjs
 * 输出：src/lib/jobs-scraped.json（JobsBrowser 直接 import）
 */

import { writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const OUT = path.join(ROOT, "src/lib/jobs-scraped.json");
const UA = "InfiniteConnectionPreview/0.1 (+https://github.com/schneiderlin/infinite-connection)";
const PER_SOURCE = 20;
const GAP_MS = 1500;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function fetchWithUA(url, options = {}) {
  const res = await fetch(url, {
    ...options,
    headers: { "User-Agent": UA, ...(options.headers ?? {}) },
    signal: AbortSignal.timeout(20_000),
  });
  if (res.status === 401 || res.status === 403 || res.status === 429) {
    throw new Error(`blocked: HTTP ${res.status}`);
  }
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res;
}

/** 发布距今的天数与展示文案 */
function ageOf(dateStr) {
  const then = new Date(dateStr).getTime();
  if (Number.isNaN(then)) return { publishedDays: 0, time: "近期发布" };
  const days = Math.max(0, Math.round((Date.now() - then) / 86_400_000));
  const time =
    days === 0 ? "今天发布" : days === 1 ? "昨天发布" : days < 7 ? `${days}天前发布` : days < 30 ? `${Math.floor(days / 7)}周前发布` : `${Math.floor(days / 30)}个月前发布`;
  return { publishedDays: days, time };
}

/** 职能关键词归类到站内职能标签 */
function guessRole(text) {
  const t = text.toLowerCase();
  if (/传播|沟通|品牌|媒体|communication|media/.test(t)) return "传播";
  if (/财务|会计|finance|account/.test(t)) return "财务";
  if (/督导|supervisor/.test(t)) return "督导";
  if (/筹款|募捐|fundraising|donor/.test(t)) return "筹款";
  if (/研究|调研|research|analyst/.test(t)) return "研究";
  if (/项目|program|project|officer/.test(t)) return "项目官员";
  return "其他";
}

function guessKind(text) {
  if (/实习|intern/i.test(text)) return "实习";
  if (/兼职|part[\s-]?time/i.test(text)) return "兼职";
  return "全职";
}

/* ---------- 来源 1：中国发展简报 · NGO招聘 ---------- */
async function scrapeCDB() {
  const res = await fetchWithUA("https://www.chinadevelopmentbrief.org.cn/search/jobs/getData", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: `search=0&pageNum=1&pageSize=${PER_SOURCE}`,
  });
  const data = await res.json();
  if (data.code !== 200) throw new Error(`API code ${data.code}`);
  const list = data.result?.list ?? [];
  return list.slice(0, PER_SOURCE).map((j) => {
    const remote = j.jobModel === "YCBG";
    // 直辖市时 cityName 已包含省份（“北京·北京市” → “北京市”）
    const prov = (j.provinceName ?? "").replace(/[省市]$/, "");
    const joined =
      j.cityName && prov && j.cityName.startsWith(prov)
        ? j.cityName
        : [j.provinceName, j.cityName].filter(Boolean).join("·");
    const location = remote ? "远程办公" : joined || "全国";
    const salary =
      j.salaryBegin && j.salaryBegin !== "面议" && j.salaryEnd
        ? `${j.salaryBegin}-${j.salaryEnd}`
        : "面议";
    const requirements = [j.experience, j.educationValue].filter(Boolean).join("，");
    const summary =
      [j.companyDomains ? `机构领域：${j.companyDomains}` : "", requirements ? `要求：${requirements}。` : ""]
        .filter(Boolean)
        .join("；") || "点击查看原始招聘详情。";
    return {
      kind: ["全职", "兼职", "实习"].includes(j.type) ? j.type : guessKind(j.title),
      role: guessRole(`${j.postName ?? ""} ${j.title}`),
      ...ageOf(j.updateTime),
      title: `【招聘】${j.title} · ${j.companyName}`,
      summary,
      org: j.companyName ?? "未知机构",
      location,
      salary,
      due: "详见原帖",
      sourceName: "中国发展简报·NGO招聘",
      url: `https://www.chinadevelopmentbrief.org.cn/jobs/detail/${j.id}.html`,
    };
  });
}

/* ---------- 主流程 ---------- */
const sources = [
  { name: "中国发展简报·NGO招聘", fn: scrapeCDB },
];

const all = [];
const report = [];
for (const [i, src] of sources.entries()) {
  if (i > 0) await sleep(GAP_MS);
  try {
    const items = await src.fn();
    report.push(`✅ ${src.name}: ${items.length} 条`);
    all.push(...items);
  } catch (err) {
    report.push(`❌ ${src.name}: ${err.message}`);
  }
}

// 与 mock 数据（id 1-8）错开
const normalized = all.map((j, idx) => ({ id: 10001 + idx, ...j }));
await writeFile(OUT, JSON.stringify(normalized, null, 2) + "\n", "utf8");

console.log(report.join("\n"));
console.log(`共 ${normalized.length} 条 → ${path.relative(ROOT, OUT)}`);
