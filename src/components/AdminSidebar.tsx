"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { logout } from "@/lib/actions/auth";

const navigation = [
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
}: {
  name: string;
  pendingCount: number;
}) {
  const pathname = usePathname();

  return (
    <aside className="admin-sidebar">
      <Link href="/admin/review" className="admin-brand">
        <span className="admin-brand-mark" aria-hidden="true">
          ∞
        </span>
        <span className="admin-brand-text">
          <strong>无限连接</strong>
          <small>MANAGEMENT CONSOLE</small>
        </span>
      </Link>

      <div className="admin-sidebar-label">后台管理</div>
      <nav className="admin-nav" aria-label="后台导航">
        {navigation.map((item) => {
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
