import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const DATA_FILE = path.join(ROOT, "src", "lib", "fundings-data.json");

// 省份字典（提取长词优先，避免“北京”覆盖“北京市”）
const PROVINCES = ["北京市","天津市","上海市","重庆市","河北省","山西省","辽宁省","吉林省","黑龙江省","江苏省","浙江省","安徽省","福建省","江西省","山东省","河南省","湖北省","湖南省","广东省","海南省","四川省","贵州省","云南省","陕西省","甘肃省","青海省","台湾省","内蒙古自治区","广西壮族自治区","西藏自治区","宁夏回族自治区","新疆维吾尔自治区","香港特别行政区","澳门特别行政区"];

// 资源类型匹配规则
const TYPE_RULES = [
  { regex: /政府|民政局|采购|招投标/i, type: "政府购买" },
  { regex: /企业|CSR|腾讯|阿里|蚂蚁|字节|京东|万科/i, type: "企业CSR" },
  { regex: /物资|设备|图书|捐赠/i, type: "物资资助" },
  { regex: /伙伴|招募/i, type: "公益项目伙伴招募" },
  { regex: /共建/i, type: "合作共建" },
];

async function main() {
  console.log("🚀 开始清洗资助模块数据...\n");
  const raw = await readFile(DATA_FILE, "utf8");
  const fundings = JSON.parse(raw);

  let changedCount = 0;

  const refined = fundings.map((item) => {
    const text = `${item.title} ${item.summary} ${item.org}`;
    
    // 1. 识别省份
    const foundProv = PROVINCES.find(prov => text.includes(prov));
    if (foundProv) item.region = foundProv;

    // 2. 识别资源类型（默认兜底为基金会资助）
    let matchedType = "慈善会/基金会资助";
    for (const rule of TYPE_RULES) {
      if (rule.regex.test(text)) {
        matchedType = rule.type;
        break;
      }
    }
    item.type = matchedType;

    // 3. 识别资助形式（资金/物资）
    item.supportType = /物资|设备|图书|捐赠/i.test(text) ? "物资" : "资金";

    // 4. 尝试从摘要提取金额（如果原数据没有）
    if (!item.amount || item.amount === "面议" || item.amountWan === 0) {
      const amountMatch = item.summary.match(/(\d+[\.,]?\d*)[-–~]?(\d+[\.,]?\d*)?\s*万/);
      if (amountMatch) {
        item.amount = amountMatch[0];
        item.amountWan = parseFloat(amountMatch[1]);
      }
    }

    // 5. 如果 Excel 数据源本身有类别，也可以结合，这里暂且默认给"综合"或提取
    if (item.field === "综合" || !item.field) {
      if (/乡村|农村|支教/i.test(text)) item.field = "乡村教育";
      else if (/环保|生态|气候|自然/i.test(text)) item.field = "生态环保";
      else if (/儿童|青少年/i.test(text)) item.field = "儿童保护";
      else if (/老人|老龄/i.test(text)) item.field = "老龄关怀";
      else if (/医疗|健康/i.test(text)) item.field = "医疗健康";
    }

    changedCount++;
    return item;
  });

  await writeFile(DATA_FILE, JSON.stringify(refined, null, 2) + "\n", "utf8");
  console.log(`✅ 资助数据清洗完成！共处理 ${refined.length} 条，更新字段。`);
}

main();