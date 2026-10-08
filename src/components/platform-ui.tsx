import type { ReactNode } from "react";

export type TabDef = { label: string; icon?: string; count?: string };

export function TypeTabs({
  tabs,
  active,
  onChange,
}: {
  tabs: TabDef[];
  active: string;
  onChange: (label: string) => void;
}) {
  return (
    <div className="type-tabs">
      {tabs.map((t) => (
        <button
          key={t.label}
          type="button"
          className={`type-tab${active === t.label ? " active" : ""}`}
          onClick={() => onChange(t.label)}
        >
          {t.icon && <span className="tab-icon">{t.icon}</span>}
          {t.label}
          {t.count && <span className="count">{t.count}</span>}
        </button>
      ))}
    </div>
  );
}

export function FilterRow({
  label,
  options,
  active,
  onChange,
  children,
}: {
  label: string;
  options: string[];
  active: string;
  onChange: (option: string) => void;
  children?: ReactNode;
}) {
  return (
    <div className="filter-row">
      <span className="filter-label">{label}</span>
      <div className="filter-pills">
        {options.map((o) => (
          <button
            key={o}
            type="button"
            className={`pill${active === o ? " active" : ""}`}
            onClick={() => onChange(o)}
          >
            {o}
          </button>
        ))}
        {children}
      </div>
    </div>
  );
}

export function SearchInput({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
}) {
  return (
    <label className="filter-search search-input">
      <span className="search-icon">🔍</span>
      <input
        type="search"
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
      />
    </label>
  );
}

export type SortDef = { key: string; label: string };

export function ListMeta({
  total,
  unit,
  shown,
  sorts,
  activeSort,
  onSort,
  children,
}: {
  total: number;
  unit: string;
  shown: number;
  sorts: SortDef[];
  activeSort: string;
  onSort: (key: string) => void;
  children?: ReactNode;
}) {
  return (
    <div className="list-meta-bar">
      <span className="total">
        共 <b>{total.toLocaleString()}</b> {unit} · 当前展示 1-{shown}
      </span>
      <span className="sorts">
        {sorts.map((s) => (
          <button
            key={s.key}
            type="button"
            className={activeSort === s.key ? "active" : ""}
            onClick={() => onSort(s.key)}
          >
            {s.label}
          </button>
        ))}
        {children}
      </span>
    </div>
  );
}

export function EmptyState({ onReset }: { onReset: () => void }) {
  return (
    <div className="pc-card empty-state">
      <span className="empty-icon">🍃</span>
      <p>没有符合条件的内容，换个筛选条件试试。</p>
      <button type="button" className="btn-primary" onClick={onReset}>
        清除全部筛选
      </button>
    </div>
  );
}

export function formatCount(n: number): string {
  return n >= 1000
    ? `${(n / 1000).toFixed(1).replace(/\.0$/, "")}k`
    : `${n}`;
}
