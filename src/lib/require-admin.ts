import "server-only";
import { redirect } from "next/navigation";
import { auth } from "@/auth";

/**
 * 后台页面的统一权限检查。
 *
 * layout 与 page 会并行渲染，只在 layout 里 redirect 仍可能让 page 先取数；
 * 因此 layout 和每个后台 page 都调用一次，避免数据被序列化进重定向响应。
 */
export async function requireAdminSession() {
  const session = await auth();
  if (session?.user?.role !== "ADMIN") redirect("/");
  return session;
}
