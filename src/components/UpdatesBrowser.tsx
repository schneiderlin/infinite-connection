"use client";

import { useMemo, useState } from "react";
import {
  updates as initialUpdates,
  filterGroups,
  platformStats,
  hotProjects,
  type UpdateItem,
} from "@/lib/platform-data";
import {
  FilterRow,
  SearchInput,
  ListMeta,
  EmptyState,
  formatCount,
} from "./platform-ui";
import { PublishDialog } from "./PublishDialog";

const sorts = [
  { key: "new", label: "最新发布（3天内）" },
  { key: "rating", label: "评分最高" },
  { key: "hot", label: "互动最多" },
];

const fieldTagClass: Record<string, string> = {
  生态环保: "tag-green",
  乡村教育: "tag-blue",
  残障融合: "tag-orange",
  儿童保护: "tag-purple",
  老龄关怀: "tag-rose",
  医疗健康: "tag-red",
};

const avatarTones = ["av-green", "av-blue", "av-orange", "av-purple", "av-rose", "av-teal"];

function avatarTone(org: string): string {
  let h = 0;
  for (const ch of org) h = (h * 31 + ch.charCodeAt(0)) % 997;
  return avatarTones[h % avatarTones.length];
}

const publishFields = [
  { key: "title", label: "标题", placeholder: "一句话说明这条动态", required: true },
  { key: "content", label: "内容", placeholder: "分享项目进展、活动信息…", type: "textarea" as const, required: true },
  { key: "field", label: "领域", type: "select" as const, options: filterGroups.fields.slice(1) },
  { key: "hashtags", label: "话题", placeholder: "多个话题用逗号分隔，如：净滩行动,志愿者招募" },
  { key: "location", label: "地点", placeholder: "如：北京" },
];

