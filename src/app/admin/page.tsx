import { redirect } from "next/navigation";
import { requireAdminSession } from "@/lib/require-admin";

export default async function AdminIndexPage() {
  await requireAdminSession();
  redirect("/admin/review");
}
