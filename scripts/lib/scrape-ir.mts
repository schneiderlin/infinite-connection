import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";

export type ScrapedDocumentIR = {
  schemaVersion: 1;
  dataset: string;
  sourceKey: string;
  sourceName: string;
  sourceUrl: string;
  canonicalUrl: string;
  fetchedAt: string;
  title: string;
  organizationHint: string;
  addressHint: string;
  publishedDateHint: string;
  deadlineHint: string;
  bodyText: string;
  contentHash: string;
  modelInputHash: string;
  documentHash: string;
  adapterVersion: number;
};

type ManifestEntry = {
  sourceName: string;
  sourceUrl: string;
  title: string;
  fetchedAt: string;
  modelInputHash: string;
  documentHash: string;
  file: string;
};

type ScrapeIRManifest = {
  schemaVersion: 1;
  dataset: string;
  updatedAt: string;
  records: Record<string, ManifestEntry>;
};

function emptyManifest(dataset: string): ScrapeIRManifest {
  return {
    schemaVersion: 1,
    dataset,
    updatedAt: new Date(0).toISOString(),
    records: {},
  };
}

async function readManifest(root: string, dataset: string): Promise<ScrapeIRManifest> {
  try {
    const manifest = JSON.parse(await readFile(path.join(root, "manifest.json"), "utf8"));
    if (manifest.schemaVersion !== 1 || manifest.dataset !== dataset || !manifest.records) {
      throw new Error(`不支持的 IR manifest：${path.join(root, "manifest.json")}`);
    }
    return manifest as ScrapeIRManifest;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return emptyManifest(dataset);
    throw error;
  }
}

async function writeJsonAtomic(file: string, value: unknown) {
  await mkdir(path.dirname(file), { recursive: true });
  const temporary = `${file}.${process.pid}.tmp`;
  await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  await rename(temporary, file);
}

async function writeVersionIfMissing(file: string, document: ScrapedDocumentIR) {
  try {
    const existing = JSON.parse(await readFile(file, "utf8")) as ScrapedDocumentIR;
    if (existing.documentHash !== document.documentHash) {
      throw new Error(`IR 文件 hash 冲突：${file}`);
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    await writeJsonAtomic(file, document);
  }
}

/**
 * 保存本次成功抓取到的 IR，并只替换成功来源的 current 指针。
 * 历史正文文件按 documentHash 保留；来源抓取失败时原 current 指针不变。
 */
export async function updateCurrentIR(
  root: string,
  dataset: string,
  documents: ScrapedDocumentIR[],
  refreshedSources: Set<string>,
) {
  const manifest = await readManifest(root, dataset);

  for (const [sourceKey, entry] of Object.entries(manifest.records)) {
    if (refreshedSources.has(entry.sourceName)) delete manifest.records[sourceKey];
  }

  for (const document of documents) {
    if (document.dataset !== dataset) {
      throw new Error(`IR dataset 不一致：期望 ${dataset}，收到 ${document.dataset}`);
    }
    const relativeFile = path.join(document.sourceKey, `${document.documentHash}.json`);
    await writeVersionIfMissing(path.join(root, relativeFile), document);
    manifest.records[document.sourceKey] = {
      sourceName: document.sourceName,
      sourceUrl: document.sourceUrl,
      title: document.title,
      fetchedAt: document.fetchedAt,
      modelInputHash: document.modelInputHash,
      documentHash: document.documentHash,
      file: relativeFile.split(path.sep).join("/"),
    };
  }

  manifest.updatedAt = new Date().toISOString();
  manifest.records = Object.fromEntries(
    Object.entries(manifest.records).sort(([left], [right]) => left.localeCompare(right)),
  );
  await writeJsonAtomic(path.join(root, "manifest.json"), manifest);
  return manifest.records;
}

export async function readCurrentIR(root: string, dataset: string): Promise<ScrapedDocumentIR[]> {
  const manifest = await readManifest(root, dataset);
  const documents = await Promise.all(
    Object.entries(manifest.records).map(async ([sourceKey, entry]) => {
      const document = JSON.parse(await readFile(path.join(root, entry.file), "utf8")) as ScrapedDocumentIR;
      if (
        document.schemaVersion !== 1 ||
        document.dataset !== dataset ||
        document.sourceKey !== sourceKey ||
        document.modelInputHash !== entry.modelInputHash ||
        document.documentHash !== entry.documentHash
      ) {
        throw new Error(`IR 与 manifest 不一致：${entry.file}`);
      }
      return document;
    }),
  );
  return documents.sort((left, right) => left.sourceKey.localeCompare(right.sourceKey));
}
