import Link from "next/link";
import type { ReactNode } from "react";
import { PlatformFooter } from "@/components/PlatformFooter";
import { SiteNavigation } from "@/components/SiteNavigation";

export const fullSite = "https://repo-beta-self.vercel.app";

export function SnapshotShell({ active, children }: { active: string; children: ReactNode }) {
  return (
    <div className="module-page">
      <SiteNavigation active={active} updatesHref={`${fullSite}/updates`}>
        <Link className="btn-ghost" href={`${fullSite}/login`}>登录</Link>
        <Link className="btn-primary" href={fullSite}>进入完整站 ↗</Link>
      </SiteNavigation>
      <p className="home-notice">公开只读版 · 收录内容为公开来源快照，最新内容以原帖及完整站为准。</p>
      {children}
      <PlatformFooter />
    </div>
  );
}
