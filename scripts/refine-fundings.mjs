import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const DATA_FILE = path.join(ROOT, "src", "lib", "fundings-data.json");

const PROVINCES = ["北京市","天津市","上海市","重庆市","河北省","山西省","辽宁省","吉林省","黑龙江省","江苏省","浙江省","安徽省","福建省","江西省","山东省","河南省","湖北省","湖南省","广东省","海南省","四川省","贵州省","云南省","陕西省","甘肃省","青海省","台湾省","内蒙古自治区","广西壮族自治区","西藏自治区","宁夏回族自治区","新疆维吾尔自治区","香港特别行政区","澳门特别行政区"];

// 🚫 黑名单：绝对不要的（公众筹款、企业采购、中标公告、支付宝等）
const BLACKLIST_REGEX = /支付宝|腾讯公益|水滴筹|轻松筹|基金会中心网|筹款项目|采购公告|中标|成交公告|招标公告|企业采购|商家招募|政府采购/i;
// ✅ 白名单：必须面向公益机构
const WHITELIST_REGEX = /社会组织|公益组织|社工机构|社会服务机构|公益伙伴|招募|资助计划|项目申报|机构资助/i;
const ECO_TITLE_REGEX = /生态|环保|绿化|低碳/;
const COMMUNITY_TITLE_REGEX = /社区|营造|邻里|居民/;

// status 只表示人工审核状态；旧快照的“开放中 / 已截止”要迁移到 openStatus。
// PENDING_REVIEW 是 AI 低置信度分类的结果，等待人工复核，不能被清洗规则覆盖。
const REVIEW_STATUSES = new Set(["PENDING", "PENDING_REVIEW", "PUBLISHED", "REJECTED"]);

async function main() {
  console.log("🚀 开始清洗资助模块数据...\n");
  const raw = await readFile(DATA_FILE, "utf8");
  let fundings = JSON.parse(raw);

  // 1. 先按黑/白名单过滤（只过滤新的待审记录；已发布/已拒绝/历史记录不因关键词规则被删除）
  fundings = fundings.filter((item) => {
    if (
      item.status === "PUBLISHED" ||
      item.status === "PENDING_REVIEW" ||
      item.status === "REJECTED" ||
      !item.status
    ) {
      return true;
    }
    const text = `${item.title} ${item.summary} ${item.org}`;
    if (BLACKLIST_REGEX.test(text)) return false; // 有黑名单，直接丢弃
    if (!WHITELIST_REGEX.test(text) && !item.title.includes("资助")) return false; // 没有白名单，大概率是垃圾新闻
    return true;
  });

  // 2. 精细化打标
  const refined = fundings.map((item) => {
    // status 只表示人工审核状态；抓取脚本写入的新记录为 PENDING，
    // 历史快照没有 status 时按已发布处理，避免整站变成待审。
    const legacyStatus = item.status;
    if (legacyStatus === "开放中" || legacyStatus === "已截止") {
      item.openStatus = item.openStatus ?? legacyStatus;
    }

    const isReviewed = legacyStatus === "PUBLISHED";
    const isLegacyPublished = !legacyStatus;
    const isAwaitingAiReview = legacyStatus === "PENDING_REVIEW";
    const preserveField = isReviewed || isLegacyPublished || isAwaitingAiReview;
    item.status = REVIEW_STATUSES.has(legacyStatus) ? legacyStatus : "PUBLISHED";

    const text = `${item.title} ${item.summary} ${item.org}`;
    
    const foundProv = PROVINCES.find(prov => text.includes(prov));
    if (foundProv) item.region = foundProv;

    // 已发布 / 历史无 status 的资助领域是人工审核结果，不再用标题规则覆盖。
    if (!preserveField) {
      // 生态环保标签只由标题中的明确关键词决定，避免正文里的泛化环境描述误伤分类。
      if (item.field === "生态环保" && !ECO_TITLE_REGEX.test(item.title)) {
        item.field = "其他";
      }

      // 社区营造标签同样只认标题中的明确关键词，避免正文提到社区服务就误判。
      if (item.field === "社区营造" && !COMMUNITY_TITLE_REGEX.test(item.title)) {
        item.field = "其他";
      }
    }

    if (/物资|设备|图书|捐赠物品|课程|培训名额/i.test(text)) {
      item.supportType = "物资/课程";
    } else {
      item.supportType = "资金";
    }

    if (/民政|政府|社会工作部|街道/i.test(text)) {
      item.type = "政府购买服务";
    } else if (/基金会|慈善会/i.test(text)) {
      item.type = "基金会资助";
    } else {
      item.type = "其他机构资助";
    }

    return item;
  });

  await writeFile(DATA_FILE, JSON.stringify(refined, null, 2) + "\n", "utf8");
  console.log(`✅ 资助数据清洗完成！严格过滤后剩余 ${refined.length} 条。`);
}

main();