import Link from "next/link";
import type { ReactNode } from "react";

const navItems = [
  { label: "项目动态", href: "/updates" },
  { label: "资金&物资", href: "/funding" },
  { label: "人力资源", href: "/hr" },
  { label: "能力工具", href: "/tools" },
];

export function SiteNavigation({ active, children, updatesHref = "/updates" }: {
  active: string;
  children: ReactNode;
  updatesHref?: string;
}) {
  return (
    <header className="site-header">
      <div className="site-header-inner">
        <Link href="/" className="brand">
          <span className="brand-mark" aria-hidden="true">∞</span>
          <span className="brand-text">
            <strong>无限连接</strong>
            <small>INFINITE · CONNECTION</small>
          </span>
        </Link>
        <nav className="main-nav" aria-label="主导航">
          {navItems.map(({ label, href }) => (
            <Link
              key={href}
              href={href === "/updates" ? updatesHref : href}
              className={`nav-link${href === `/${active}` ? " active" : ""}`}
            >
              {label}
            </Link>
          ))}
        </nav>
        <div className="header-actions">{children}</div>
      </div>
    </header>
  );
}
