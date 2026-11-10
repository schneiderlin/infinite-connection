"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { cityDisplayName, getCities, provinceNames } from "@/lib/cn-divisions";
import { filterGroups } from "@/lib/platform-config";
import type { JobItem } from "@/lib/platform-types";
import { FilterRow, SearchInput, EmptyState } from "./platform-ui";

function dedupeByTitle<T extends { title: string }>(items: T[]): T[] {
  const seen = new Set<string>();
  return items.filter((item) => {
    const title = item.title.trim();
    if (!title) return true;
    if (seen.has(title)) return false;
    seen.add(title);
    return true;
  });
}

const kindTagClass: Record<string, string> = {
  全职: "tag-green",
  兼职: "tag-orange",
  实习: "tag-blue",
  志愿者: "tag-blue",
};

function regionMatch(region: string, location: string): boolean {
  if (region === "全部") return true;
  if (region === "线上") return location.includes("线上") || location.includes("远程");
  return location.includes(region) || location.includes(region.replace(/市$/, ""));
}

function kindMatch(kind: string, jobKind: string): boolean {
  if (kind === "全部") return true;
  if (kind === "志愿服务") return jobKind === "志愿者";
  return jobKind === kind;
}

function createDefaultSubCategorySelection(): Record<string, string[]> {
  return Object.fromEntries(
    Object.entries(filterGroups.jobSubCategories).map(([jobGroup, categories]) => [
      jobGroup,
      [...categories],
    ]),
  );
}

