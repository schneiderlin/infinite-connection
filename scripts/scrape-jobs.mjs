#!/usr/bin/env node
/**
 * 招聘数据抓取脚本（预览用）
 *
 * 业务规则：
 *   - 只保留公益组织 / 社会组织 / 基金会 / 社工机构 / 协会等非营利主体的岗位；
 *   - 明确排除商业公司（有限公司、管理咨询、文化发展公司、猎头/劳务等）；
 *   - 志愿者岗位单独归入“志愿者招募”，不混入人员招聘。
 *
 * 来源（只接入公益垂类与机构官网，不接入综合商业招聘平台）：
 *   1. 中国发展简报 · NGO招聘（全量 209 条列表接口）
 *   2. 中国公共招聘网（公益/社会服务关键词，政府公共就业平台）
 *   3. 壹基金 · 工作机会
 *   4. 美丽中国支教 · 成为员工
 *   5. ReliefWeb / NGO Job Board 公开 RSS（国际公益 / 人道主义招聘）
 *
 * 抓取约定：
 *   - 固定可识别 User-Agent；请求间隔 ≥ 1.5s；
 *   - 遇到 401/403/429 直接标记失败跳过，不绕过；
 *   - 只保存事实性摘要 + 原始链接，投递跳转原站；
 *   - 原站未提供发布时间的岗位标记“发布时间未知”，绝不把抓取时间当作发布时间。
 *
 * 用法：node --use-env-proxy scripts/scrape-jobs.mjs
 * 输出：src/lib/jobs-scraped.json（JobsBrowser / platform-data 直接 import）
 */

import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { domesticOrganizationSources } from "./job-sources/domestic-organizations.mjs";
import { internationalRssSources } from "./job-sources/international-rss.mjs";
import { publicJobSources } from "./job-sources/public-jobs.mjs";

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const OUT = path.join(ROOT, "src/lib/jobs-scraped.json");
const REVIEW_STATUSES = new Set(["PENDING", "PENDING_REVIEW", "PUBLISHED", "REJECTED"]);
const UA = "InfiniteConnectionPreview/0.1 (+https://github.com/schneiderlin/infinite-connection)";
const CDB_PAGE_SIZE = 500;
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

function ageOf(dateStr) {
  const then = new Date(dateStr).getTime();
  if (Number.isNaN(then)) return { publishedDays: 36500, time: "发布时间未知" };
  const days = Math.max(0, Math.round((Date.now() - then) / 86_400_000));
  const time =
    days === 0
      ? "今天发布"
      : days === 1
        ? "昨天发布"
        : days < 7
          ? `${days}天前发布`
          : days < 30
            ? `${Math.floor(days / 7)}周前发布`
            : `${Math.floor(days / 30)}个月前发布`;
  return { publishedDays: days, time };
}

function guessRole(text) {
  const t = text.toLowerCase();
  if (/传播|沟通|品牌|媒体|communication|media/.test(t)) return "传播";
  if (/财务|会计|finance|account/.test(t)) return "财务";
  if (/人力|招聘|hr\b|human resource/.test(t)) return "人力资源";
  if (/总监|主任|负责人|高级管理|director|manager/.test(t)) return "高级管理";
  if (/督导|supervisor/.test(t)) return "督导";
  if (/筹款|募捐|fundraising|donor/.test(t)) return "筹款";
  if (/法务|法律|legal/.test(t)) return "法务";
  if (/研究|调研|research|analyst/.test(t)) return "研究";
  if (/项目|program|project|officer/.test(t)) return "项目官员";
  return "其他";
}

function guessVolunteerRole(text) {
  const t = text.toLowerCase();
  if (/技术|开发|工程|technology|developer|engineer/.test(t)) return "技术开发";
  if (/评估|测评|evaluation|assessment/.test(t)) return "评估";
  if (/传播|沟通|品牌|媒体|communication|media/.test(t)) return "传播";
  if (/人力|招聘|hr\b|human resource/.test(t)) return "人力资源";
  if (/督导|supervisor/.test(t)) return "督导";
  if (/筹款|募捐|fundraising|donor/.test(t)) return "筹款";
  if (/法务|法律|legal/.test(t)) return "法务";
  if (/研究|调研|research/.test(t)) return "研究";
  if (/活动|event/.test(t)) return "活动执行";
  return "项目执行";
}

