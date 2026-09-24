"use client";

import { useMemo, useState } from "react";
import { jobs as initialJobs, filterGroups, hotJobs, jobStats, type JobItem } from "@/lib/platform-data";
import { FilterRow, SearchInput, EmptyState } from "./platform-ui";
import { PublishDialog } from "./PublishDialog";

const kindTagClass: Record<string, string> = {
  全职: "tag-green",
  兼职: "tag-orange",
  实习: "tag-blue",
};

function cityMatch(pill: string, location: string): boolean {
  if (pill === "全部") return true;
  if (pill === "广州/深圳") return location.includes("广州") || location.includes("深圳");
  return location.includes(pill);
}

const publishFields = [
  { key: "title", label: "岗位名称", placeholder: "如：教育公平项目官员", required: true },
  { key: "org", label: "机构名称", placeholder: "如：美丽中国 Teach For China", required: true },
  { key: "kind", label: "用工类型", type: "select" as const, options: ["全职", "兼职", "实习"] },
  { key: "role", label: "职能", type: "select" as const, options: filterGroups.jobRoles.slice(1) },
  { key: "location", label: "工作地点", placeholder: "如：北京 / 远程办公" },
  { key: "salary", label: "薪资", placeholder: "如：12-18K·13薪" },
  { key: "summary", label: "岗位描述", placeholder: "职责与要求…", type: "textarea" as const, required: true },
];

export function JobsBrowser() {
  const [items, setItems] = useState<JobItem[]>(initialJobs);
  const [role, setRole] = useState("全部");
  const [city, setCity] = useState("全部");
  const [search, setSearch] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);

  const filtered = useMemo(() => {
    const q = search.trim();
    return items
      .filter(
        (j) =>
          (role === "全部" || j.role === role) &&
          cityMatch(city, j.location) &&
          (!q || j.title.includes(q) || j.org.includes(q) || j.summary.includes(q)),
      )
      .sort((a, b) => a.publishedDays - b.publishedDays);
  }, [items, role, city, search]);

  const resetFilters = () => {
    setRole("全部");
    setCity("全部");
    setSearch("");
  };

  const publish = (values: Record<string, string>) => {
    const item: JobItem = {
      id: Date.now(),
      kind: (values.kind as JobItem["kind"]) || "全职",
      role: values.role || "项目官员",
      time: "刚刚发布",
      publishedDays: 0,
      title: `【${values.kind === "实习" ? "实习" : "招聘"}】${values.title} · ${values.org}`,
      summary: values.summary,
      org: values.org,
      location: values.location || "全国",
      salary: values.salary || "面议",
      due: "长期招募",
    };
    setItems((list) => [item, ...list]);
    resetFilters();
  };

  return (
    <div className="module-body">
      <div className="module-main">
        <div className="section-banner">
          <span className="banner-icon">💼</span>
          <div>
            <div className="banner-title">公益行业招聘</div>
            <div className="banner-sub">全职 / 兼职 / 实习岗位 · 需机构入驻审核</div>
          </div>
          <span style={{ flex: 1 }} />
          <button className="btn-primary" type="button" onClick={() => setDialogOpen(true)}>
            ＋ 发布招聘
          </button>
        </div>

        <div className="filter-panel">
          <div className="pc-card filter-box">
            <FilterRow label="职能" options={filterGroups.jobRoles} active={role} onChange={setRole} />
          </div>
          <div className="pc-card filter-box">
            <FilterRow label="地点" options={filterGroups.jobCities} active={city} onChange={setCity}>
              <SearchInput value={search} onChange={setSearch} placeholder="搜索岗位关键词…" />
            </FilterRow>
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
                  <span className="tag tag-pink">{j.role}</span>
                  <span className="spacer" />
                  <span className="card-time">{j.time}</span>
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
                  <a className="card-link" href="#">
                    投递简历 →
                  </a>
                </div>
              </article>
            ))}
          </div>
        )}
      </div>

      <aside className="module-aside">
        <div className="aside-card">
          <h2 className="aside-title">🔥 急招岗位</h2>
          <ol className="hot-list">
            {hotJobs.map((p) => (
              <li key={p.rank}>
                <span className="rank-badge">{p.rank}</span>
                <div>
                  <div className="hot-title">{p.title}</div>
                  <div className="hot-meta">{p.meta}</div>
                </div>
              </li>
            ))}
          </ol>
        </div>

        <div className="aside-card">
          <h2 className="aside-title">📊 招聘数据</h2>
          <div className="stat-rows">
            {jobStats.map((s, i) => (
              <div key={s.label} className="stat-row">
                <span>{s.label}</span>
                <span className={`value sv-${i % 4}`}>{s.value}</span>
              </div>
            ))}
          </div>
        </div>
      </aside>

      <PublishDialog
        open={dialogOpen}
        title="发布招聘岗位"
        fields={publishFields}
        onClose={() => setDialogOpen(false)}
        onSubmit={publish}
      />
    </div>
  );
}
