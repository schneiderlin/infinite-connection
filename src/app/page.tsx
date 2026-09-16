import styles from "./page.module.css";

export default function Home() {
  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div className={styles.brand}>
          <span className={styles.mark} aria-hidden="true">
            ∞
          </span>
          <span>无限连接</span>
        </div>
        <span className={styles.status}>筹备中</span>
      </header>

      <main className={styles.main}>
        <section className={styles.hero}>
          <p className={styles.eyebrow}>INFINITE CONNECTION</p>
          <h1>让公益资源，在需要的地方相遇。</h1>
          <p className={styles.lead}>
            一个面向公益机构、从业者与志愿者的行业信息和资源连接平台。
            网站内容与 MVP 范围正在共同讨论中。
          </p>
        </section>

        <section className={styles.principles} aria-labelledby="principles-title">
          <div className={styles.sectionHeading}>
            <p>我们先确认什么</p>
            <h2 id="principles-title">从真实需求出发，而不是从功能清单出发</h2>
          </div>
          <div className={styles.cards}>
            <article>
              <span>01</span>
              <h3>可信信息</h3>
              <p>保留来源、更新时间与审核状态，让每条内容可追溯。</p>
            </article>
            <article>
              <span>02</span>
              <h3>有效连接</h3>
              <p>优先帮助供需双方找到彼此，再逐步建设社区能力。</p>
            </article>
            <article>
              <span>03</span>
              <h3>合规边界</h3>
              <p>平台只做信息中介，不开展公开募捐，不代收款物。</p>
            </article>
          </div>
        </section>

        <section className={styles.nextStep}>
          <p>当前阶段</p>
          <div>
            <strong>01</strong>
            <span>梳理首批用户、核心内容与最小验证闭环</span>
          </div>
          <div>
            <strong>02</strong>
            <span>确认后再进入信息架构与界面设计</span>
          </div>
        </section>
      </main>

      <footer className={styles.footer}>
        <span>无限连接 · 公益行业公共服务探索</span>
        <span>不开展公开募捐，不代收、代管任何款物</span>
      </footer>
    </div>
  );
}
