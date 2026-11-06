"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { filterGroups } from "@/lib/platform-config";
import type { JobItem } from "@/lib/platform-types";
import { TypeTabs, FilterRow, SearchInput, EmptyState } from "./platform-ui";

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

type JobCategory = NonNullable<JobItem["category"]>;

const jobTabs = [{ label: "人员招聘" }, { label: "志愿者招募" }];

const kindTagClass: Record<string, string> = {
  全职: "tag-green",
  兼职: "tag-orange",
  实习: "tag-blue",
  志愿者: "tag-blue",
};

function jobCategory(job: JobItem): JobCategory {
  return job.category ?? (job.kind === "志愿者" ? "志愿者招募" : "人员招聘");
}

function regionMatch(region: string, location: string): boolean {
  if (region === "全部") return true;
  if (region === "线上") return location.includes("线上") || location.includes("远程");
  if (region === "其他") return !/北京|上海|广州|深圳|成都|苏州|杭州|武汉|西安|重庆|厦门|南京|线上|远程/.test(location);
  return location.includes(region) || location.includes(region.replace(/市$/, ""));
}

// 志愿者招募 tab 沿用旧的地域匹配
function regionMatchVolunteer(region: string, location: string): boolean {
  if (region === "全部" || region === "全国") return true;
  if (region === "线上") return location.includes("线上") || location.includes("远程");
  const shortRegion = region.replace(/特别行政区|维吾尔自治区|壮族自治区|回族自治区|自治区|省|市$/, "");
  return location.includes(region) || location.includes(shortRegion);
}

export function JobsBrowser({ jobs }: { jobs: JobItem[] }) {
  const items = useMemo(() => dedupeByTitle(jobs), [jobs]);
  const [category, setCategory] = useState<JobCategory>("人员招聘");
  const [kind, setKind] = useState("全部");
  const [role, setRole] = useState("全部");
  const [servicePeriod, setServicePeriod] = useState("全部");
  const [region, setRegion] = useState("全部");
  const [search, setSearch] = useState("");
  // 新版岗位分类筛选（2026-11 标准）
  const [group, setGroup] = useState("全部");
  const [subCategory, setSubCategory] = useState("全部");
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
  const filtered = items
    .filter(
      (job) =>
        jobCategory(job) === category &&
        (category !== "人员招聘" || kind === "全部" || job.kind === kind) &&
        (category !== "人员招聘" || group === "全部" || job.jobGroup === group) &&
        (category !== "人员招聘" || subCategory === "全部" || job.subCategory === subCategory) &&
        (category !== "人员招聘" || level === "全部" || job.level === level) &&
        (category !== "人员招聘" || education === "全部" || job.education === education) &&
        (category !== "人员招聘" || orgType === "全部" || job.orgType === orgType) &&
        (category !== "人员招聘" || recencyMatch(job.publishedDays)) &&
        (category !== "人员招聘" || role === "全部" || job.role === role) &&
        (category !== "志愿者招募" || servicePeriod === "全部" || job.servicePeriod === servicePeriod) &&
        (category !== "人员招聘" || regionMatch(region, job.location)) &&
        (category !== "志愿者招募" || regionMatchVolunteer(region, job.location)) &&
        (!q || job.title.includes(q) || job.org.includes(q) || job.summary.includes(q)),
    )
    .sort((a, b) => a.publishedDays - b.publishedDays);

  const resetFilters = (nextCategory = category) => {
    setKind("全部");
    setRole("全部");
    setServicePeriod("全部");
    setRegion("全部");
    setSearch("");
    setGroup("全部");
    setSubCategory("全部");
    setLevel("全部");
    setEducation("全部");
    setOrgType("全部");
    setRecency("全部");
  };

  const changeCategory = (next: string) => {
    const nextCategory = next as JobCategory;
    setCategory(nextCategory);
    resetFilters(nextCategory);
  };

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

        <TypeTabs tabs={jobTabs} active={category} onChange={changeCategory} />

        <div className="filter-panel">
          {category === "人员招聘" ? (
            <>
              <div className="pc-card filter-box">
                <FilterRow label="工作性质" options={filterGroups.jobKinds} active={kind} onChange={setKind} />
                <FilterRow label="城市" options={filterGroups.jobRegions} active={region} onChange={setRegion} />
                <FilterRow
                  label="职业分类"
                  options={filterGroups.jobGroups}
                  active={group}
                  onChange={(g) => {
                    setGroup(g);
                    setSubCategory("全部");
                  }}
                />
                {group !== "全部" && filterGroups.jobSubCategories[group] && (
                  <FilterRow
                    label="└ 子类"
                    options={["全部", ...filterGroups.jobSubCategories[group]]}
                    active={subCategory}
                    onChange={setSubCategory}
                  />
                )}
                <FilterRow label="经验/职级" options={filterGroups.jobLevels} active={level} onChange={setLevel} />
                <FilterRow label="学历" options={filterGroups.jobEducations} active={education} onChange={setEducation} />
                <FilterRow label="机构性质" options={filterGroups.jobOrgTypes} active={orgType} onChange={setOrgType} />
                <FilterRow label="发布时效" options={filterGroups.jobRecency} active={recency} onChange={setRecency}>
                  <SearchInput value={search} onChange={setSearch} placeholder="搜索岗位关键词…" />
                </FilterRow>
              </div>
            </>
          ) : (
            <>
              <div className="pc-card filter-box">
                <FilterRow
                  label="服务周期"
                  options={filterGroups.volunteerPeriods}
                  active={servicePeriod}
                  onChange={setServicePeriod}
                />
              </div>
              <div className="pc-card filter-box">
                <FilterRow
                  label="服务领域"
                  options={filterGroups.volunteerFields}
                  active={role}
                  onChange={setRole}
                />
              </div>
              <div className="pc-card filter-box">
                <FilterRow
                  label="地域"
                  options={filterGroups.volunteerRegions}
                  active={region}
                  onChange={setRegion}
                >
                  <SearchInput value={search} onChange={setSearch} placeholder="搜索志愿服务关键词…" />
                </FilterRow>
              </div>
            </>
          )}
        </div>

        {filtered.length === 0 ? (
          <EmptyState onReset={() => resetFilters()} />
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
