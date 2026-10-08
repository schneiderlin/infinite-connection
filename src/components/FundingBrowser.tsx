"use client";

import { useMemo, useState } from "react";
import {
  fundings,
  fundingTabs,
  filterGroups,
  urgentFundings,
  fundingStats,
  type FundingItem,
} from "@/lib/platform-data";
import {
  TypeTabs,
  FilterRow,
  SearchInput,
  ListMeta,
  EmptyState,
} from "./platform-ui";

const sorts = [
  { key: "due", label: "截止最近" },
  { key: "amount", label: "金额最高" },
  { key: "new", label: "最新发布" },
];

const tabToKind: Record<string, FundingItem["kind"]> = {
  最新资助: "资助",
  最新需求: "需求",
  物资供需: "物资",
};

function regionMatch(region: string, itemRegion: string): boolean {
  return region === "全部" || itemRegion === "全国" || itemRegion === region;
}

const kindTagClass: Record<string, string> = {
  资助: "tag-green",
  需求: "tag-orange",
  物资: "tag-blue",
};

export function FundingBrowser() {
  const [tab, setTab] = useState("最新资助");
  const [resourceType, setResourceType] = useState("全部");
  const [supportType, setSupportType] = useState("全部");
  const [duration, setDuration] = useState("全部");
  const [field, setField] = useState("全部");
  const [region, setRegion] = useState("全部");
  const [other, setOther] = useState("全部");
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState("due");

  const filtered = useMemo(() => {
    const q = search.trim();
    const selectedKind = other === "只看资助" ? "资助" : other === "只看需求" ? "需求" : tabToKind[tab];
    const showFundingFilters = selectedKind === "资助";
    const list = fundings.filter(
      (f) =>
        f.kind === selectedKind &&
        (!showFundingFilters || resourceType === "全部" || f.type === resourceType) &&
        (!showFundingFilters || supportType === "全部" || f.supportType === supportType) &&
        (!showFundingFilters || duration === "全部" || f.duration === duration) &&
        (field === "全部" || f.field === field) &&
        regionMatch(region, f.region) &&
        (other !== "最新发布（一周内）" || f.publishedDays <= 7) &&
        (!q || f.title.includes(q) || f.org.includes(q) || f.summary.includes(q)),
    );
    const by = {
      due: (a: FundingItem, b: FundingItem) => a.dueDays - b.dueDays,
      amount: (a: FundingItem, b: FundingItem) => b.amountWan - a.amountWan,
      new: (a: FundingItem, b: FundingItem) => a.publishedDays - b.publishedDays,
    }[sort];
    return [...list].sort(by);
  }, [tab, resourceType, supportType, duration, field, region, other, search, sort]);

  const resetFilters = () => {
    setResourceType("全部");
    setSupportType("全部");
    setDuration("全部");
    setField("全部");
    setRegion("全部");
    setOther("全部");
    setSearch("");
  };

  const changeTab = (next: string) => {
    setTab(next);
    resetFilters();
  };

  const changeOther = (next: string) => {
    setOther(next);
    if (next === "只看资助") setTab("最新资助");
    if (next === "只看需求") setTab("最新需求");
  };

  return (
    <div className="module-body">
      <div className="module-main">
        <TypeTabs tabs={fundingTabs} active={tab} onChange={changeTab} />

        <div className="filter-panel">
          {tab === "最新资助" && (
            <>
              <div className="pc-card filter-box">
                <FilterRow
                  label="资源类型"
                  options={filterGroups.fundingResourceTypes}
                  active={resourceType}
                  onChange={setResourceType}
                />
              </div>
              <div className="pc-card filter-box">
                <FilterRow
                  label="资助类型"
                  options={filterGroups.fundingSupportTypes}
                  active={supportType}
                  onChange={setSupportType}
                />
              </div>
              <div className="pc-card filter-box">
                <FilterRow
                  label="资助周期"
                  options={filterGroups.fundingDurations}
                  active={duration}
                  onChange={setDuration}
                />
              </div>
            </>
          )}
          <div className="pc-card filter-box">
            <FilterRow label="领域" options={filterGroups.fundingFields} active={field} onChange={setField} />
          </div>
          <div className="pc-card filter-box">
            <FilterRow label="省份" options={filterGroups.fundingRegions} active={region} onChange={setRegion}>
              <SearchInput value={search} onChange={setSearch} placeholder="搜索资助项目、关键词…" />
            </FilterRow>
          </div>
          <div className="pc-card filter-box">
            <FilterRow
              label="其他分类"
              options={filterGroups.fundingOther}
              active={other}
              onChange={changeOther}
            />
          </div>
        </div>

        <ListMeta
          total={1825}
          unit="条资助征集"
          shown={filtered.length}
          sorts={sorts}
          activeSort={sort}
          onSort={setSort}
        />

        {filtered.length === 0 ? (
          <EmptyState onReset={resetFilters} />
        ) : (
          <div className="card-grid-2">
            {filtered.map((f) => (
              <article key={f.id} className="pc-card content-card">
                <div className="card-head">
                  <span className={`tag ${kindTagClass[f.kind] ?? "tag-green"}`}>{f.type}</span>
                  <span className="tag tag-pink">{f.field}</span>
                  <span className="spacer" />
                  <span className={`tag ${f.dueDays <= 7 ? "tag-red" : "tag-yellow"}`}>
                    ⏱ {f.dueDays}天截止
                  </span>
                </div>
                <h3 className="card-title">{f.title}</h3>
                <p className="card-summary">{f.summary}</p>
                <div className="card-meta">
                  <span className="item">🏛 {f.org}</span>
                  <span className="item">📍 {f.location}</span>
                  <span className="item">💰 {f.amount}</span>
                </div>
                <div className="card-foot">
                  <span className="stat">📅 截止 {f.due}</span>
                  <a className="card-link" href="#">
                    {f.kind === "资助" ? "申报指南 →" : "查看详情 →"}
                  </a>
                </div>
              </article>
            ))}
          </div>
        )}
      </div>

      <aside className="module-aside">
        <div className="urgent-card">
          <h2 className="aside-title">🚨 7天内截止</h2>
          <ul className="urgent-list">
            {urgentFundings.map((u) => (
              <li key={u.title}>
                <span className="u-title">{u.title}</span>
                <span className="u-org">{u.org}</span>
                <span className="u-due">⏰ {u.due}</span>
              </li>
            ))}
          </ul>
          <button className="urgent-more" type="button">
            查看全部紧急 →
          </button>
        </div>

        <div className="aside-card">
          <h2 className="aside-title">📊 资源数据</h2>
          <div className="stat-rows">
            {fundingStats.map((s, i) => (
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
