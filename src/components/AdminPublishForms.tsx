"use client";

import { useActionState, useState } from "react";
import {
  bulkImportContent,
  createAdminContent,
  type AdminContentState,
  type AdminImportState,
} from "@/lib/actions/admin";
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

const initialContentState: AdminContentState = {};
const initialImportState: AdminImportState = {};

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
  const [importState, importAction, importing] = useActionState(
    bulkImportContent,
    initialImportState,
  );

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
            <p>上传 Excel 或 JSON，逐行校验后使用 createMany 一次性写入。</p>
          </div>
          <span className="admin-panel-badge">最多 500 行</span>
        </header>

        <form action={importAction} className="admin-form">
          <label className="admin-upload">
            <input
              type="file"
              name="file"
              accept=".xlsx,.xls,.json,application/json,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel"
              required
            />
            <strong>选择 Excel / JSON 文件</strong>
            <span>支持 .xlsx、.xls、.json，单个文件不超过 8MB</span>
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
          </div>

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

