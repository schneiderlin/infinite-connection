import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const DATA_FILE = path.join(ROOT, "src", "lib", "jobs-data.json");

const PROVINCES = ["北京市","天津市","上海市","重庆市","河北省","山西省","辽宁省","吉林省","黑龙江省","江苏省","浙江省","安徽省","福建省","江西省","山东省","河南省","湖北省","湖南省","广东省","海南省","四川省","贵州省","云南省","陕西省","甘肃省","青海省","台湾省","内蒙古自治区","广西壮族自治区","西藏自治区","宁夏回族自治区","新疆维吾尔自治区"];

const ROLE_RULES = [
  { regex: /项目|program|project/i, role: "项目官员" },
  { regex: /传播|媒体|品牌|communication/i, role: "传播" },
  { regex: /财务|会计|finance/i, role: "财务" },
  { regex: /人力|hr|人事/i, role: "人力资源" },
  { regex: /筹款|众筹|捐赠|fundraising/i, role: "筹款" },
  { regex: /法务|法律|legal/i, role: "法务" },
  { regex: /研究|调研|research/i, role: "研究" },
  { regex: /督导|supervisor/i, role: "督导" },
  { regex: /总监|主任|管理|director/i, role: "高级管理" },
];

async function main() {
  console.log("🚀 开始清洗招聘模块数据...\n");
  const raw = await readFile(DATA_FILE, "utf8");
  const jobs = JSON.parse(raw);

  const refined = jobs.map((item) => {
    const text = `${item.title} ${item.summary}`;

    // 1. 区分：人员招聘 vs 志愿者招募
    if (/志愿者|志愿|义工/i.test(text) || /志愿者/i.test(item.org)) {
      item.category = "志愿者招募";
      item.kind = "志愿者";
      item.servicePeriod = "短期"; // 可根据"长期"字样动态调整
      if (/长期/i.test(text)) item.servicePeriod = "长期";
    } else {
      item.category = "人员招聘";
      // 判断全职/兼职/实习
      if (/实习|intern/i.test(text)) item.kind = "实习";
      else if (/兼职|part[\s-]?time/i.test(text)) item.kind = "兼职";
      else item.kind = "全职";
    }

    // 2. 识别职能/角色
    let matchedRole = "项目官员"; // 默认
    for (const rule of ROLE_RULES) {
      if (rule.regex.test(text)) {
        matchedRole = rule.role;
        break;
      }
    }
    item.role = matchedRole;

    // 3. 识别地域
    const foundProv = PROVINCES.find(prov => text.includes(prov));
    if (foundProv) {
      item.location = foundProv;
    } else if (/远程|线上|remote/i.test(text)) {
      item.location = "远程办公";
    }

    // 4. 尝试提取薪资（如果之前没抓到）
    if (!item.salary || item.salary === "面议") {
      const salaryMatch = text.match(/(\d+[-–~]\d+[Kk]|\d+[-–~]\d+元\/天|\d+[-–~]\d+元\/月)/);
      if (salaryMatch) item.salary = salaryMatch[0];
    }

    return item;
  });

  await writeFile(DATA_FILE, JSON.stringify(refined, null, 2) + "\n", "utf8");
  console.log(`✅ 招聘数据清洗完成！共处理 ${refined.length} 条，更新字段。`);
}

main();