function normalizeJobType(sourceType, title) {
  if (/志愿者/.test(sourceType)) return { category: "志愿者招募", kind: "志愿者" };
  if (/实习/.test(sourceType) || /实习|intern/i.test(title)) return { category: "人员招聘", kind: "实习" };
  if (/兼职/.test(sourceType) || /兼职|part[\s-]?time/i.test(title)) return { category: "人员招聘", kind: "兼职" };
  return { category: "人员招聘", kind: "全职" };
}

/* ---------- 主体过滤：商业公司 vs 公益组织 ---------- */

const COMMERCIAL_ORG =
  /有限公司|有限责任公司|股份公司|股份经济合作社|集团|企业管理|管理咨询|文化发展|科技发展|人力资源|劳务|银行|保险|证券|地产|置业|口腔|门诊|医院|诊所|医美|美容|销售|Chamber of Commerce|DEVELOPMENT Solutions/i;

// 公益组织常见后缀/品牌；用于确认来源主体属于非营利部门。
const NONPROFIT_HINT =
  /基金会|公益|慈善|社会工作|社工|协会|学会|联合会|促进会|伙伴关系|服务中心|发展中心|研究中心|研究院|研究所|代表处|社会服务|志愿|义工|书院|学社|社区|项目|网络|联盟|委员会|中心|行动亚洲|融合中国|iD3梦想飞|无国界医生|FSC/;

// 少数非营利主体法定名称里也带“有限公司”（如境外 NGO 代表处），仅对这些例外放行。
const NONPROFIT_EXCEPTION = /基金会|公益|慈善|社会工作|社工|协会|代表处|无国界医生|上海共益/;

function isPublicWelfareOrg(org) {
  const name = String(org ?? "").trim();
  if (!name) return false;
  if (COMMERCIAL_ORG.test(name)) return NONPROFIT_EXCEPTION.test(name) && NONPROFIT_HINT.test(name);
  return NONPROFIT_HINT.test(name);
}

function isCommercialOrg(org) {
  const name = String(org ?? "").trim();
  return Boolean(name) && COMMERCIAL_ORG.test(name) && !NONPROFIT_EXCEPTION.test(name);
}


/* ---------- 中国发展简报 · NGO招聘（全量） ---------- */

function locationOf(j) {
  const city = String(j.cityName ?? "").trim();
  const prov = String(j.provinceName ?? "").trim();
  if (j.jobModel === "YCBG" || /远程|线上/.test(city)) return "远程办公";
  if (!city && !prov) return "全国";
  if (!prov || city === prov || city.startsWith(prov)) return city || prov;
  return `${prov}·${city}`;
}

function salaryOf(j, volunteer) {
  const raw = String(j.salaryBegin ?? "").trim();
  if (!raw || raw === "面议") return volunteer ? "志愿服务" : "面议";
  return raw;
}

function summaryOf(j) {
  const requirements = [j.experience, j.educationValue].filter(Boolean).join("，");
  return (
    [
      j.companyDomains ? `机构领域：${j.companyDomains}` : "",
      requirements ? `要求：${requirements}。` : "",
    ]
      .filter(Boolean)
      .join("；") || "点击查看原始招聘详情。"
  );
}

function toJobItem(j) {
  const jobType = normalizeJobType(j.type ?? "", j.title ?? "");
  const volunteer = jobType.category === "志愿者招募";
  const org = String(j.companyName ?? "").trim();
  return {
    ...jobType,
    role: volunteer
      ? guessVolunteerRole(`${j.postName ?? ""} ${j.title ?? ""}`)
      : guessRole(`${j.postName ?? ""} ${j.title ?? ""}`),
    ...ageOf(j.updateTime),
    title: `【${volunteer ? "志愿者" : "招聘"}】${String(j.title ?? "").trim()} · ${org}`,
    summary: summaryOf(j),
    org,
    location: locationOf(j),
    salary: salaryOf(j, volunteer),
    due: "详见原帖",
    sourceName: "中国发展简报·NGO招聘",
    url: `https://www.chinadevelopmentbrief.org.cn/jobs/detail/${j.id}.html`,
  };
}

