import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const SOURCES_FILE = path.join(ROOT, "scripts", "sources", "fundings_sources.json");
const OUT = path.join(ROOT, "src", "lib", "fundings-data.json");

const UA = "InfiniteConnectionPreview/0.1 (+https://github.com/schneiderlin/infinite-connection)";
const GAP_MS = 1500;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function fetchWithUA(url) {
  const res = await fetch(url, {
    headers: { "User-Agent": UA },
    signal: AbortSignal.timeout(15_000),
  });
  if (res.status === 401 || res.status === 403 || res.status === 429) throw new Error(`blocked: HTTP ${res.status}`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res;
}

function extractMeta(html, fallbackName) {
  const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
  const descMatch = html.match(/<meta[^>]*name=["']description["'][^>]*content=["']([^"']+)["']/i) 
                 || html.match(/<meta[^>]*content=["']([^"']+)["'][^>]*name=["']description["']/i);
  return {
    title: titleMatch ? titleMatch[1].trim().substring(0, 100) : fallbackName,
    summary: descMatch ? descMatch[1].trim().substring(0, 150) : "点击查看详细内容",
  };
}

function guessFundingStyle(name) {
  // 尝试猜测类型，默认都是资助
  if (/物资|设备|捐赠/i.test(name)) return { kind: "物资", type: "物资需求", supportType: "物资" };
  if (/政府|民政|采购/i.test(name)) return { kind: "资助", type: "政府购买", supportType: "资金" };
  if (/企业|CSR|腾讯|阿里|蚂蚁|字节/i.test(name)) return { kind: "资助", type: "企业CSR", supportType: "资金" };
  return { kind: "资助", type: "慈善会/基金会资助", supportType: "资金" };
}

async function main() {
  console.log("🚀 开始抓取资助模块的真实数据...\n");
  const sources = JSON.parse(await readFile(SOURCES_FILE, "utf8"));
  const allFundings = [];
  let successCount = 0;

  for (let i = 0; i < sources.length; i++) {
    const src = sources[i];
    console.log(`[${i + 1}/${sources.length}] 正在抓取: ${src.name}`);
    try {
      const res = await fetchWithUA(src.url);
      const html = await res.text();
      const meta = extractMeta(html, src.name);
      const style = guessFundingStyle(src.name);

      // 尝试从摘要中提取金额，比如 "20-80万" 或 "50万元"
      let amount = "面议";
      let amountWan = 0;
      const amountMatch = meta.summary.match(/(\d+[\.,]?\d*)[-–~]?(\d+[\.,]?\d*)?\s*万/);
      if (amountMatch) {
        amount = amountMatch[0];
        amountWan = parseFloat(amountMatch[1]);
      }

      allFundings.push({
        id: `fund-${i + 1}`,
        kind: style.kind,
        type: style.type,
        supportType: style.supportType,
        duration: "6-12个月",
        field: "综合",
        region: "全国",
        title: meta.title,
        summary: meta.summary,
        org: src.name,
        location: "全国",
        amount: amount,
        amountWan: amountWan,
        dueDays: 0,
        due: "长期有效",
        publishedDays: 0,
      });
      successCount++;
      console.log(`   ✅ 成功抓取`);
    } catch (err) {
      console.log(`   ❌ 抓取失败: ${err.message}`);
    }
    if (i < sources.length - 1) await sleep(GAP_MS);
  }

  await writeFile(OUT, JSON.stringify(allFundings, null, 2) + "\n", "utf8");
  console.log(`\n📊 抓取结束！成功: ${successCount} 条`);
  console.log(`✅ 数据已保存到 src/lib/fundings-data.json`);
}

main();