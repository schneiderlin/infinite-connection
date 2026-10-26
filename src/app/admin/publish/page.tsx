import type { Metadata } from "next";
import { requireAdminSession } from "@/lib/require-admin";
import { AdminPublishForms } from "@/components/AdminPublishForms";
import {
  publicInterestFields,
  publishModules,
  type PublishModuleSlug,
} from "@/lib/publishing";

export const metadata: Metadata = {
  title: "发布管理｜管理后台｜无限连接",
};

export default async function AdminPublishPage() {
  await requireAdminSession();

  const modules = (Object.keys(publishModules) as PublishModuleSlug[]).map((slug) => ({
    slug,
    label: publishModules[slug].label,
    subtypes: publishModules[slug].subtypes,
  }));

  return (
    <main className="admin-main">
      <header className="admin-page-head">
        <div>
          <span className="admin-eyebrow">PUBLISH</span>
          <h1>发布管理</h1>
          <p>管理员发布的内容不进入审核队列，写入后会直接标记为 PUBLISHED 并展示在前台。</p>
        </div>
        <span className="admin-status-pill">当前状态：PUBLISHED</span>
      </header>

      <AdminPublishForms modules={modules} fields={publicInterestFields} />
    </main>
  );
}
