import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const DATA_FILE = path.join(ROOT, "src", "lib", "tools-data.json");

// 定义分类规则（按优先级从高到低排列，优先匹配前面的）
const RULES = [
  {
    // 1. 培训课程
    regex: /课程|培训|教育|学院|学习|研修|网校|课堂/i,
    category: "培训课程",
    tone: "mint",
    icon: "🎓",
    action: "立即报名",
  },
  {
    // 2. 行业沙龙会议
    regex: /沙龙|会议|论坛|峰会|研讨会|圆桌|年会|交流会/i,
    category: "行业沙龙会议",
    tone: "blue",
    icon: "☕",
    action: "立即报名",
  },
  {
    // 3. 行业标准
    regex: /标准|法规|合规|民政部|法律|办法|条例|规范|制度/i,
    category: "行业标准",
    tone: "sky",
    icon: "📚",
    action: "查看标准",
  },
  {
    // 4. 公益工具模板库
    regex: /工具|模板|软件|SaaS|信息化|数据库|系统|灵析|平台/i,
    category: "公益工具模板库",
    tone: "orange",
    icon: "📋",
    action: "⬇ 下载模板",
  },
  {
    // 5. 国际经验
    regex: /国际|全球|联合国|GRI|AVPN|GIIN|Candid|Oxfam|WWF|TNC|UNDP|Ford|Gates/i,
    category: "国际经验",
    tone: "sky",
    icon: "🌐",
    action: "阅读全文",
  },
  {
    // 6. 同行经验文章
    regex: /文章|观察|观点|博客|简报|资讯|媒体|学园|简报/i,
    category: "同行经验文章",
    tone: "green",
    icon: "✍️",
    action: "阅读全文",
  },
];

// 如果都不匹配，默认归类为“行业报告”
const DEFAULT_STYLE = {
  category: "行业报告",
  tone: "purple",
  icon: "📊",
  action: "⬇ 下载报告",
};

async function main() {
  console.log("🚀 开始自动清洗能力工具数据...\n");

  const raw = await readFile(DATA_FILE, "utf8");
  const tools = JSON.parse(raw);

  let changedCount = 0;
  const categoryCount = {};

  const refined = tools.map((tool) => {
    const text = `${tool.title} ${tool.summary}`;
    let matched = null;

    // 1. 尝试匹配规则
    for (const rule of RULES) {
      if (rule.regex.test(text)) {
        matched = rule;
        break;
      }
    }

    // 2. 应用匹配结果或默认值
    const style = matched || DEFAULT_STYLE;
    
    // 统计分类数量
    categoryCount[style.category] = (categoryCount[style.category] || 0) + 1;
    
    // 判断是否真正修改了数据（仅用于日志展示）
    if (tool.category !== style.category) {
      console.log(`🔀 "${tool.title.substring(0, 30)}..."`);
      console.log(`   原分类: ${tool.category}  ->  新分类: ${style.category}`);
      changedCount++;
    }

    return {
      ...tool,
      category: style.category,
      tone: style.tone,
      icon: style.icon,
      action: style.action,
    };
  });

  // 3. 写回 JSON 文件
  await writeFile(DATA_FILE, JSON.stringify(refined, null, 2) + "\n", "utf8");

  console.log(`\n📊 清洗完成！共处理 ${tools.length} 条数据，其中 ${changedCount} 条分类被调整。`);
  console.log("📈 各分类数量统计：");
  for (const [cat, count] of Object.entries(categoryCount)) {
    console.log(`   - ${cat}: ${count} 条`);
  }
  console.log(`\n✅ 数据已更新到 src/lib/tools-data.json`);
}

main();