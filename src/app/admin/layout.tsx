import type { Metadata } from "next";
import { prisma } from "@/lib/db";
import { requireAdminSession } from "@/lib/require-admin";
import { AdminSidebar } from "@/components/AdminSidebar";
import "@/app/platform.css";

export const metadata: Metadata = {
  title: "管理后台｜无限连接",
};

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // 后台所有页面统一在这里拦截；每个 page 和 Server Action 内部还会再校验一次。
  const session = await requireAdminSession();

  const pendingCount = await prisma.content.count({
    where: { status: "PENDING_REVIEW" },
  });
  const displayName =
    session.user.organizationName ?? session.user.name ?? session.user.email ?? "管理员";

  return (
    <div className="admin-shell">
      <AdminSidebar name={displayName} pendingCount={pendingCount} />
      <div className="admin-content">{children}</div>
    </div>
  );
}
