import Link from "next/link";
import { SiteHeader } from "@/components/SiteHeader";
import { PlatformFooter } from "@/components/PlatformFooter";
import "./platform.css";

const modules = [
  {
    href: "/updates",
    icon: "📣",
    tone: "mint",
    name: "项目动态",
    desc: "像刷微博一样看公益项目进展：最新动态、项目主页、志愿活动、行业活动。",
    meta: "428 个在线项目 · 3,256 条累计动态",
  },
  {
    href: "/funding",
    icon: "💰",
    tone: "orange",
    name: "资金 & 物资",
    desc: "基金会资助、政府购买、企业CSR、招标采购与合作共建，一网打尽申报机会。",
    meta: "1,825 条资助征集 · 累计资助额 8.6亿+",
  },
  {
    href: "/hr",
    icon: "💼",
    tone: "blue",
    name: "人力资源",
    desc: "公益行业全职 / 兼职 / 实习岗位，机构入驻审核，真实可信。",
    meta: "186 个本月新增岗位 · 92 家在招机构",
  },
  {
    href: "/tools",
    icon: "🧰",
    tone: "purple",
    name: "能力工具",
    desc: "培训课程、行业沙龙、工具模板、行业报告、标准与经验文章。",
    meta: "3,256 件能力工具 · 1,425 份工具模板",
  },
];

export default function Home() {
  return (
    <div className="module-page">
      <SiteHeader active="home" />

      <main className="home-main">
        <section className="home-hero">
          <p className="home-eyebrow">INFINITE · CONNECTION</p>
          <h1>让公益资源，在需要的地方相遇。</h1>
          <p className="home-lead">
            面向公益机构、从业者与志愿者的行业信息与资源连接平台。
            项目动态、资金物资、人力资源、能力工具，一站连通。
          </p>
        </section>

        <section className="home-modules" aria-label="平台模块">
          {modules.map((m) => (
            <Link key={m.href} href={m.href} className="pc-card home-module">
              <span className={`home-module-icon cover-${m.tone}`} aria-hidden="true">
                {m.icon}
              </span>
              <h2>{m.name}</h2>
              <p>{m.desc}</p>
              <span className="home-module-meta">{m.meta}</span>
              <span className="card-link">进入模块 →</span>
            </Link>
          ))}
        </section>

        <p className="home-notice">
          平台只做信息中介：不开展公开募捐，不代收、代管任何款物。
        </p>
      </main>

      <PlatformFooter />
    </div>
  );
}
