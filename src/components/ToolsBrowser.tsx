"use client";

import { useMemo, useState } from "react";
import { tools, toolTabs, filterGroups, type ToolItem } from "@/lib/platform-data";
import {
  TypeTabs,
  FilterRow,
  SearchInput,
  ListMeta,
  EmptyState,
} from "./platform-ui";

const sorts = [
  { key: "new", label: "最新发布" },
  { key: "downloads", label: "下载最多" },
  { key: "rating", label: "评分最高" },
];

// 各子栏目按文档使用不同的分类标签；未单独列出的子栏目参考「培训课程」设置。
const defaultFilters = {
  fields: filterGroups.toolFields,
  forms: filterGroups.toolForms,
  showDuration: false,
};
const tabFilters: Record<string, { fields: string[]; forms: string[]; showDuration: boolean }> = {
  培训课程: { ...defaultFilters, showDuration: true },
  行业沙龙会议: {
    fields: filterGroups.toolSalonFields,
    forms: filterGroups.toolSalonForms,
    showDuration: false,
  },
};

export function ToolsBrowser() {
  const [tab, setTab] = useState("全部");
  const [field, setField] = useState("全部");
  const [form, setForm] = useState("全部");
  const [duration, setDuration] = useState("全部");
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState("new");
  const [favs, setFavs] = useState<Set<number>>(new Set());
  const [downloaded, setDownloaded] = useState<Set<number>>(new Set());

  const filters = tabFilters[tab] ?? defaultFilters;

  const filtered = useMemo(() => {
    const q = search.trim();
    const list = tools.filter(
      (t) =>
        (tab === "全部" || t.category === tab) &&
        (field === "全部" || t.field === field) &&
        (form === "全部" || t.forms.includes(form as ToolItem["forms"][number])) &&
        (duration === "全部" || t.duration === duration) &&
        (!q || t.title.includes(q) || t.summary.includes(q)),
    );
    const by = {
      new: (a: ToolItem, b: ToolItem) => a.publishedDays - b.publishedDays,
      downloads: (a: ToolItem, b: ToolItem) => b.downloads - a.downloads,
      rating: (a: ToolItem, b: ToolItem) => b.rating - a.rating,
    }[sort];
    return [...list].sort(by);
  }, [tab, field, form, duration, search, sort]);

  const toggle = (set: Set<number>, setSet: (s: Set<number>) => void, id: number) => {
    const next = new Set(set);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSet(next);
  };

  const resetFilters = () => {
    setTab("全部");
    setField("全部");
    setForm("全部");
    setDuration("全部");
    setSearch("");
  };

  const changeTab = (next: string) => {
    setTab(next);
    // 切换子栏目时重置筛选，避免不同栏目的标签体系互相干扰
    setField("全部");
    setForm("全部");
    setDuration("全部");
  };

  return (
    <div className="module-body full">
      <div className="module-main">
        <TypeTabs tabs={toolTabs} active={tab} onChange={changeTab} />

        <div className="filter-panel">
          <div className="pc-card filter-box">
            <FilterRow label="领域" options={filters.fields} active={field} onChange={setField} />
          </div>
          <div className="pc-card filter-box">
            <FilterRow label="形式" options={filters.forms} active={form} onChange={setForm}>
              <SearchInput value={search} onChange={setSearch} placeholder="搜索工具、文章、报告…" />
            </FilterRow>
          </div>
          {filters.showDuration && (
            <div className="pc-card filter-box">
              <FilterRow
                label="学习周期"
                options={filterGroups.toolDurations}
                active={duration}
                onChange={setDuration}
              />
            </div>
          )}
        </div>

        <ListMeta
          total={3256}
          unit="件能力工具"
          shown={filtered.length}
          sorts={sorts}
          activeSort={sort}
          onSort={setSort}
        />

        {filtered.length === 0 ? (
          <EmptyState onReset={resetFilters} />
        ) : (
          <div className="card-grid-3">
            {filtered.map((t) => (
              <article key={t.id} className="pc-card tool-card">
                <div className={`tool-cover cover-${t.tone}`}>
                  <span aria-hidden="true">{t.icon}</span>
                </div>
                <div className="tool-body">
                  <div className="card-head">
                    <span className="tag tag-green">{t.category}</span>
                    <span className={`tag ${t.priceTag === "免费" ? "tag-green" : "tag-pink"}`}>
                      {t.priceTag === "免费" ? "🆓 免费" : `💴 ${t.priceTag}`}
                    </span>
                  </div>
                  <h3 className="card-title">{t.title}</h3>
                  <div className="tool-meta">{t.meta}</div>
                  <p className="card-summary">{t.summary}</p>
                  <div className="tool-foot">
                    <button
                      className={`tool-action${t.price ? "" : " outline"}`}
                      type="button"
                      onClick={() => toggle(downloaded, setDownloaded, t.id)}
                    >
                      {downloaded.has(t.id) && t.action.includes("下载") ? "✓ 已下载" : t.action}
                    </button>
                    {t.price ? (
                      <span className="tool-extra">{t.price}</span>
                    ) : (
                      <button
                        type="button"
                        className={`tool-fav${favs.has(t.id) ? " active" : ""}`}
                        onClick={() => toggle(favs, setFavs, t.id)}
                      >
                        {favs.has(t.id) ? "★ 已收藏" : "⭐ 收藏"}
                      </button>
                    )}
                  </div>
                </div>
              </article>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
