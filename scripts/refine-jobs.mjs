import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const DATA_FILE = path.join(ROOT, "src", "lib", "jobs-scraped.json");

const PROVINCES = ["北京市","天津市","上海市","重庆市","河北省","山西省","辽宁省","吉林省","黑龙江省","江苏省","浙江省","安徽省","福建省","江西省","山东省","河南省","湖北省","湖南省","广东省","海南省","四川省","贵州省","云南省","陕西省","甘肃省","青海省","台湾省","内蒙古自治区","广西壮族自治区","西藏自治区","宁夏回族自治区","新疆维吾尔自治区"];
const REVIEW_STATUSES = new Set(["PENDING", "PENDING_REVIEW", "PUBLISHED", "REJECTED"]);

// 必须包含这些字眼，才认为是公益行业的招聘
const NGO_KEYWORDS = /基金会|公益|慈善|协会|社会服务|社会工作|NGO|红十字会|志愿服务|社工|恩派|壹基金/i;

const ROLE_RULES = [
  { regex: /社工|社会工作者|一线社工|医务社工/i, role: "社工" },
  { regex: /项目|program|project/i, role: "项目官员" },
  { regex: /传播|媒体|品牌|communication/i, role: "传播" },
  { regex: /财务|会计|finance/i, role: "财务" },
  { regex: /人力|hr|人事/i, role: "人力资源" },
  { regex: /筹款|众筹|捐赠|fundraising/i, role: "筹款" },
  { regex: /法务|法律|legal/i, role: "法务" },
  { regex: /研究|调研|research/i, role: "研究" },
];

async function main() {
  console.log("🚀 开始清洗招聘模块数据...\n");
  const raw = await readFile(DATA_FILE, "utf8");
  let jobs = JSON.parse(raw);

  // 1. 强制过滤：只过滤新的待审记录；已发布/已拒绝/历史记录不因关键词规则被删除
  jobs = jobs.filter((item) => {
    if (
      item.status === "PUBLISHED" ||
      item.status === "PENDING_REVIEW" ||
      item.status === "REJECTED" ||
      !item.status
    ) {
      return true;
    }
    const text = `${item.org} ${item.title} ${item.summary}`;
    return NGO_KEYWORDS.test(text);
  });

  // 2. 重新分类打标
  const refined = jobs.map((item) => {
    const text = `${item.title} ${item.summary}`;
    // 已发布 / 历史无 status（视为已发布）的岗位，岗位类别是人工审核结果，不再覆盖。
    const isReviewed = item.status === "PUBLISHED";
    const isLegacyPublished = !item.status;
    const isAwaitingAiReview = item.status === "PENDING_REVIEW";
    const preserveRole = isReviewed || isLegacyPublished || isAwaitingAiReview;

    if (/志愿者|志愿|义工/i.test(text)) {
      item.category = "志愿者招募";
      item.kind = "志愿者";
    } else {
      item.category = "人员招聘";
      if (/实习|intern/i.test(text)) item.kind = "实习";
      else if (/兼职|part[\s-]?time/i.test(text)) item.kind = "兼职";
      else item.kind = "全职";
    }

    if (!preserveRole || !item.role) {
      let matchedRole = "项目官员";
      for (const rule of ROLE_RULES) {
        if (rule.regex.test(text)) {
          matchedRole = rule.role;
          break;
        }
      }
      item.role = matchedRole;
    }

    const foundProv = PROVINCES.find(prov => text.includes(prov));
    if (foundProv) item.location = foundProv;
    else if (/远程|线上|remote/i.test(text)) item.location = "远程办公";

    // 抓取脚本写入的新记录为 PENDING；历史快照没有 status 时按已发布处理。
    item.status = REVIEW_STATUSES.has(item.status) ? item.status : "PUBLISHED";

    return item;
  });

  await writeFile(DATA_FILE, JSON.stringify(refined, null, 2) + "\n", "utf8");
  console.log(`✅ 招聘数据清洗完成！过滤掉非公益岗位后剩余 ${refined.length} 条。`);
}

main();