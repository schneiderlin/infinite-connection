"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { filterGroups } from "@/lib/platform-config";
import type { FundingItem } from "@/lib/platform-types";
import {
  TypeTabs,
  FilterRow,
  SearchInput,
  ListMeta,
  EmptyState,
} from "./platform-ui";

// 截止天数按 Asia/Shanghai 的今天与 due 日期重新计算，不依赖抓取时生成的 dueDays。
const shanghaiDate = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Shanghai" });
const getShanghaiToday = () => shanghaiDate.format(new Date());
const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

function getRemainingDays(due: string, today: string): number | null {
  if (!DATE_ONLY.test(due)) return null;
  const dueTime = Date.parse(`${due}T00:00:00Z`);
  const todayTime = Date.parse(`${today}T00:00:00Z`);
  if (!Number.isFinite(dueTime) || !Number.isFinite(todayTime)) return null;
  return Math.round((dueTime - todayTime) / MS_PER_DAY);
}

type FundingWithRemainingDays = FundingItem & { remainingDays: number | null };

const isExpiredFunding = (funding: FundingWithRemainingDays) =>
  funding.remainingDays !== null
    ? funding.remainingDays < 0
    : funding.openStatus === "已截止";

function dedupeByTitleAndOrg<T extends { title: string; org: string }>(items: T[]): T[] {
  const seen = new Set<string>();
  return items.filter((item) => {
    const key = `${item.title.trim()}::${item.org.trim()}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

const sorts = [
  { key: "due", label: "截止最近" },
  { key: "amount", label: "金额最高" },
  { key: "new", label: "最新发布" },
];

const tabToSupportType: Record<string, FundingItem["supportType"] | null> = {
  全部: null,
  资金资助: "资金",
  物资资助: "物资",
};

function regionMatch(region: string, itemRegion: string): boolean {
  return region === "全部" || itemRegion === "全国" || itemRegion === region;
}

const kindTagClass: Record<string, string> = {
  资助: "tag-green",
  需求: "tag-orange",
  物资: "tag-blue",
};

export function FundingBrowser({ fundings }: { fundings: FundingItem[] }) {
  const [tab, setTab] = useState("全部");
  const [resourceType, setResourceType] = useState("全部");
  const [duration, setDuration] = useState("全部");
  const [field, setField] = useState("全部");
  const [region, setRegion] = useState("全部");
  const [other, setOther] = useState("全部");
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState("due");
  const selectedSupportType = tabToSupportType[tab];
  const uniqueFundings = useMemo(() => dedupeByTitleAndOrg(fundings), [fundings]);

  const today = getShanghaiToday();
  const activeFundings = useMemo<FundingWithRemainingDays[]>(
    () =>
      uniqueFundings
        .map((funding) => ({
          ...funding,
          remainingDays: getRemainingDays(funding.due, today),
        }))
        .filter((funding) => !isExpiredFunding(funding)),
    [today, uniqueFundings],
  );
  const fundingTabs = [
    { label: "全部", count: String(activeFundings.length) },
    {
      label: "资金资助",
      count: String(activeFundings.filter((funding) => funding.supportType === "资金").length),
    },
    {
      label: "物资资助",
      count: String(activeFundings.filter((funding) => funding.supportType === "物资").length),
    },
  ];

  const filtered = useMemo(() => {
    const q = search.trim();
    const list = activeFundings.filter(
      (f) =>
        (selectedSupportType === null || f.supportType === selectedSupportType) &&
        (other !== "只看资助" || f.kind === "资助") &&
        (other !== "只看需求" || f.kind === "需求" || f.kind === "物资") &&
        (resourceType === "全部" || f.type === resourceType) &&
        (duration === "全部" || f.duration === duration) &&
        (field === "全部" || f.field === field) &&
        regionMatch(region, f.region) &&
        (other !== "最新发布（一周内）" || f.publishedDays <= 7) &&
        (!q || f.title.includes(q) || f.org.includes(q) || f.summary.includes(q)),
    );
    const by = {
      due: (a: FundingWithRemainingDays, b: FundingWithRemainingDays) =>
        (a.remainingDays ?? Number.POSITIVE_INFINITY) -
        (b.remainingDays ?? Number.POSITIVE_INFINITY),
      amount: (a: FundingItem, b: FundingItem) => b.amountWan - a.amountWan,
      new: (a: FundingItem, b: FundingItem) => a.publishedDays - b.publishedDays,
    }[sort];
    return [...list].sort(by);
  }, [selectedSupportType, resourceType, duration, field, region, other, search, sort, activeFundings]);

  // 渲染前再次按“标题 + 机构”严格去重，确保同一机构发布的同一标题只出现一次。
  const renderedFundings = dedupeByTitleAndOrg(filtered);

  const resetFilters = () => {
    setResourceType("全部");
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
  };

  const urgentFundings = activeFundings
    .filter(
      (funding) =>
        funding.remainingDays !== null &&
        funding.remainingDays > 0 &&
        funding.remainingDays <= 7,
    )
    .sort(
      (a, b) =>
        (a.remainingDays ?? Number.POSITIVE_INFINITY) -
        (b.remainingDays ?? Number.POSITIVE_INFINITY),
    )
    .slice(0, 3);
  const fundingStats = [
    { label: "当前收录", value: String(activeFundings.length) },
    { label: "资金资助", value: String(activeFundings.filter((funding) => funding.supportType === "资金").length) },
    { label: "物资资助", value: String(activeFundings.filter((funding) => funding.supportType === "物资").length) },
    { label: "开放中", value: String(activeFundings.filter((funding) => funding.openStatus === "开放中").length) },
    { label: "发布机构", value: String(new Set(activeFundings.map((funding) => funding.org)).size) },
  ];

  return (
    <div className="module-body">
      <div className="module-main">
        <div className="funding-toolbar">
          <TypeTabs tabs={fundingTabs} active={tab} onChange={changeTab} />
          <SearchInput value={search} onChange={setSearch} placeholder="搜索资助项目、关键词…" />
        </div>

        <div className="filter-panel">
          {tab !== "物资资助" && (
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
                  label="资助周期"
                  options={filterGroups.fundingDurations.filter(
                    (option) => option !== "详见原帖",
                  )}
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
            <FilterRow label="地域" options={filterGroups.fundingRegions} active={region} onChange={setRegion} />
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
          total={
            selectedSupportType === null
              ? activeFundings.length
              : activeFundings.filter((funding) => funding.supportType === selectedSupportType).length
          }
          unit={tab === "全部" ? "条资源" : `条${tab}`}
          shown={renderedFundings.length}
          sorts={sorts}
          activeSort={sort}
          onSort={setSort}
        />

        {renderedFundings.length === 0 ? (
          <EmptyState onReset={resetFilters} />
        ) : (
          <div className="card-grid-2">
            {renderedFundings.map((f) => (
              <article key={f.id} className="pc-card content-card">
                <div className="card-head">
                  <span className={`tag ${kindTagClass[f.kind] ?? "tag-green"}`}>{f.type}</span>
                  <span className="tag tag-pink">{f.field}</span>
                  <span className="spacer" />
                  {f.openStatus === "已截止" ? (
                    <span className="tag tag-red">已截止</span>
                  ) : (
                    <>
                      {f.openStatus === "开放中" && <span className="tag tag-green">开放中</span>}
                      {f.remainingDays !== null && f.remainingDays > 0 ? (
                        <span
                          className={`tag ${
                            f.remainingDays <= 7 ? "tag-red" : "tag-yellow"
                          }`}
                        >
                          {f.remainingDays}天截止
                        </span>
                      ) : (
                        f.openStatus !== "开放中" && (
                          <span className="tag tag-yellow">
                            {f.openStatus === "以原帖为准"
                              ? "以原帖为准"
                              : f.due === "长期有效"
                                ? "长期有效"
                                : "详见原帖"}
                          </span>
                        )
                      )}
                    </>
                  )}
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
                  <a className="card-link" href={f.url} target="_blank" rel="noreferrer">
                    查看来源 →
                  </a>
                </div>
              </article>
            ))}
          </div>
        )}
      </div>

      <aside className="module-aside">
        <Link className="publish-btn" href="/publish/funding">✏️ 发布资源</Link>
        <div className="urgent-card">
          <h2 className="aside-title">🚨 7天内截止</h2>
          {urgentFundings.length > 0 ? (
            <ul className="urgent-list">
              {urgentFundings.map((u) => (
                <li key={u.id}>
                  <a className="u-title" href={u.url} target="_blank" rel="noreferrer">
                    {u.title}
                  </a>
                  <span className="u-org">{u.org} · {u.field}</span>
                  <span className="u-due">⏰ {u.remainingDays}天后截止</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="urgent-empty">当前数据中暂无明确在 7 天内截止的项目</p>
          )}
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
