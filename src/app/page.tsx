import { HomeContent } from "@/components/HomeContent";
import { SiteHeader } from "@/components/SiteHeader";
import { PlatformFooter } from "@/components/PlatformFooter";
import { platformDataSource } from "@/lib/platform-data-source-instance";
import "./platform.css";

export default async function Home() {
  const [fundings, jobs, tools] = await Promise.all([
    platformDataSource.getFundings(),
    platformDataSource.getJobs(),
    platformDataSource.getTools(),
  ]);

  return (
    <div className="module-page">
      <SiteHeader active="home" />
      <HomeContent fundingCount={fundings.length} jobs={jobs} toolCount={tools.length} />
      <PlatformFooter />
    </div>
  );
}