export function UpdatesBrowser() {
  const [items, setItems] = useState<UpdateItem[]>(initialUpdates);
  const [field, setField] = useState("全部");
  const [region, setRegion] = useState("全部");
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState("new");
  const [poster, setPoster] = useState<"全部" | "机构" | "个人">("全部");
  const [liked, setLiked] = useState<Set<number>>(new Set());
  const [helped, setHelped] = useState<Set<number>>(new Set());
  const [shared, setShared] = useState<Set<number>>(new Set());
  const [dialogOpen, setDialogOpen] = useState(false);

  const filtered = useMemo(() => {
    const q = search.trim();
    let list = items.filter(
      (u) =>
        (field === "全部" || u.field === field) &&
        (region === "全部" || u.region === region) &&
        (poster === "全部" || u.posterType === poster) &&
        (!q ||
          u.title.includes(q) ||
          u.org.includes(q) ||
          u.content.includes(q) ||
          u.hashtags.some((h) => h.includes(q))),
    );
    if (sort === "new") {
      list = list.filter((u) => u.publishedHours <= 72);
    }
    const by = {
      new: (a: UpdateItem, b: UpdateItem) => a.publishedHours - b.publishedHours,
      rating: (a: UpdateItem, b: UpdateItem) => b.rating - a.rating,
      hot: (a: UpdateItem, b: UpdateItem) =>
        b.likes + b.comments + b.shares - (a.likes + a.comments + a.shares),
    }[sort];
    return [...list].sort(by);
  }, [items, field, region, search, sort, poster]);

  const bump = (set: Set<number>, setSet: (s: Set<number>) => void, id: number) => {
    const next = new Set(set);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSet(next);
  };

  const resetFilters = () => {
    setField("全部");
    setRegion("全部");
    setSearch("");
    setPoster("全部");
  };

  const publish = (values: Record<string, string>) => {
    const item: UpdateItem = {
      id: Date.now(),
      kind: "最新动态",
      posterType: "个人",
      field: values.field || "乡村教育",
      region: "全国",
      rating: 5.0,
      publishedHours: 0,
      time: "刚刚",
      source: "来自 我的发布",
      org: "我（演示账号）",
      title: values.title,
      content: values.content,
      hashtags: (values.hashtags ?? "")
        .split(/[,，]/)
        .map((h) => h.trim().replace(/^#|#$/g, ""))
        .filter(Boolean),
      location: values.location || "全国",
      period: "长期",
      shares: 0,
      comments: 0,
      likes: 0,
      helps: 0,
    };
    setItems((list) => [item, ...list]);
    resetFilters();
    setSort("new");
  };

  return (
    <div className="module-body">
      <div className="module-main">
        <div className="filter-panel">
          <div className="pc-card filter-box">
            <FilterRow label="领域" options={filterGroups.fields} active={field} onChange={setField} />
          </div>
          <div className="pc-card filter-box">
            <FilterRow label="地域" options={filterGroups.regions} active={region} onChange={setRegion}>
              <SearchInput value={search} onChange={setSearch} placeholder="搜索项目名称、机构、关键词…" />
            </FilterRow>
          </div>
        </div>

        <ListMeta
          total={428}
          unit="个项目动态"
          shown={filtered.length}
          sorts={sorts}
          activeSort={sort}
          onSort={setSort}
        >
          <button
            type="button"
            className={poster === "机构" ? "active" : ""}
            onClick={() => setPoster(poster === "机构" ? "全部" : "机构")}
          >
            只看组织
          </button>
          <button
            type="button"
            className={poster === "个人" ? "active" : ""}
            onClick={() => setPoster(poster === "个人" ? "全部" : "个人")}
          >
            只看个人
          </button>
        </ListMeta>

        {filtered.length === 0 ? (
          <EmptyState onReset={resetFilters} />
        ) : (
          <div className="card-grid-2">
            {filtered.map((u) => (
              <article key={u.id} className="pc-card feed-card">
                <div className="card-head">
                  <span className={`tag ${fieldTagClass[u.field] ?? "tag-green"}`}>{u.field}</span>
                  <span className="tag tag-rating">⭐ {u.rating.toFixed(1)}</span>
                  <span className="spacer" />
                  <span className="card-time">{u.time}更新</span>
                </div>

                <div className="feed-author">
                  <span className={`avatar ${avatarTone(u.org)}`} aria-hidden="true">
                    {u.org.slice(0, 1)}
                  </span>
                  <div className="feed-author-text">
                    <span className="feed-org">
                      {u.org}
                      <span className="verified" title="已认证机构">✔</span>
                    </span>
                    <span className="feed-sub">
                      {u.time} · {u.source}
                    </span>
                  </div>
                </div>

                <h3 className="card-title">{u.title}</h3>
                <p className="feed-content">
                  {u.content}
                  {u.hashtags.map((h) => (
                    <span key={h} className="hashtag">
                      {" "}
                      #{h}#
                    </span>
                  ))}
                </p>

                {u.media && (
                  <div className={`feed-media cover-${u.media.tone}`}>
                    <span className="media-icon" aria-hidden="true">
                      {u.media.icon}
                    </span>
                    <span className="media-caption">{u.media.caption}</span>
                  </div>
                )}

                <div className="card-meta feed-meta-row">
                  <span className="item">📍 {u.location}</span>
                  <span className="item">🕐 项目期：{u.period}</span>
                  <a className="card-link" href="#">
                    进入项目主页 →
                  </a>
                </div>

                <div className="feed-actions">
                  <button
                    type="button"
                    className={`feed-action${shared.has(u.id) ? " active" : ""}`}
                    onClick={() => bump(shared, setShared, u.id)}
                  >
                    ↗ 分享 {formatCount(u.shares + (shared.has(u.id) ? 1 : 0))}
                  </button>
                  <button type="button" className="feed-action">
                    💬 评论 {formatCount(u.comments)}
                  </button>
                  <button
                    type="button"
                    className={`feed-action${liked.has(u.id) ? " active" : ""}`}
                    onClick={() => bump(liked, setLiked, u.id)}
                  >
                    👍 点赞 {formatCount(u.likes + (liked.has(u.id) ? 1 : 0))}
                  </button>
                  <button
                    type="button"
                    className={`feed-action help${helped.has(u.id) ? " active" : ""}`}
                    onClick={() => bump(helped, setHelped, u.id)}
                  >
                    🤝 搭把手 {formatCount(u.helps + (helped.has(u.id) ? 1 : 0))}
                  </button>
                </div>
              </article>
            ))}
          </div>
        )}
      </div>

      <aside className="module-aside">
        <button className="publish-btn" type="button" onClick={() => setDialogOpen(true)}>
          ✏️ 我要发布
        </button>

        <div className="aside-card">
          <h2 className="aside-title">📊 平台动态数据</h2>
          <div className="stats-grid">
            {platformStats.map((s) => (
              <div key={s.label} className={`stat-box tone-${s.tone}`}>
                <div className="value">{s.value}</div>
                <div className="label">{s.label}</div>
              </div>
            ))}
          </div>
        </div>

        <div className="aside-card">
          <h2 className="aside-title">🔥 热门项目 TOP 5</h2>
          <ol className="hot-list">
            {hotProjects.map((p) => (
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
      </aside>

      <PublishDialog
        open={dialogOpen}
        title="发布项目动态"
        fields={publishFields}
        onClose={() => setDialogOpen(false)}
        onSubmit={publish}
      />
    </div>
  );
}
