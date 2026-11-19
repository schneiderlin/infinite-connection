import { notFound } from "next/navigation";
import { FundingBrowser } from "@/components/FundingBrowser";
import { JobsBrowser } from "@/components/JobsBrowser";
import { ToolsBrowser } from "@/components/ToolsBrowser";
import { fullSite, SnapshotShell } from "../shell";
import { fundings, jobs, tools } from "../snapshots";

const titles = { funding: "资金&物资", hr: "人力资源", tools: "能力工具" };
type Props = { params: Promise<{ module: keyof typeof titles }> };

export const dynamicParams = false;

export function generateStaticParams() {
  return Object.keys(titles).map((module) => ({ module }));
}

export async function generateMetadata({ params }: Props) {
  return { title: titles[(await params).module] };
}

export default async function ModulePage({ params }: Props) {
  const { module } = await params;
  const publish = `${fullSite}/publish`;
  const content = {
    funding: () => <FundingBrowser
      fundings={fundings}
      publishHref={`${publish}/funding`}
      renderedOn={new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Shanghai" }).format(new Date())}
    />,
    hr: () => <JobsBrowser jobs={jobs} publishHref={`${publish}/jobs`} />,
    tools: () => <ToolsBrowser tools={tools} publishHref={`${publish}/tools`} readOnly />,
  }[module];
  if (!content) notFound();

  return <SnapshotShell active={module}>{content()}</SnapshotShell>;
}
