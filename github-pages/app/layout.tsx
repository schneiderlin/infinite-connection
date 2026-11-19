import type { ReactNode } from "react";
import "@/app/globals.css";
import "@/app/platform.css";

export const metadata = {
  title: { default: "无限连接｜公益行业资源连接平台", template: "%s · 无限连接" },
  description: "无限连接公开只读版：浏览公益招聘、资助与工具的公开来源快照。",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return <html lang="zh-CN"><body>{children}</body></html>;
}
