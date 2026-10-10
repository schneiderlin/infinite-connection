import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as XLSX from "xlsx";

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const REF_DIR = path.join(ROOT, "docs", "references");
const OUT_DIR = path.join(ROOT, "scripts", "sources");

const EXCEL_CONFIGS = [
  { file: "公益行业招聘网站信息库_精简.xlsx", output: "jobs_sources.json" },
  { file: "公益行业资助信息网站库_副本.xlsx", output: "fundings_sources.json" },
  { file: "公益行业知识资源网站库_副本.xlsx", output: "tools_sources.json" }
];

function findColumn(headers, keywords) {
  for (const keyword of keywords) {
    const found = headers.find(h => h && String(h).includes(keyword));
    if (found) return found;
  }
  return null;
}

async function parseExcel() {
  await mkdir(OUT_DIR, { recursive: true });

  for (const config of EXCEL_CONFIGS) {
    const filePath = path.join(REF_DIR, config.file);
    console.log(`\n📊 正在解析: ${config.file} ...`);

    try {
      const fileBuffer = await readFile(filePath);
      const workbook = XLSX.read(fileBuffer, { type: "buffer" });
      const sheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[sheetName];

      const rows = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: "" });
      if (rows.length < 2) {
        console.log(`   ⚠️ 表格为空，跳过。`);
        continue;
      }

      // 👇 调试：打印前 5 行的前 5 列，看看脚本到底读到了什么
      console.log("   🔍 前 5 行内容预览：");
      for (let i = 0; i < Math.min(5, rows.length); i++) {
        const preview = rows[i].slice(0, 5).map(c => String(c).substring(0, 40)).join(" | ");
        console.log(`      第 ${i + 1} 行: ${preview}`);
      }

      // 找表头：优先找包含"序号"的行（最稳的锚点）
      let headerRowIndex = -1;
      for (let i = 0; i < Math.min(rows.length, 10); i++) {
        const rowText = rows[i].join(" ");
        if (/序号/.test(rowText)) {
          headerRowIndex = i;
          break;
        }
      }
      
      // 备选：找同时包含"网址链接"和"名称/机构/平台"的行
      if (headerRowIndex === -1) {
        for (let i = 0; i < Math.min(rows.length, 10); i++) {
          const rowText = rows[i].join(" ");
          if (/(网址链接|官网入口链接)/i.test(rowText) && /(名称|机构|平台)/.test(rowText)) {
            headerRowIndex = i;
            break;
          }
        }
      }
      
      if (headerRowIndex === -1) {
        console.log(`   ❌ 在前 10 行内未找到表头行`);
        continue;
      }
      
      console.log(`   🔍 检测到表头在第 ${headerRowIndex + 1} 行`);

      const jsonData = XLSX.utils.sheet_to_json(worksheet, { range: headerRowIndex });
      if (jsonData.length === 0) {
        console.log(`   ⚠️ 表头行下方无数据，跳过。`);
        continue;
      }

      const headers = Object.keys(jsonData[0]);
      console.log(`   📋 检测到的列名: ${headers.join(" | ")}`);
      
      const nameCol = findColumn(headers, ["网站/平台名称", "网站名称", "平台名称", "机构", "名称"]);
      const urlCol = findColumn(headers, ["网址链接", "官网入口链接", "网址", "URL", "链接", "url"]);
      const categoryCol = findColumn(headers, ["类别", "分类", "类型"]); // 👈 新增：查找类别列
      
      console.log(`   📌 名称列: [${nameCol}]`);
      console.log(`   📌 网址列: [${urlCol}]`);

      if (!urlCol) {
        console.log(`   ❌ 找不到网址列`);
        continue;
      }

      const sources = [];
      for (const row of jsonData) {
        let url = row[urlCol] ? String(row[urlCol]).trim() : "";
        const name = nameCol && row[nameCol] ? String(row[nameCol]).trim() : "未知来源";

        const category = categoryCol && row[categoryCol] ? String(row[categoryCol]).trim() : "综合";
        
        // 处理多个 URL 的情况（有些格子有换行）
        url = url.split(/[\s\n]+/)[0];

        if (url && !url.startsWith("http")) {
          if (url.includes(".")) {
            url = "https://" + url;
          }
        }

        if (!url || !url.includes(".")) continue;
        sources.push({ name, url, category});
      }

      const outputPath = path.join(OUT_DIR, config.output);
      await writeFile(outputPath, JSON.stringify(sources, null, 2) + "\n", "utf8");
      console.log(`   ✅ 提取了 ${sources.length} 个目标网站，已保存到: scripts/sources/${config.output}`);

    } catch (err) {
      console.log(`   ❌ 解析失败: ${err.message}`);
    }
  }
}

async function main() {
  console.log("🚀 开始从 Excel 提取网站清单...");
  await parseExcel();
  console.log("\n🎉 全部提取完成！");
}

main();