
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
const url = "https://www.cfforum.org.cn/Uploads/file/20260212/698d8a8e01d2e.pdf";
const res = await fetch(url, { headers: { "User-Agent": "InfiniteConnectionPreview/0.1" } });
const buf = new Uint8Array(await res.arrayBuffer());
console.log("downloaded", buf.length);
const doc = await getDocument({ data: buf }).promise;
console.log("pages:", doc.numPages);
let text = "";
for (let p = 1; p <= Math.min(5, doc.numPages); p += 1) {
  const page = await doc.getPage(p);
  const content = await page.getTextContent();
  text += content.items.map((i) => i.str).join(" ") + "\n";
}
console.log("TEXT_LEN", text.length);
console.log(text.slice(0, 500));
