import { HomeContent } from "@/components/HomeContent";
import { fundings, jobs, tools } from "./snapshots";
import { fullSite, SnapshotShell } from "./shell";

export default function Home() {
  return (
    <SnapshotShell active="home">
      <HomeContent fundingCount={fundings.length} jobs={jobs} toolCount={tools.length} updatesHref={`${fullSite}/updates`} />
    </SnapshotShell>
  );
}
