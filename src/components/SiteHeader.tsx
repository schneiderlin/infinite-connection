import Link from "next/link";
import { auth } from "@/auth";
import { UserMenu } from "./UserMenu";

const navItems = [
  { label: "项目动态", href: "/updates" },
  { label: "资金&物资", href: "/funding" },
  { label: "人力资源", href: "/hr" },
  { label: "能力工具", href: "/tools" },
];

export async function SiteHeader({ active }: { active: string }) {
  const session = await auth();
  const displayName = session?.user?.name ?? session?.user?.email ?? "";

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
            const isActive = item.href === `/${active}`;
            return (
              <Link
                key={item.label}
                href={item.href}
                className={`nav-link${isActive ? " active" : ""}`}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>
        <div className="header-actions">
          {session?.user ? (
            <UserMenu name={displayName} isAdmin={session.user.role === "ADMIN"} />
          ) : (
            <>
              <Link href="/login" className="btn-ghost">
                登录
              </Link>
              <Link href="/register" className="btn-primary">
                免费注册
              </Link>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