export function JobsBrowser({ jobs }: { jobs: JobItem[] }) {
  const items = useMemo(() => dedupeByTitle(jobs), [jobs]);
  const [kind, setKind] = useState("全部");
  const [region, setRegion] = useState("全部");
  const [search, setSearch] = useState("");
  const [selectedProvince, setSelectedProvince] = useState("");
  const [regionPickerOpen, setRegionPickerOpen] = useState(false);
  const [regionMenuOpen, setRegionMenuOpen] = useState<"province" | "city" | null>(null);
  const [moreFilterMenuOpen, setMoreFilterMenuOpen] = useState<"education" | "orgType" | "recency" | null>(null);
  // 新版岗位分类筛选（2026-11 标准）
  const [group, setGroup] = useState("全部");
  const [jobCategoryMenuOpen, setJobCategoryMenuOpen] = useState(false);
  const [selectedSubCategories, setSelectedSubCategories] = useState<Record<string, string[]>>(
    createDefaultSubCategorySelection,
  );
  const [level, setLevel] = useState("全部");
  const [education, setEducation] = useState("全部");
  const [orgType, setOrgType] = useState("全部");
  const [recency, setRecency] = useState("全部");
  const scrapedJobStats = [
    { label: "当前收录岗位", value: String(items.length) },
    {
      label: "30天内新增",
      value: String(items.filter((job) => job.publishedDays <= 30).length),
    },
    { label: "收录机构", value: String(new Set(items.map((job) => job.org)).size) },
    {
      label: "线上/远程岗位",
      value: String(
        items.filter(
          (job) => job.location.includes("远程") || job.location.includes("线上"),
        ).length,
      ),
    },
  ];
  const latestJobs = [...items]
    .sort((a, b) => a.publishedDays - b.publishedDays)
    .slice(0, 3);

  const recencyMatch = (days: number) =>
    recency === "全部" ||
    (recency === "一周内" && days <= 7) ||
    (recency === "一月内" && days <= 30) ||
    (recency === "三月内" && days <= 90) ||
    (recency === "超三月" && days > 90);

  const q = search.trim();
  const activeSubCategories = group === "全部" ? [] : selectedSubCategories[group] ?? [];
  const allSubCategoriesSelected = group !== "全部" &&
    activeSubCategories.length === filterGroups.jobSubCategories[group]?.length;
  const filtered = items
    .filter(
      (job) =>
        kindMatch(kind, job.kind) &&
        (group === "全部" || (
          job.jobGroup === group &&
          (allSubCategoriesSelected || (
            job.subCategory !== undefined && activeSubCategories.includes(job.subCategory)
          ))
        )) &&
        (level === "全部" || job.level === level) &&
        (education === "全部" || job.education === education) &&
        (orgType === "全部" || job.orgType === orgType) &&
        recencyMatch(job.publishedDays) &&
        regionMatch(region, job.location) &&
        (!q || job.title.includes(q) || job.org.includes(q) || job.summary.includes(q)),
    )
    .sort((a, b) => a.publishedDays - b.publishedDays);

  const resetFilters = () => {
    setKind("全部");
    setRegion("全部");
    setSearch("");
    setSelectedProvince("");
    setRegionPickerOpen(false);
    setRegionMenuOpen(null);
    setMoreFilterMenuOpen(null);
    setGroup("全部");
    setJobCategoryMenuOpen(false);
    setSelectedSubCategories(createDefaultSubCategorySelection());
    setLevel("全部");
    setEducation("全部");
    setOrgType("全部");
    setRecency("全部");
  };

  const quickRegions = filterGroups.jobRegions.filter((option) => option !== "其他");
  const customRegionSelected = region !== "全部" && !quickRegions.includes(region);
  const cityOptions = selectedProvince ? getCities(selectedProvince) : [];
  const moreFilterItems = [
    { key: "education" as const, label: "学历", value: education, options: filterGroups.jobEducations, onChange: setEducation },
    { key: "orgType" as const, label: "机构性质", value: orgType, options: filterGroups.jobOrgTypes, onChange: setOrgType },
    { key: "recency" as const, label: "发布时效", value: recency, options: filterGroups.jobRecency, onChange: setRecency },
  ];

  return (
    <div className="module-body">
      <div className="module-main">
        <div className="section-banner">
          <span className="banner-icon">💼</span>
          <div>
            <div className="banner-title">公益行业招聘</div>
            <div className="banner-sub">全职 / 兼职 / 实习岗位</div>
          </div>
          <span style={{ flex: 1 }} />
          <Link className="btn-primary" href="/publish/jobs">
            ＋ 发布招聘
          </Link>
        </div>

        <div className="jobs-search-bar">
          <SearchInput value={search} onChange={setSearch} placeholder="搜索岗位关键词…" />
        </div>

        <div className="filter-panel">
          <div className="pc-card filter-box jobs-filter-box">
            <FilterRow label="工作性质" options={filterGroups.jobKinds} active={kind} onChange={setKind} />
            <FilterRow
              label="城市"
              options={quickRegions}
              active={region}
              onChange={(nextRegion) => {
                setRegion(nextRegion);
                setRegionPickerOpen(false);
                setRegionMenuOpen(null);
              }}
            >
              <button
                type="button"
                className={`pill${regionPickerOpen || customRegionSelected ? " active" : ""}`}
                aria-expanded={regionPickerOpen}
                aria-controls="jobs-region-picker"
                onClick={() => {
                  setRegionPickerOpen((open) => !open);
                  setRegionMenuOpen(null);
                }}
              >
                其他
              </button>
            </FilterRow>
            {regionPickerOpen && (
              <div id="jobs-region-picker" className="jobs-region-picker">
                <div className="jobs-region-field">
                  <span>省份 / 地区</span>
                  <button
                    type="button"
                    className="jobs-region-trigger"
                    aria-expanded={regionMenuOpen === "province"}
                    aria-controls="jobs-province-menu"
                    onClick={() => setRegionMenuOpen((open) => open === "province" ? null : "province")}
                  >
                    <span className={selectedProvince ? "" : "placeholder"}>
                      {selectedProvince || "请选择省份 / 地区"}
                    </span>
                    <b aria-hidden="true">⌄</b>
                  </button>
                  {regionMenuOpen === "province" && (
                    <div id="jobs-province-menu" className="jobs-region-menu" role="listbox">
                      {provinceNames.map((province) => (
                        <button
                          key={province}
                          type="button"
                          role="option"
                          aria-selected={selectedProvince === province}
                          className={selectedProvince === province ? "selected" : ""}
                          onClick={() => {
                            setSelectedProvince(province);
                            setRegion(province);
                            setRegionMenuOpen(null);
                          }}
                        >
                          {province}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                <div className="jobs-region-field">
                  <span>城市</span>
                  <button
                    type="button"
                    className="jobs-region-trigger"
                    disabled={!selectedProvince}
                    aria-expanded={regionMenuOpen === "city"}
                    aria-controls="jobs-city-menu"
                    onClick={() => setRegionMenuOpen((open) => open === "city" ? null : "city")}
                  >
                    <span className={selectedProvince ? "" : "placeholder"}>
                      {selectedProvince && cityOptions.includes(region)
                        ? cityDisplayName(selectedProvince, region)
                        : selectedProvince ? "全部城市" : "请先选择省份 / 地区"}
                    </span>
                    <b aria-hidden="true">⌄</b>
                  </button>
                  {regionMenuOpen === "city" && (
                    <div id="jobs-city-menu" className="jobs-region-menu" role="listbox">
                      <button
                        type="button"
                        role="option"
                        aria-selected={region === selectedProvince}
                        className={region === selectedProvince ? "selected" : ""}
                        onClick={() => {
                          setRegion(selectedProvince);
                          setRegionMenuOpen(null);
                        }}
                      >
                        全部城市
                      </button>
                      {cityOptions.map((city) => (
                        <button
                          key={city}
                          type="button"
                          role="option"
                          aria-selected={region === city}
                          className={region === city ? "selected" : ""}
                          onClick={() => {
                            setRegion(city);
                            setRegionMenuOpen(null);
                          }}
                        >
                          {cityDisplayName(selectedProvince, city)}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}
            <FilterRow
              label="职业分类"
              options={filterGroups.jobGroups}
              active={group}
              onChange={(nextGroup) => {
                if (nextGroup === "全部") {
                  setGroup(nextGroup);
                  setJobCategoryMenuOpen(false);
                  return;
                }

                if (nextGroup === group) {
                  setJobCategoryMenuOpen((open) => !open);
                  return;
                }

                setGroup(nextGroup);
                setJobCategoryMenuOpen(true);
              }}
            />
            {group !== "全部" && jobCategoryMenuOpen && filterGroups.jobSubCategories[group] && (
              <fieldset className="jobs-category-menu">
                <legend>{group} · 二级分类</legend>
                <label className="jobs-category-option jobs-category-select-all">
                  <input
                    type="checkbox"
                    checked={allSubCategoriesSelected}
                    aria-checked={
                      activeSubCategories.length > 0 && !allSubCategoriesSelected
                        ? "mixed"
                        : allSubCategoriesSelected
                    }
                    onChange={(event) => {
                      setSelectedSubCategories((current) => ({
                        ...current,
                        [group]: event.target.checked ? [...filterGroups.jobSubCategories[group]] : [],
                      }));
                    }}
                  />
                  <span>全部</span>
                  <small>{activeSubCategories.length}/{filterGroups.jobSubCategories[group].length} 已选</small>
                </label>
                {filterGroups.jobSubCategories[group].map((category) => (
                  <label key={category} className="jobs-category-option">
                    <input
                      type="checkbox"
                      checked={activeSubCategories.includes(category)}
                      onChange={(event) => {
                        setSelectedSubCategories((current) => ({
                          ...current,
                          [group]: event.target.checked
                            ? [...(current[group] ?? []), category]
                            : (current[group] ?? []).filter((selected) => selected !== category),
                        }));
                      }}
                    />
                    <span>{category}</span>
                  </label>
                ))}
              </fieldset>
            )}
            <FilterRow label="经验/职级" options={filterGroups.jobLevels} active={level} onChange={setLevel} />
            <div className="filter-row">
              <span className="filter-label">其他</span>
              <div id="jobs-more-filters" className="jobs-more-filters">
                {moreFilterItems.map((item) => (
                  <div key={item.key} className="jobs-more-filter">
                    <button
                      type="button"
                      className={`jobs-more-category${item.value !== "全部" ? " selected" : ""}`}
                      aria-expanded={moreFilterMenuOpen === item.key}
                      aria-controls={`jobs-more-${item.key}-menu`}
                      onClick={() => setMoreFilterMenuOpen((open) => open === item.key ? null : item.key)}
                    >
                      {item.label}
                      {item.value !== "全部" && <span aria-label={`当前选择：${item.value}`}>●</span>}
                      <b aria-hidden="true">⌄</b>
                    </button>
                    {moreFilterMenuOpen === item.key && (
                      <div
                        id={`jobs-more-${item.key}-menu`}
                        className="jobs-more-menu"
                        role="listbox"
                        aria-label={item.label}
                      >
                        {item.options.map((option) => (
                          <button
                            key={option}
                            type="button"
                            role="option"
                            aria-selected={item.value === option}
                            className={item.value === option ? "selected" : ""}
                            onClick={() => {
                              item.onChange(option);
                              setMoreFilterMenuOpen(null);
                            }}
                          >
                            {option}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {filtered.length === 0 ? (
          <EmptyState onReset={resetFilters} />
        ) : (
          <div className="card-grid-2">
            {filtered.map((j) => (
              <article key={j.id} className="pc-card content-card">
                <div className="card-head">
                  <span className={`tag ${kindTagClass[j.kind] ?? "tag-green"}`}>{j.kind}</span>
                  {j.subCategory && <span className="tag tag-pink">{j.subCategory}</span>}
                  {j.level && <span className="tag tag-blue">{j.level}</span>}
                </div>
                <h3 className="card-title">{j.title}</h3>
                <p className="card-summary">{j.summary}</p>
                <div className="card-meta">
                  <span className="item">🏛 {j.org}</span>
                  <span className="item">📍 {j.location}</span>
                  <span className="item">💼 {j.salary}</span>
                </div>
                <div className="card-foot">
                  <span className="stat">📅 {j.due}</span>
                  {j.url ? (
                    <a className="card-link" href={j.url} target="_blank" rel="noreferrer">
                      去原站投递 →
                    </a>
                  ) : (
                    <a className="card-link" href="#">
                      投递简历 →
                    </a>
                  )}
                </div>
              </article>
            ))}
          </div>
        )}
      </div>

      <aside className="module-aside">
        <div className="aside-card">
          <h2 className="aside-title">🆕 最新发布</h2>
          <ul className="urgent-list">
            {latestJobs.map((job) => (
              <li key={job.id}>
                {job.url ? (
                  <a className="u-title" href={job.url} target="_blank" rel="noreferrer">
                    {job.title}
                  </a>
                ) : (
                  <span className="u-title">{job.title}</span>
                )}
                <span className="u-org">
                  {job.org} · {job.location}
                </span>
                <span className="u-due">
                  {job.publishedDays === 0 ? "今天发布" : `${job.publishedDays}天前发布`}
                </span>
              </li>
            ))}
          </ul>
        </div>

        <div className="aside-card">
          <h2 className="aside-title">📊 招聘数据</h2>
          <div className="stat-rows">
            {scrapedJobStats.map((s, i) => (
              <div key={s.label} className="stat-row">
                <span>{s.label}</span>
                <span className={`value sv-${i % 4}`}>{s.value}</span>
              </div>
            ))}
          </div>
        </div>
      </aside>

    </div>
  );
}
