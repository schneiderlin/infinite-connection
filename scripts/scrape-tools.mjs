import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const SOURCES_FILE = path.join(ROOT, "scripts", "sources", "tools_sources.json");
const OUT = path.join(ROOT, "src", "lib", "tools-data.json");

const UA = "InfiniteConnectionPreview/0.1 (+https://github.com/schneiderlin/infinite-connection)";
const GAP_MS = 1500; // 每个请求间隔 1.5 秒，避免被封

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function fetchWithUA(url) {
  const res = await fetch(url, {
    headers: { "User-Agent": UA },
    signal: AbortSignal.timeout(15_000),
  });
  if (res.status === 401 || res.status === 403 || res.status === 429) {
    throw new Error(`blocked: HTTP ${res.status}`);
  }
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res;
}

// 从 HTML 中提取标题和描述
function extractMeta(html, fallbackName) {
  const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
  const descMatch = html.match(/<meta[^>]*name=["']description["'][^>]*content=["']([^"']+)["']/i) 
                 || html.match(/<meta[^>]*content=["']([^"']+)["'][^>]*name=["']description["']/i);

  const title = titleMatch ? titleMatch[1].trim() : fallbackName;
  const summary = descMatch ? descMatch[1].trim() : "点击查看详细内容";

  return {
    title: title.substring(0, 100),
    summary: summary.substring(0, 150),
  };
}

// 根据网站名称智能分配分类、颜色和图标
function guessCategory(name) {
  if (/课程|培训|教育|学院|学习/i.test(name)) {
    return { category: "培训课程", tone: "mint", icon: "🎓", action: "立即报名" };
  }
  if (/工具|模板|软件|SaaS|信息化/i.test(name)) {
    return { category: "工具模板", tone: "orange", icon: "📋", action: "⬇ 下载模板" };
  }
  if (/标准|法规|合规|民政部/i.test(name)) {
    return { category: "行业标准", tone: "sky", icon: "📚", action: "查看标准" };
  }
  if (/沙龙|论坛|活动|峰会/i.test(name)) {
    return { category: "行业沙龙", tone: "blue", icon: "☕", action: "立即报名" };
  }
  if (/文章|观察|观点|博客/i.test(name)) {
    return { category: "经验文章", tone: "green", icon: "✍️", action: "阅读全文" };
  }
  // 默认归类为行业报告
  return { category: "行业报告", tone: "purple", icon: "📊", action: "⬇ 下载报告" };
}

// 根据 Excel 的类别，精准映射到前端的分类
function mapExcelCategoryToToolStyle(excelCategory) {
  const cat = excelCategory || "";
  
  if (cat.includes("教育") || cat.includes("培训")) return { category: "培训课程", tone: "mint", icon: "🎓", action: "立即报名" };
  if (cat.includes("工具") || cat.includes("专业支持")) return { category: "公益工具模板库", tone: "orange", icon: "📋", action: "⬇ 下载模板" };
  if (cat.includes("标准") || cat.includes("合规")) return { category: "行业标准", tone: "sky", icon: "📚", action: "查看标准" };
  if (cat.includes("国际")) return { category: "国际经验", tone: "sky", icon: "🌐", action: "阅读全文" };
  if (cat.includes("案例") || cat.includes("经验")) return { category: "同行经验文章", tone: "green", icon: "✍️", action: "阅读全文" };
  if (cat.includes("知识平台") || cat.includes("报告")) return { category: "行业报告", tone: "purple", icon: "📊", action: "⬇ 下载报告" };
  
  // 如果都不匹配，默认归类为行业报告
  return { category: "行业报告", tone: "purple", icon: "📊", action: "⬇ 下载报告" };
}

async function main() {
  console.log("🚀 开始抓取能力工具模块的真实数据...\n");

  // 读取目标清单
  const sourcesRaw = await readFile(SOURCES_FILE, "utf8");
  const sources = JSON.parse(sourcesRaw);

  const allTools = [];
  let successCount = 0;
  let failCount = 0;

  for (let i = 0; i < sources.length; i++) {
    const src = sources[i];
    console.log(`[${i + 1}/${sources.length}] 正在抓取: ${src.name} (${src.url})`);

    try {
      const res = await fetchWithUA(src.url);
      const html = await res.text();
      
      const meta = extractMeta(html, src.name);
      // 使用 Excel 的类别来映射
      const style = mapExcelCategoryToToolStyle(src.category);

      allTools.push({
        id: `scraped-${i + 1}`,
        category: style.category,
        field: "综合", // 默认值，可后续手动细化
        forms: ["免费"], // 默认值
        priceTag: "免费",
        title: meta.title || src.name,
        meta: `🔗 ${src.url}`,
        summary: meta.summary,
        action: style.action,
        price: null,
        tone: style.tone,
        icon: style.icon,
        downloads: 0, // 默认值
        rating: 4.5,  // 默认值
        publishedDays: 0,
      });

      successCount++;
      console.log(`   ✅ 成功抓取`);

    } catch (err) {
      failCount++;
      console.log(`   ❌ 抓取失败: ${err.message}`);
    }

    // 礼貌延时，避免请求过快
    if (i < sources.length - 1) {
      await sleep(GAP_MS);
    }
  }

  // 4. 合并兜底数据（如果某个分类抓取太少，可以手动补充 Mock）
  // 这里为了不覆盖你之前的 Mock 数据，你可以选择在最后 append 一些你手写的 Mock
  // 这里保持简单，直接写入抓到的数据
  const normalized = allTools.map((t, idx) => ({ id: `scraped-${idx + 1}`, ...t }));

  await writeFile(OUT, JSON.stringify(normalized, null, 2) + "\n", "utf8");
  console.log(`\n📊 抓取结束！成功: ${successCount} 条, 失败: ${failCount} 条`);
  console.log(`✅ 数据已保存到 src/lib/tools-data.json`);
}

main();