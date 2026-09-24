import Link from "next/link";

const navItems = [
  { label: "首页", href: "/" },
  { label: "公益活动", href: "/updates" },
  { label: "资金&物资对接", href: "/funding" },
  { label: "场地供需", href: "/venues" },
  { label: "人力&专家", href: "/hr" },
  { label: "能力工具", href: "/tools" },
  { label: "政策咨询", href: "/policy" },
];

export function SiteHeader({ active }: { active: string }) {
  return (
    <header className="site-header">
      <div className="site-header-inner">
        <Link href="/" className="brand">
          <span className="brand-mark" aria-hidden="true">
            ∞
          </span>
          <span className="brand-text">
            <strong>无限连接</strong>
            <small>INFINITE · CONNECTION</small>
          </span>
        </Link>
        <nav className="main-nav" aria-label="主导航">
          {navItems.map((item) => {
            const isActive =
              active === "home" ? item.href === "/" : item.href === `/${active}`;
            const disabled = item.href === "/venues" || item.href === "/policy";
            return (
              <Link
                key={item.label}
                href={disabled ? "#" : item.href}
                className={`nav-link${isActive ? " active" : ""}${disabled ? " disabled" : ""}`}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>
        <div className="header-actions">
          <button className="btn-ghost" type="button">
            登录
          </button>
          <button className="btn-primary" type="button">
            免费注册
          </button>
        </div>
      </div>
    </header>
  );
}
