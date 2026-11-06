# Handoff：内容管线现状与交接（2026-11-06）

换机器继续时，这份文档 + `台账.md` 就是全部上下文。台账管"有什么数据"，
本文档管"系统怎么跑、待办在哪"。

## 一句话架构

```
爬虫（BAML + MiniMax-M3.1-Flash 提取）→ 本地 JSON 快照（src/lib/*.json）
→ pnpm import:content → Neon DB（Content 表）→ 前端只读 DB
```

- 提取逻辑全部在 `baml_src/*.baml`（fundings/jobs/tools/news 四个 Extract 函数），改 prompt 后跑 `pnpm baml:generate`
- 爬虫脚本 `scripts/scrape-{fundings,jobs,tools,news}.mts`，MiniMax 策展（是否收录）+ 字段提取一步完成
- 快照记录带 `bodyHash` + `extraction` 缓存：正文没变不重调 LLM；浏览计数等自增字段已剥离
- 源失败自动沿用旧快照，不丢数据（`scrape-fundings.mts` 的 allSettled 兜底，其他源同理可选）
- 入库桥按有无 `extraction` 自动分流 PUBLISHED / UNPUBLISHED（一级/二级）
- 质检门 `pnpm quality-check`：校验 DB 里每条 PUBLISHED 记录的字段质量，非零退出码

## 跑起来需要的环境

| 变量 | 说明 |
|---|---|
| `MINIMAX_API_KEY` | MiniMax 开放平台 key（用户年会员）。本机 shell 已 export；`.env` 里也写了一份（gitignored） |
| `DATABASE_URL` 等 | Neon 连接串。`.env` 已是最新（2026-11-03 从 production 分支拉的）。过期了跑 `pnpm dlx neonctl@latest env pull`（`.neon` 指向 production 分支） |

注意：Vercel 部署用 `vercel@62.0.0`（63+ 报 Not authorized）；pnpm 是 12.x，
若 pnpm 报 placeholder 脚本错，跑一次 store 里 pnpm 包的 `node install.js` 装原生二进制
（详见 AGENTS.md 部署一节 + 本仓库 pnpm-workspace.yaml 的 allowBuilds）。

## 常用命令

```bash
pnpm scrape:all          # 全链路：四个爬虫 + 入库（约 15 分钟）
pnpm scrape:fundings     # 单跑某板块（jobs/tools/news 同理）
pnpm import:content      # 快照 → DB（幂等，sourceKey upsert）
pnpm quality-check       # 一级质检门（放行前必跑）
pnpm baml:generate       # 改了 baml_src 后重新生成客户端
```

## 数据现状（2026-11-06，DB 均为 PUBLISHED）

| 板块 | 条数 | 页面 |
|---|---|---|
| fundings | 136 | /funding |
| jobs | 300（含民政部平台 48） | /hr |
| tools | 952 | /tools |
| news | 52 | 在库，无页面 |

二级（UNPUBLISHED）：仅"印度公益行业"1 条（课程页无简介，无法诚实提取）。
线上地址：https://repo-beta-self.vercel.app

## 分类标准（2026-11-06 新版，用户提供 xlsx）

- **议题**：10 一级领域 + 35 二级议题，用于 fundings/news 的 field+issue；
  tools 保持"能力领域"维度不加议题。筛选 UI 只暴露一级。
- **岗位**：5 职业群（P/R/C/S/O）× 14 子类 + 六职级 L1-L6（决策树在 baml_src/jobs.baml 的
  prompt 里）+ 学历 + 机构性质。/hr 筛选栏已按新设计重做。
- **CNCF（慈展会）站点自 2026-11-03 起持续无法访问**：其 102 条资助的议题是按映射表过渡的，
  站点恢复后把 scrape-fundings.mts 的 EXTRACTION_VERSION 从 3 改为 4 重跑即可。

## 待办（按优先级）

1. **业务抽查**：台账.md 里有每板块该重点看哪几个字段（招聘重点查职级判定，
   公告类多岗位的 L 档可能偏高）。发现错例把标题记下来，改 `baml_src/*.baml` 的 prompt 后重跑该板块
2. **CNCF 恢复后重提取**：见上面"分类标准"一节
3. **第三级接源**：别全量盲接（很多机构官网根本没有公开招募栏目），等业务反馈哪类不够再定向接
4. **news 看板**：数据已入库，/updates 页面没做，需要时说一声
5. **恩友财务**：源失效（文件全 404），已移除 27 条记录；如找到新地址在台账三级里恢复

## 这轮做过的大事（供回忆）

- 删除全部 regex 提取、DeepSeek 分类、Excel 审核循环、seed-tools、crawler.mjs
- fundings：openStatus 三态（开放中/已截止/**以原帖为准**）；金额区分单项目额度 vs 资金池
- tools：CDB 1003 条僵尸数据重抓修复（真日期、真摘要、剔除纯新闻 106 条）；CFF PDF/zip 用 pdfjs+jszip 提取
- jobs：due 从 0 → 219 条真实截止日期；公共招聘网策展；ReliefWeb 修复（node:https 绕 ELB 406）；民政部 SPA 逆向接入（Web-Secret-Key = md5(md5("sshzPx"+日期))）
- Neon 凭证修复（.neon 曾指向已删除的 dev-publishing 分支）
