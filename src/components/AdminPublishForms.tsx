"use client";

import { useActionState, useRef, useState } from "react";
import { createAdminContent, type AdminContentState } from "@/lib/actions/admin";
import {
  findHeaderRow,
  IMPORT_ROW_CHUNK,
  jsonToEntries,
  matrixToEntries,
  type ImportEntry,
} from "@/lib/import-records";
import type { PublishModuleSlug } from "@/lib/publishing";
import {
  cityDisplayName,
  composeCity,
  getAreas,
  getCities,
  provinceNames,
} from "@/lib/cn-divisions";

type ModuleOption = {
  slug: PublishModuleSlug;
  label: string;
  subtypes: string[];
};

type ImportFeedback = {
  success?: boolean;
  message?: string;
  error?: string;
  imported?: number;
  failed?: number;
  warnings?: string[];
  errors?: string[];
};

// 浏览器内存里解析，再分块上传；单文件上限只跟浏览器内存有关，几万行也够用。
const IMPORT_FILE_SIZE_LIMIT = 20 * 1024 * 1024;

const initialContentState: AdminContentState = {};

function formatSize(size: number) {
  if (size >= 1024 * 1024) return `${(size / (1024 * 1024)).toFixed(1)}MB`;
  return `${Math.max(1, Math.round(size / 1024))}KB`;
}

async function parseImportFile(file: File): Promise<ImportEntry[]> {
  const fileName = file.name.toLowerCase();

  if (fileName.endsWith(".json")) {
    const text = (await file.text()).replace(/^\uFEFF/, "");
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      throw new Error("JSON 文件格式错误，无法解析");
    }
    return jsonToEntries(parsed);
  }

  if (fileName.endsWith(".xlsx") || fileName.endsWith(".xls") || fileName.endsWith(".csv")) {
    const XLSX = await import("xlsx");
    const buffer = new Uint8Array(await file.arrayBuffer());
    let workbook: import("xlsx").WorkBook;
    try {
      workbook = XLSX.read(buffer, { type: "array", cellDates: false });
    } catch {
      throw new Error("Excel 文件格式错误，无法解析");
    }
    for (const sheetName of workbook.SheetNames) {
      const matrix = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], {
        header: 1,
        defval: "",
        raw: false,
        blankrows: false,
      }) as unknown[][];
      const headerRowIndex = findHeaderRow(matrix);
      if (headerRowIndex === -1) continue;
      return matrixToEntries(matrix, headerRowIndex);
    }
    throw new Error("未找到可导入的数据表：表头需要包含「标题」，以及「正文 / 摘要 / 模块」中的至少一列");
  }

  throw new Error("仅支持 .xlsx、.xls、.csv、.json 文件");
}