async function scrapeCDB() {
  const res = await fetchWithUA("https://www.chinadevelopmentbrief.org.cn/search/jobs/getData", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: `search=0&pageNum=1&pageSize=${CDB_PAGE_SIZE}`,
  });
  const data = await res.json();
  if (data.code !== 200) throw new Error(`API code ${data.code}`);
  const list = data.result?.list ?? [];
  console.log(`CDB：接口返回 ${list.length} 条（total=${data.result?.total ?? "未知"}）`);

  const accepted = list
    .filter((j) => j.id && j.title && j.companyName)
    .filter((j) => isPublicWelfareOrg(j.companyName))
    .map(toJobItem);

  console.log(`CDB：公益主体岗位 ${accepted.length} 条（已排除商业公司 / 非公益主体）`);
  return accepted;
}

/* ---------- 主流程 ---------- */

// 招聘渠道只保留公益垂类平台与机构官网；综合商业招聘平台不在采集范围。
const sources = [
  { name: "中国发展简报·NGO招聘", scrape: scrapeCDB },
  ...publicJobSources,
  ...domesticOrganizationSources,
  ...internationalRssSources,
];

const all = [];
const report = [];
for (const [i, src] of sources.entries()) {
  if (i > 0) await sleep(GAP_MS);
  try {
    const items = await src.scrape({
      fetchWithUA,
      ageOf,
      guessRole,
      guessVolunteerRole,
      normalizeJobType,
      perSource: PER_SOURCE,
      sleep,
      userAgent: UA,
    });
    report.push(`✅ ${src.name}: ${items.length} 条`);
    all.push(...items);
  } catch (err) {
    report.push(`❌ ${src.name}: ${err.message}`);
  }
}

const filtered = all.filter((job) => {
  if (isCommercialOrg(job.org)) {
    report.push(`  - 排除商业主体：${job.org}｜${job.title}`);
    return false;
  }
  return true;
});

function dedupeKey(job) {
  const text = (value) =>
    String(value ?? "")
      .normalize("NFKC")
      .toLowerCase()
      .replace(/^【[^】]+】/, "")
      .replace(/[\s·•—–_()（）\[\]【】]/g, "");
  return `${text(job.org)}|${text(job.title)}`;
}

// 抓取会重建整份岗位快照；先读取旧快照，保住人工审核状态和已审核岗位类别。
// 历史快照没有 status 时按“已发布”处理，避免每次重跑都把线上岗位变成待审。
let existing = [];
try {
  existing = JSON.parse(await readFile(OUT, "utf8"));
  console.log(`已有记录：${existing.length} 条（将保留审核状态与已审核岗位类别）`);
} catch {
  console.log("未找到既有 jobs-scraped.json，将从空列表开始。");
}

const previousByUrl = new Map(
  existing.filter((job) => job.url?.trim()).map((job) => [job.url.trim(), job]),
);
const previousByKey = new Map(existing.map((job) => [dedupeKey(job), job]));

const seenUrls = new Set();
const seenJobs = new Set();
const unique = filtered.filter((job) => {
  const url = job.url?.trim();
  const key = dedupeKey(job);
  if ((url && seenUrls.has(url)) || seenJobs.has(key)) return false;
  if (url) seenUrls.add(url);
  seenJobs.add(key);
  return true;
});

// 所有来源统一打上待审标记；但同一条旧岗位重新抓到时，沿用已有人工审核状态和岗位类别。
const normalized = unique
  .sort((a, b) => a.publishedDays - b.publishedDays)
  .map((job, idx) => {
    const url = job.url?.trim();
    const previous = (url && previousByUrl.get(url)) || previousByKey.get(dedupeKey(job));
    const status = previous
      ? REVIEW_STATUSES.has(previous.status)
        ? previous.status
        : "PUBLISHED"
      : "PENDING";

    return {
      id: 10001 + idx,
      ...job,
      ...(previous?.aiSuggestedCategory
        ? { aiSuggestedCategory: previous.aiSuggestedCategory }
        : {}),
      ...(typeof previous?.aiConfidence === "number"
        ? { aiConfidence: previous.aiConfidence }
        : {}),
      // 已发布 / AI 待复核岗位的类别是审核结果，抓取规则不能覆盖它。
      ...(["PUBLISHED", "PENDING_REVIEW"].includes(status) && previous?.role
        ? { role: previous.role }
        : {}),
      status,
    };
  });

await writeFile(OUT, JSON.stringify(normalized, null, 2) + "\n", "utf8");

console.log(report.join("\n"));
console.log(`去重后共 ${normalized.length} 条 → ${path.relative(ROOT, OUT)}`);
console.log(`其中志愿者岗位 ${normalized.filter((job) => job.category === "志愿者招募").length} 条`);
