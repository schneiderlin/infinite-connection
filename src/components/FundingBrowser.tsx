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

function amountMatch(range: string, wan: number): boolean {
  switch (range) {
    case "10万以下":
      return wan < 10;
    case "10-50万":
      return wan >= 10 && wan <= 50;
    case "50-200万":
      return wan > 50 && wan <= 200;
    case "200万以上":
      return wan > 200;
    default:
      return true;
  }
}

const kindTagClass: Record<string, string> = {
  资助: "tag-green",
  需求: "tag-orange",
  物资: "tag-blue",
};

export function FundingBrowser() {
  const [tab, setTab] = useState("最新资助");
  const [type, setType] = useState("全部类型");
  const [field, setField] = useState("全部");
  const [amount, setAmount] = useState("不限");
  const [region, setRegion] = useState("全部");
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState("due");

  const filtered = useMemo(() => {
    const q = search.trim();
    const list = fundings.filter(
      (f) =>
        f.kind === tabToKind[tab] &&
        (type === "全部类型" || f.type === type) &&
        (field === "全部" || f.field === field) &&
        amountMatch(amount, f.amountWan) &&
        (region === "全部" || f.region === region || f.region === "全国") &&
        (!q || f.title.includes(q) || f.org.includes(q) || f.summary.includes(q)),
    );
    const by = {
      due: (a: FundingItem, b: FundingItem) => a.dueDays - b.dueDays,
      amount: (a: FundingItem, b: FundingItem) => b.amountWan - a.amountWan,
      new: (a: FundingItem, b: FundingItem) => a.publishedDays - b.publishedDays,
    }[sort];
    return [...list].sort(by);
  }, [tab, type, field, amount, region, search, sort]);

  const resetFilters = () => {
    setType("全部类型");
    setField("全部");
    setAmount("不限");
    setRegion("全部");
    setSearch("");
  };

  return (
    <div className="module-body">
      <div className="module-main">
        <TypeTabs tabs={fundingTabs} active={tab} onChange={setTab} />

        <div className="filter-panel">
          {tab === "最新资助" && (
            <div className="pc-card filter-box">
              <FilterRow label="类型" options={filterGroups.fundingTypes} active={type} onChange={setType} />
            </div>
          )}
          <div className="pc-card filter-box">
            <FilterRow label="领域" options={filterGroups.fundingFields} active={field} onChange={setField} />
          </div>
          <div className="pc-card filter-box">
            <FilterRow label="金额" options={filterGroups.amounts} active={amount} onChange={setAmount} />
          </div>
          <div className="pc-card filter-box">
            <FilterRow label="地域" options={filterGroups.fundingRegions} active={region} onChange={setRegion}>
              <SearchInput value={search} onChange={setSearch} placeholder="搜索资助项目、关键词…" />
            </FilterRow>
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
