import { SiteHeader } from "@/components/SiteHeader";
import { PlatformFooter } from "@/components/PlatformFooter";
import { ToolsBrowser } from "@/components/ToolsBrowser";
import "../platform.css";

export const metadata = {
  title: "能力工具 · 无限连接",
};

export default function ToolsPage() {
  return (
    <div className="module-page">
      <SiteHeader active="tools" />
      <ToolsBrowser />
      <PlatformFooter />
    </div>
  );
}
