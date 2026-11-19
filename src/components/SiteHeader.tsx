import Link from "next/link";
import { auth } from "@/auth";
import { SiteNavigation } from "./SiteNavigation";
import { UserMenu } from "./UserMenu";

export async function SiteHeader({ active }: { active: string }) {
  const session = await auth();
  const displayName = session?.user?.name ?? session?.user?.email ?? "";

  return (
    <SiteNavigation active={active}>
      {session?.user ? (
        <UserMenu name={displayName} isAdmin={session.user.role === "ADMIN"} />
      ) : (
        <>
          <Link href="/login" className="btn-ghost">登录</Link>
          <Link href="/register" className="btn-primary">免费注册</Link>
        </>
      )}
    </SiteNavigation>
  );
}
