import { SiteHeader } from "@/components/SiteHeader";
import { PlatformFooter } from "@/components/PlatformFooter";
import { JobsBrowser } from "@/components/JobsBrowser";
import "../platform.css";

export const metadata = {
  title: "人力&专家 · 无限连接",
};

export default function HrPage() {
  return (
    <div className="module-page">
      <SiteHeader active="hr" />
      <JobsBrowser />
      <PlatformFooter />
    </div>
  );
}