export function AdminPublishForms({
  modules,
  fields,
}: {
  modules: ModuleOption[];
  fields: string[];
}) {
  const [moduleSlug, setModuleSlug] = useState<PublishModuleSlug>(
    modules[0]?.slug ?? "updates",
  );
  const activeModule =
    modules.find((item) => item.slug === moduleSlug) ?? modules[0];
  const [subtype, setSubtype] = useState(activeModule?.subtypes[0] ?? "");
  const [selectedRegion, setSelectedRegion] = useState("");
  const [selectedCity, setSelectedCity] = useState("");
  const [selectedDistrict, setSelectedDistrict] = useState("");
  const cityOptions = selectedRegion ? getCities(selectedRegion) : [];
  const areaOptions =
    selectedRegion && selectedCity ? getAreas(selectedRegion, selectedCity) : [];
  const composedCity = selectedCity
    ? composeCity(selectedRegion, selectedCity, selectedDistrict)
    : "";
  const [state, formAction, pending] = useActionState(
    createAdminContent,
    initialContentState,
  );

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [importFile, setImportFile] = useState<{ name: string; size: number } | null>(null);
  const [importing, setImporting] = useState(false);
  const [importProgress, setImportProgress] = useState("");
  const [importState, setImportState] = useState<ImportFeedback>({});

  async function handleImportSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (importing) return;

    const file = fileInputRef.current?.files?.[0] ?? null;
    if (!file) {
      setImportState({ error: "请选择要导入的 Excel / JSON 文件" });
      return;
    }
    if (file.size === 0) {
      setImportState({ error: "文件是空的，请重新选择" });
      return;
    }
    if (file.size > IMPORT_FILE_SIZE_LIMIT) {
      setImportState({
        error: `文件 ${formatSize(file.size)} 超过 ${formatSize(IMPORT_FILE_SIZE_LIMIT)}，请拆分后再上传`,
      });
      return;
    }

    const defaultModule = String(new FormData(event.currentTarget).get("defaultModule") ?? "");
    setImporting(true);
    setImportState({});
    setImportProgress("正在解析文件…");

    try {
      const entries = await parseImportFile(file);
      if (entries.length === 0) {
        setImportState({ error: "文件里没有可导入的数据行" });
        return;
      }

      const errors: string[] = [];
      const warnings: string[] = [];
      let imported = 0;
      let handled = 0;

      for (let index = 0; index < entries.length; index += IMPORT_ROW_CHUNK) {
        const chunk = entries.slice(index, index + IMPORT_ROW_CHUNK);
        setImportProgress(`正在导入 ${handled}/${entries.length} 条…`);
        const response = await fetch("/api/admin/content/import", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ fileName: file.name, defaultModule, entries: chunk }),
        });
        const data = (await response.json().catch(() => ({}))) as ImportFeedback;
        if (!response.ok) {
          setImportState({
            error: data.error ?? `导入失败（${response.status}），请稍后重试`,
            imported,
            failed: errors.length,
            errors: errors.slice(0, 20),
            warnings: warnings.slice(0, 20),
          });
          return;
        }
        imported += data.imported ?? 0;
        if (Array.isArray(data.errors)) errors.push(...data.errors);
        if (Array.isArray(data.warnings)) warnings.push(...data.warnings);
        handled += chunk.length;
      }

      setImportState({
        success: true,
        imported,
        failed: errors.length,
        errors: errors.slice(0, 20),
        warnings: warnings.slice(0, 20),
        message: `已导入并发布 ${imported} 条内容${errors.length > 0 ? `，跳过 ${errors.length} 条` : ""}。`,
      });
      if (fileInputRef.current) fileInputRef.current.value = "";
      setImportFile(null);
    } catch (error) {
      setImportState({ error: error instanceof Error ? error.message : "文件解析失败" });
    } finally {
      setImporting(false);
      setImportProgress("");
    }
  }

  const fieldErrors = state.fieldErrors
    ? Object.values(state.fieldErrors).flat()
    : [];

  function handleModuleChange(nextSlug: PublishModuleSlug) {
    setModuleSlug(nextSlug);
    const nextModule = modules.find((item) => item.slug === nextSlug);
    setSubtype(nextModule?.subtypes[0] ?? "");
  }

  return (
    <div className="admin-publish-grid">
      <section className="pc-card admin-panel">
        <header className="admin-panel-head">
          <div>
            <span className="admin-eyebrow">SINGLE</span>
            <h2>单条发布</h2>
            <p>填写基础信息后直接发布，适合临时公告或运营补录。</p>
          </div>
          <span className="admin-panel-badge">强制 PUBLISHED</span>
        </header>

        <form action={formAction} className="admin-form">
          <div className="admin-form-grid">
            <label className="admin-field">
              <span>
                内容模块 <em>*</em>
              </span>
              <select
                name="moduleSlug"
                value={moduleSlug}
                onChange={(event) =>
                  handleModuleChange(event.target.value as PublishModuleSlug)
                }
              >
                {modules.map((item) => (
                  <option key={item.slug} value={item.slug}>
                    {item.label}
                  </option>
                ))}
              </select>
            </label>

            <label className="admin-field">
              <span>
                内容类型 <em>*</em>
              </span>
              <select
                name="subtype"
                value={subtype}
                onChange={(event) => setSubtype(event.target.value)}
              >
                {(activeModule?.subtypes ?? []).map((item) => (
                  <option key={item} value={item}>
                    {item}
                  </option>
                ))}
              </select>
            </label>

            <label className="admin-field admin-field-wide">
              <span>
                标题 <em>*</em>
              </span>
              <input
                name="title"
                type="text"
                required
                minLength={4}
                maxLength={100}
                placeholder="例如：2026 年乡村儿童阅读支持计划开放申请"
              />
            </label>

            <label className="admin-field admin-field-wide">
              <span>摘要</span>
              <input
                name="summary"
                type="text"
                maxLength={120}
                placeholder="一句话说明内容重点（可选，最多 120 字）"
              />
            </label>

            <label className="admin-field admin-field-wide">
              <span>
                正文 <em>*</em>
              </span>
              <textarea
                name="body"
                rows={10}
                required
                minLength={10}
                maxLength={5000}
                placeholder="填写完整内容，支持换行。发布后将直接展示在前台。"
              />
            </label>

            <div className="admin-location-grid admin-field-wide">
              <label className="admin-field">
                <span>
                  省份 / 地区 <em>*</em>
                </span>
                <select
                  name="region"
                  value={selectedRegion}
                  required
                  onChange={(event) => {
                    setSelectedRegion(event.target.value);
                    setSelectedCity("");
                    setSelectedDistrict("");
                  }}
                >
                  <option value="">请选择省份/地区</option>
                  {provinceNames.map((province) => (
                    <option key={province} value={province}>
                      {province}
                    </option>
                  ))}
                </select>
              </label>

              <label className="admin-field">
                <span>
                  城市 <em>*</em>
                </span>
                <select
                  value={selectedCity}
                  required
                  disabled={!selectedRegion}
                  onChange={(event) => {
                    setSelectedCity(event.target.value);
                    setSelectedDistrict("");
                  }}
                >
                  <option value="">
                    {selectedRegion ? "请选择城市" : "请先选择省份/地区"}
                  </option>
                  {cityOptions.map((item) => (
                    <option key={item} value={item}>
                      {cityDisplayName(selectedRegion, item)}
                    </option>
                  ))}
                </select>
                <input type="hidden" name="city" value={composedCity} />
              </label>

              <label className="admin-field">
                <span>区 / 县</span>
                <select
                  value={selectedDistrict}
                  disabled={!selectedCity}
                  onChange={(event) => setSelectedDistrict(event.target.value)}
                >
                  <option value="">
                    {selectedCity ? "不限 / 请选择" : "请先选择城市"}
                  </option>
                  {areaOptions.map((area) => (
                    <option key={area} value={area}>
                      {area}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <label className="admin-field admin-field-wide">
              <span>标签</span>
              <input
                name="tags"
                type="text"
                maxLength={300}
                placeholder="用逗号分隔，最多 10 个，如：乡村振兴, 阅读"
              />
            </label>
          </div>

          <fieldset className="admin-fieldset">
            <legend>
              公益领域 <small>可多选</small>
            </legend>
            <div className="admin-checkbox-grid">
              {fields.map((field) => (
                <label key={field} className="admin-check">
                  <input type="checkbox" name="fields" value={field} />
                  <span>{field}</span>
                </label>
              ))}
            </div>
          </fieldset>

          {state.error && <p className="admin-feedback error">{state.error}</p>}
          {fieldErrors.length > 0 && (
            <div className="admin-feedback error">
              {fieldErrors.map((error) => (
                <span key={error}>{error}</span>
              ))}
            </div>
          )}
          {state.success && (
            <p className="admin-feedback success">{state.message}</p>
          )}

          <div className="admin-form-foot">
            <span>
              发布后状态：<strong>PUBLISHED</strong>
            </span>
            <button className="btn-primary" type="submit" disabled={pending}>
              {pending ? "发布中…" : "立即发布"}
            </button>
          </div>
        </form>
      </section>

      <section className="pc-card admin-panel">
        <header className="admin-panel-head">
          <div>
            <span className="admin-eyebrow">BATCH</span>
            <h2>批量上传</h2>
            <p>上传 Excel、CSV 或 JSON，逐行校验后分块批量写入，行数不设上限。</p>
          </div>
          <span className="admin-panel-badge">不限行数</span>
        </header>

        <form className="admin-form" onSubmit={handleImportSubmit}>
          <label className="admin-upload">
            <input
              ref={fileInputRef}
              type="file"
              name="file"
              accept=".xlsx,.xls,.csv,.json,application/json,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel"
              onChange={(event) => {
                const file = event.currentTarget.files?.[0];
                setImportFile(file ? { name: file.name, size: file.size } : null);
                setImportState({});
              }}
            />
            <strong>{importFile ? importFile.name : "选择 Excel / CSV / JSON 文件"}</strong>
            <span>
              {importFile
                ? `${formatSize(importFile.size)} · 点击可重新选择`
                : "支持 .xlsx、.xls、.csv、.json，单个文件不超过 20MB"}
            </span>
          </label>

          <label className="admin-field">
            <span>默认模块（表格没有「模块」列时使用）</span>
            <select name="defaultModule" defaultValue="">
              <option value="">按表格中的模块列</option>
              {modules.map((item) => (
                <option key={item.slug} value={item.slug}>
                  {item.label}
                </option>
              ))}
            </select>
          </label>


          <div className="admin-format-hint">
            <strong>推荐列名</strong>
            <p>
              标题、模块、类型、摘要、正文、领域、标签、省份、城市。模块可填
              「项目动态 / 资金与物资 / 人力资源 / 能力工具」或
              updates / funding / jobs / tools；类型需与模块匹配。
            </p>
            <p>
              JSON 可直接上传对象数组，或 <code>{`{ "items": [...] }`}</code>、
              <code>{`{ "data": [...] }`}</code> 形式。表格中的审核状态列会被忽略，
              导入内容统一发布。
            </p>
            <p>
              文件在浏览器里解析后按 {IMPORT_ROW_CHUNK} 条一批上传，几万行也可以一次导完；
              中途失败会显示已导入多少条，不会只留下一个空白的错误页。
            </p>
          </div>

          {importProgress && <p className="admin-feedback">{importProgress}</p>}
          {importState.error && (
            <p className="admin-feedback error">{importState.error}</p>
          )}
          {importState.success && (
            <p className="admin-feedback success">{importState.message}</p>
          )}
          {importState.warnings && importState.warnings.length > 0 && (
            <div className="admin-feedback warning">
              {importState.warnings.map((warning) => (
                <span key={warning}>{warning}</span>
              ))}
            </div>
          )}
          {importState.errors && importState.errors.length > 0 && (
            <div className="admin-feedback error">
              <strong>未导入的行</strong>
              {importState.errors.map((error) => (
                <span key={error}>{error}</span>
              ))}
            </div>
          )}

          <div className="admin-form-foot">
            <span>
              导入后状态：<strong>PUBLISHED</strong>
            </span>
            <button className="btn-primary" type="submit" disabled={importing}>
              {importing ? "导入中…" : "导入并发布"}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}

