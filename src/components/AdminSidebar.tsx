"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ContentModule } from "@prisma/client";
import { logout } from "@/lib/actions/auth";

const contentNavigation: Array<{
  href: string;
  label: string;
  hint: string;
  icon: string;
  module: ContentModule;
}> = [
  { href: "/admin/content/updates", label: "项目动态", hint: "项目与活动", icon: "动", module: "UPDATE" },
  { href: "/admin/content/funding", label: "资金与物资", hint: "资助与资源", icon: "资", module: "FUNDING" },
  { href: "/admin/content/jobs", label: "人力资源", hint: "招聘与志愿者", icon: "人", module: "JOB" },
  { href: "/admin/content/tools", label: "能力工具", hint: "课程、报告与工具", icon: "工", module: "TOOL" },
];

const operationNavigation = [
  {
    href: "/admin/publish",
    label: "发布管理",
    hint: "手动发布 / 批量导入",
    icon: "＋",
  },
  {
    href: "/admin/review",
    label: "审核管理",
    hint: "处理待审核内容",
    icon: "✓",
  },
];

export function AdminSidebar({
  name,
  pendingCount,
  moduleCounts,
}: {
  name: string;
  pendingCount: number;
  moduleCounts: Partial<Record<ContentModule, number>>;
}) {
  const pathname = usePathname();

  return (
    <aside className="admin-sidebar">
      <Link href="/admin/content/updates" className="admin-brand">
        <span className="admin-brand-mark" aria-hidden="true">
          ∞
        </span>
        <span className="admin-brand-text">
          <strong>无限连接</strong>
          <small>MANAGEMENT CONSOLE</small>
        </span>
      </Link>

      <div className="admin-sidebar-section">
        <div className="admin-sidebar-label">内容数据库</div>
        <nav className="admin-nav" aria-label="内容板块导航">
          {contentNavigation.map((item) => {
            const active = pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`admin-nav-link${active ? " active" : ""}`}
                aria-current={active ? "page" : undefined}
              >
                <span className="admin-nav-icon" aria-hidden="true">{item.icon}</span>
                <span className="admin-nav-text">
                  <strong>{item.label}</strong>
                  <small>{item.hint}</small>
                </span>
                <span className="admin-nav-count admin-nav-count-muted">
                  {moduleCounts[item.module] ?? 0}
                </span>
              </Link>
            );
          })}
        </nav>
      </div>

      <div className="admin-sidebar-section">
        <div className="admin-sidebar-label">运营操作</div>
        <nav className="admin-nav" aria-label="后台操作导航">
        {operationNavigation.map((item) => {
          const active = pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`admin-nav-link${active ? " active" : ""}`}
              aria-current={active ? "page" : undefined}
            >
              <span className="admin-nav-icon" aria-hidden="true">
                {item.icon}
              </span>
              <span className="admin-nav-text">
                <strong>{item.label}</strong>
                <small>{item.hint}</small>
              </span>
              {item.href === "/admin/review" && pendingCount > 0 && (
                <span className="admin-nav-count" aria-label={`${pendingCount} 条待审核`}>
                  {pendingCount > 99 ? "99+" : pendingCount}
                </span>
              )}
            </Link>
          );
        })}
        </nav>
      </div>

      <div className="admin-sidebar-footer">
        <Link href="/" className="admin-back-link">
          ← 返回前台
        </Link>
        <div className="admin-identity">
          <span className="user-avatar" aria-hidden="true">
            {(name || "管").trim().slice(0, 1).toUpperCase()}
          </span>
          <span className="admin-identity-text">
            <strong>{name || "管理员"}</strong>
            <small>ADMIN</small>
          </span>
        </div>
        <form action={logout}>
          <button type="submit" className="admin-logout">
            退出登录
          </button>
        </form>
      </div>
    </aside>
  );
}
