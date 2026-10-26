# 数据来源与结构化字段记录

本文记录当前代码**实际采集了哪些来源、原站能确认提供哪些结构化字段，以及这些字段如何进入站内模型**。

不同来源的原始结构不要求一致。每个来源应保留独立的来源契约和适配逻辑，再映射到站内统一字段；不得把推导字段写成原站直接提供的事实。

## 当前数据来源概览

| 模块 | 来源 | 接入状态 | 当前页面数据 |
| --- | --- | --- | --- |
| 人力资源 / 招聘 | [中国发展简报·NGO 招聘](https://www.chinadevelopmentbrief.org.cn/jobs.html) | 已接入列表接口 | 去重后 17 条 |
| 人力资源 / 招聘 | [中国公共招聘网](http://job.mohrss.gov.cn/) | 已接入公开搜索结果页 | 13 条公益 / 社会服务岗位 |
| 人力资源 / 招聘 | [壹基金·工作机会](https://onefoundation.cn/jobs/) | 已接入机构官网列表 | 4 条 |
| 人力资源 / 招聘 | [美丽中国支教·成为员工](http://www.meilizhongguo.org/join-us) | 已接入机构官网列表与详情页 | 6 条 |
| 人力资源 / 招聘 | [ReliefWeb](https://reliefweb.int/jobs) | 已接入官方公开 RSS | 20 条中国或不限地点岗位 |
| 人力资源 / 招聘 | [NGO Job Board](https://ngojobboard.org/) | 已接入官方公开 RSS | 8 条 |
| 项目动态 | 站内用户发布 | 已接入数据库 | `Content` 中已发布记录 |
| 资金 & 物资 | 中国发展简报、中国红十字基金会、中国慈展会、中国人口福利基金会 | 管理员本地采集与审核；网站读取数据库 | `Content` 中已发布记录 |
| 能力工具 | `scripts/scrape-tools.mjs` 配置的公开来源 | 管理员本地采集与审核；网站读取数据库 | `Content` 中已发布记录 |

候选招聘来源来自 [`references/公益招聘网站信息库.xlsx`](./references/公益招聘网站信息库.xlsx)。2026-10-13 生成的当前快照共 68 条；各来源原始结果合计 71 条，统一入口按原始 URL 和“机构 + 标题”去重后保留 68 条。候选清单不代表已经接入，也不代表链接、采集许可或字段仍然有效。

## 当前采集链路

当前没有常驻爬虫或定时任务。采集脚本仍由管理员手动运行并生成审核快照，但网站页面不再直接 import 这些 JSON 文件：

```text
pnpm scrape:jobs
  → 请求来源列表接口
  → 来源专用转换逻辑
  → src/lib/jobs-scraped.json
  → 管理员在本地清洗与审核

网站请求
  → PlatformDataSource 接口
  → PrismaPlatformDataSource
  → Postgres Content 表中的 PUBLISHED 记录
  → Server Component 把数据作为 props 传给 Browser 组件
```

- 脚本：[`scripts/scrape-jobs.mjs`](../scripts/scrape-jobs.mjs)
- 快照：[`src/lib/jobs-scraped.json`](../src/lib/jobs-scraped.json)
- 数据读取接口：[`src/lib/platform-data-source.ts`](../src/lib/platform-data-source.ts)
- 当前数据库实现：[`src/lib/prisma-platform-data-source.ts`](../src/lib/prisma-platform-data-source.ts)
- 页面组件：[`src/components/JobsBrowser.tsx`](../src/components/JobsBrowser.tsx)
- 每个来源适配器最多输出 20 条；公共招聘网的三个关键词各只请求第一页，机构官网只读取当前公开列表，RSS 只读取当前 feed。启动 `pnpm dev` 不会自动刷新。
- 快照本身没有 `scrapedAt`、来源版本或本次采集报告等元数据。
<<<<<<< HEAD
- 抓取脚本写入的新记录默认带 `status: "PENDING"`；清洗脚本会保留已发布记录及其分类，历史快照没有 `status` 字段时按已发布处理。`FundingBrowser`、`JobsBrowser`、`ToolsBrowser` 只渲染已发布（`PUBLISHED` 或历史缺失 `status`）的记录，`PENDING` / `PENDING_REVIEW` / `REJECTED` 不展示。首页的岗位数量统计同样只计入已审核记录。
- 资助模块把“申报通道是否开放”拆到 `openStatus`（`开放中` / `已截止`），`status` 只表示人工审核状态。
- 一键执行「抓取 → 清洗 → AI 辅助分类 → 导出 Excel」：`pnpm scrape:all`（`scripts/run-all.mjs`），依次运行 3 个抓取、3 个清洗、`ai-classify.mjs` 和导出脚本；任一步失败会立即停止并返回非零退出码。AI 分类默认每个数据集抽样 5 条，可用 `AI_CLASSIFY_LIMIT`（1-5000）扩大本次总样本。AI 返回置信度：`> 0.8` 直接覆盖分类并发布；`<= 0.8` 覆盖分类但标记为 `PENDING_REVIEW`，等待人工复核。需要强制重跑全部历史数据时执行 `node scripts/ai-classify.mjs --force`。
- 首页“人力资源”入口的当前收录岗位数和机构数也由这份快照计算。
- 侧栏的“当前收录机构”和“当前远程岗位”由这份快照计算；来源不能支持的“急招岗位”“本月新增岗位”“累计投递”显示“无法计算”，不再使用 mock 值。
=======
- 抓取脚本写入的新记录默认带 `status: "PENDING"`，供管理员机器上的清洗与审核流程使用。网站只查询数据库中 `Content.status = PUBLISHED` 的记录；Browser 组件不再读取或解释快照审核状态。
- 资助模块把“申报通道是否开放”拆到 `openStatus`（`开放中` / `已截止`），`status` 只表示人工审核状态。
- 一键执行「抓取 → 清洗 → AI 辅助分类 → 导出 Excel」：`pnpm scrape:all`（`scripts/run-all.mjs`），依次运行 3 个抓取、3 个清洗、`ai-classify.mjs` 和导出脚本；任一步失败会立即停止并返回非零退出码。AI 分类默认每个数据集抽样 5 条，可用 `AI_CLASSIFY_LIMIT`（1-50）扩大样本。
- 首页和各模块侧栏的当前收录数量均由数据库查询结果计算，不再使用快照或 mock 数值。
>>>>>>> c86fef09b52dc51e9ecd55ba73e1cda6e5ca4df1

## 导出审核用 Excel

三份快照可以用 `pnpm run export:excel` 导出成便于人工审核的表格，输出目录 `docs/exports/`：

| 快照 | 输出文件 | 当前记录数 |
| --- | --- | --- |
| `src/lib/fundings-data.json` | `docs/exports/fundings.xlsx` | 78 |
| `src/lib/jobs-scraped.json` | `docs/exports/jobs.xlsx` | 211 |
| `src/lib/tools-data.json` | `docs/exports/tools.xlsx` | 1095 |

- 脚本：[`scripts/export-to-excel.mjs`](../scripts/export-to-excel.mjs)，基于已有 `xlsx` 依赖直接写 `.xlsx`，不会出现 CSV 用 Excel 打开时的 UTF-8 乱码问题。
- 表头为中文且列顺序固定；`tags` 等数组字段用 `, ` 拼成字符串，布尔值转成“是 / 否”。
- 每条记录的前四列是审核列：`审核状态`、`原始分类`、`AI建议分类`、`最终发布分类`。`审核状态` 为 `PENDING` / `PENDING_REVIEW`（前端不展示）或 `PUBLISHED`（前端展示）；历史快照没有 `status` 时按 `PUBLISHED` 导出。`最终发布分类` 初始等于原始分类，供运营修改。
- 链接列写成可点击的 Excel 超链接，并带表头筛选与列宽；JSON 出现未配置的新字段时会自动追加到表格末尾，不会静默丢数据。每个工作簿另带一个「使用说明」工作表。
- 目标文件正被 Excel / WPS 打开时，脚本会先重试；仍然失败会提示先关闭同名文件。需要导出到其他目录（CI、临时排查）时设置 `EXPORT_OUT_DIR`，默认仍是 `docs/exports/`。

## 导入人工审核结果

运营把 Excel 的 `审核状态` 改为 `PUBLISHED`（或 `PENDING` / `REJECTED`）并确认 `最终发布分类` 后，运行：

```text
pnpm import:excel
```

脚本 [`scripts/import-from-excel.mjs`](../scripts/import-from-excel.mjs) 会读取 `docs/exports/` 下的三份表格，并按记录 ID 写回对应快照：

- `PUBLISHED`：用 `最终发布分类` 覆盖 JSON 中的分类字段（资助 `field`、岗位 `role`、工具 `category`）；原 `status` 为 `PENDING` / `PENDING_REVIEW` / `REJECTED` 时改为 `PUBLISHED`，历史缺失 `status` 的记录已按已发布处理，不强制补写。
- `PENDING` / `PENDING_REVIEW` / `REJECTED`：同步 `status`，不覆盖分类；此时若修改了 `最终发布分类`，会打印“未应用”的警告。
- `最终发布分类` 为空：保留原分类并打印警告。
- 容错：表头改名、新增列、表头不在第一行、缺少可选列、未知记录 ID、重复 ID、无法识别的审核状态都会打印警告并尽量继续；缺少记录 ID / 审核状态 / 最终发布分类时跳过该文件，不影响其他文件。
- `pnpm import:excel -- --dry-run` 只统计不写回；`pnpm import:excel -- --dataset jobs` 只导入招聘表；联调时可用 `--in-dir` 和 `--data-dir` 指向临时目录。

## 导入 AI 待复核结果到后台

AI 分类置信度 `<= 0.8` 时，快照记录会保留为 `PENDING_REVIEW`。要把这些记录放进管理后台的人工审核队列，运行：

```text
pnpm import:review
pnpm import:review -- --dry-run
```

脚本 [`scripts/import-pending-review-to-content.mjs`](../scripts/import-pending-review-to-content.mjs) 读取 `src/lib/fundings-data.json` 和 `src/lib/jobs-scraped.json` 中所有 `PENDING_REVIEW` 记录，写入 Prisma `Content` 表：

- 资助记录映射为 `FUNDING` / `资金资助`（`supportType` 含“物资”时为 `物资资助`），招聘记录按 `kind` 映射为 `JOB` / `全职|兼职|实习|志愿者`。
- 正文包含摘要、机构、金额/薪资、地区、截止时间、来源和原文链接；原始记录、AI 建议分类与置信度保存在 `metadata.raw`、`metadata.aiSuggestedCategory`、`metadata.aiConfidence`。
- 写入后状态仍为 `PENDING_REVIEW`，刷新 `/admin/review` 即可逐条审核。页面每次请求实时查库，无需重新构建。
- 幂等键为 `metadata.sourceKey`（`funding:<id>` / `job:<id>`）；重复执行只跳过，不会重复插入。检查与写入在同一个 PostgreSQL advisory lock 事务中执行，多个终端同时运行也不会产生重复。
- 作者优先取 `ADMIN_EMAILS` 中已存在的账号，其次数据库 `ADMIN`，最后回退到最早注册用户；可用 `--author-email <邮箱>` 显式指定。

## 来源： 中国发展简报·NGO 招聘

### 获取方式

| 项目 | 当前值 |
| --- | --- |
| 列表接口 | `POST https://www.chinadevelopmentbrief.org.cn/search/jobs/getData` |
| 请求体 | `search=0&pageNum=1&pageSize=20` |
| 内容类型 | `application/x-www-form-urlencoded` |
| 详情页 | `https://www.chinadevelopmentbrief.org.cn/jobs/detail/{id}.html` |
| 最近核验 | 2026-10-08，20 条列表样本并抽查详情页 |

这是原站网页使用的站内列表接口，不是已承诺稳定性的公共 API。字段和编码可能在无通知的情况下变化。

接口响应顶层有 `code`、`message`、`result`。`result` 中可确认有：

- `list`：职位记录数组；
- `total`、`pageNum`、`pageSize`、`size`、`pages`：总量与分页；
- `startRow`、`endRow`、`prePage`、`nextPage`：分页位置；
- `isFirstPage`、`isLastPage`、`hasPreviousPage`、`hasNextPage`：分页状态；
- `navigatePages`、`navigatepageNums`、`navigateFirstPage`、`navigateLastPage`：页码导航信息。

### 原始职位字段

下表只描述 2026-10-08 的 20 条实时样本。所谓“可确认”是指接口直接返回该字段，不代表所有历史记录都非空，也不代表字段语义永远不变。

| 原始字段 | 类型 / 样本 | 当前能确认的含义 | 样本可用性与注意事项 |
| --- | --- | --- | --- |
| `id` | number | 原站职位 ID，可用于构造详情页 URL | 20/20 非空 |
| `title` | string | 原站职位标题 | 20/20 非空 |
| `type` | string | 原站职位类型 | 20/20 非空；观察到 `全职`、`实习生`、`志愿者` |
| `postName` | string | 原站职位类别 | 20/20 非空；如 `项目管理`、`传播与新媒体运营`、`社工` |
| `updateTime` | `YYYY-MM-DD` string | **更新时间** | 20/20 非空；详情页同样显示“更新”，不能当作首次发布日期 |
| `refreshTime` | null / 未确认 | 可能与刷新有关 | 20/20 均为 null，语义尚不能确认 |
| `jobModel` | string code | 工作模式编码 | 20/20 非空且本次均为 `XXBG`；代码把 `YCBG` 解释为远程，但尚未核验编码表 |
| `provinceName` | string | 省级地点文本 | 20/20 非空 |
| `cityName` | string | 城市地点文本 | 20/20 非空 |
| `salaryBegin` | string | 薪资文本 | 20/20 非空；值可能已是完整区间，如 `6000-8000元`，并非一定是数值下限 |
| `experience` | string | 工作经验要求文本 | 20/20 非空 |
| `education` | string code | 学历编码 | 20/20 非空；观察到 `BK`、`SS`、`BX`，不要脱离展示值自行解释 |
| `educationValue` | string | 学历展示值 | 20/20 非空；观察到 `本科`、`硕士`、`不限` |
| `academicRequire` | null / 未确认 | 可能是另一学历要求字段 | 20/20 均为 null |
| `welfare` | comma-separated string | 福利标签文本 | 20/20 非空；多个值以逗号连接 |
| `otherWelfare` | string | 其他福利文本 | 字段存在，可为空字符串 |
| `companyName` | string | 机构名称 | 20/20 非空 |
| `companyLogo` | URL string | 机构 Logo 地址 | 20/20 非空；外部资源可失效 |
| `companyFoundedYear` | string | 机构成立年份文本 | 20/20 非空，尚未独立核验真实性 |
| `companyScale` | string | 机构规模文本 | 20/20 非空 |
| `companyDomains` | string | 机构领域文本 | 20/20 非空；可能用逗号包含多个领域 |
| `browseCount` | null / 未确认 | 可能是浏览量 | 20/20 均为 null |
| `provinceId` | null / 未确认 | 可能是省级地区 ID | 20/20 均为 null |
| `sign` | string | 不透明的来源字段 | 20/20 非空；用途未知，不应推导业务语义 |

当前列表响应没有观察到 `publishTime`、`createTime`、申请截止日期、职位正文等字段。详情页抽查只确认了“`2026-10-08 更新`”，没有确认到首次发布日期。

### 当前站内字段映射

这里记录的是**现状**，包括已知的信息损失和错误语义，并非推荐设计。

| 站内字段 | 当前来源 / 计算方式 | 性质与已知问题 |
| --- | --- | --- |
| `id` | 按本次结果顺序生成 `10001 + index` | 派生值；没有保留原站 ID，重抓后不稳定 |
| `category` | 根据原站 `type` 区分“人员招聘”和“志愿者招募” | 派生值；原站明确为志愿者时进入志愿者分类，其余进入人员招聘 |
| `kind` | 将原站 `type` 和标题归一为 `全职`、`兼职`、`实习`、`志愿者` | 派生值；保留志愿者类型，不再降级为全职 |
| `role` | 对 `postName + title` 做招聘职能或志愿服务领域关键词匹配 | 推断值，不是原站类别的原样保留 |
| `servicePeriod` | 当前来源没有可确认字段 | 保持为空；志愿者“短期/长期”筛选不做猜测 |
| `time` | 根据 `updateTime` 计算“今天发布”等相对文案 | **语义错误**：来源只证明“更新”，因此保留在快照但不在职位卡片展示 |
| `publishedDays` | 当前时间减 `updateTime` | **命名错误**：实际是距更新时间的天数 |
| `title` | `【招聘/志愿者】{title} · {companyName}` | 根据归一后的类别拼接 |
| `summary` | `companyDomains`、`experience`、`educationValue` 拼接 | 摘要为站内生成，不是原站职位正文 |
| `org` | `companyName` | 来源直接字段，改了字段名 |
| `location` | `provinceName`、`cityName` 拼接；`jobModel === YCBG` 时写“远程办公” | 部分派生；远程编码尚待核验 |
| `salary` | 只有同时存在 `salaryBegin` 和 `salaryEnd` 才拼区间，否则写“面议” | 当前响应没有 `salaryEnd`；会丢失 `salaryBegin` 中已有的薪资区间 |
| `due` | 固定写“详见原帖” | 站内占位，不是来源字段 |
| `sourceName` | 固定写“中国发展简报·NGO招聘” | 用于内部追溯，不在职位卡片展示 |
| `url` | 用原站 `id` 构造详情页 URL | 派生值，可追溯到原帖 |

原始接口还提供 `welfare`、`otherWelfare`、`companyLogo`、`companyFoundedYear`、`companyScale` 等结构化字段，但当前快照转换没有保存它们。

### 当前边界与风险

1. **没有首次发布日期。** 目前只有更新时间，因此职位卡片不展示发布时间。
2. **快照不是自动更新。** 数据只在手动运行脚本时刷新，也没有在页面上展示采集时间。
3. **只采第一页 20 条。** 接口虽然提供分页和总量，脚本没有继续翻页。
4. **没有职位正文和截止日期。** 当前摘要由几个列表字段拼接，用户需要去原站查看完整信息。
5. **没有志愿服务周期。** 可以确认志愿者类别，但不能可靠区分短期和长期。
6. **来源 ID 没有保存。** 站内生成 ID 随排序改变，不适合去重、更新或增量同步。
7. **接口没有稳定性承诺。** 需要保留失败报告，并在字段变化时停止错误映射，而不是静默填充默认值。

## 其他已接入来源

以下字段记录基于 2026-10-08 的实时响应。各适配器都返回统一的 `JobItem` 形对象，但日期为空时使用 `publishedDays: 36500` 和“发布时间未知”，不会用抓取时间伪装发布日期。

### 中国公共招聘网

| 项目 | 当前值 |
| --- | --- |
| 列表入口 | `GET http://job.mohrss.gov.cn/cjobs/jobinfolist/listJobinfolist?pageNo=1&orderType=time&textfield={关键词}` |
| 关键词 | `社会工作`、`社工`、`公益` |
| 原始格式 | 服务端 HTML；`input#findjoblist` 的 `value` 是 HTML 实体编码的 JSON 数组 |
| 当前样本 | 2026-10-13 筛选、去重后 13 条 |
| 详情页 | `/cjobs/jobinfolist/cb21/showgw?id={acb200}` |

使用 `acb200`、`aca112`、`aab004`、`area_`、`aab302`、`acb240`、`acb241`、`acb242`、`acb22a`、`aca111_`。来源同时返回联系人和电话，但适配器不读取这些字段，并会从摘要中剔除联系方式。`s_ctime`、`s_uptime`、`s_aae397` 等日期没有足够明确的页面语义，因此不映射为发布时间或截止日期。

该平台大量内容不是公益行业岗位；适配器只保留机构名称、岗位名称、工种或描述能明确证明属于社会工作 / 公益服务的记录。关键词命中本身不构成保留条件。

### 壹基金·工作机会

| 项目 | 当前值 |
| --- | --- |
| 列表入口 | `GET https://onefoundation.cn/jobs/` |
| 原始格式 | 服务端 HTML；全职和实习分别位于 `form.job_form` |
| 当前样本 | 2026-10-13 共 4 条 |
| 可确认字段 | 职位名、全职 / 实习类别、城市、职责正文、详情 URL；部分实习岗位有补贴 |
| 日期 | 原站没有可确认的发布或截止日期 |

列表页已经包含职位正文。适配器只抽取职责摘要，不读取投递表单、姓名、邮箱、电话或简历上传字段。

### 美丽中国支教·成为员工

| 项目 | 当前值 |
| --- | --- |
| 列表入口 | `GET http://www.meilizhongguo.org/join-us` |
| 当前样本 | 6 条 |
| 可确认字段 | 部门、职位名、地点、详情 URL |
| 详情字段 | `blogPostMeta.state`、`publishedAt`、`publicUrl`，以及页面 meta 的标题和摘要 |
| 日期 | `publishedAt` 是 CMS 文章发布时间，不是岗位截止日期 |

适配器会用详情页标题和 `publicUrl` 校验列表卡片与详情是否配对；不一致时丢弃，避免把日期或正文配错岗位。该站从当前网络直连会重置连接，`pnpm scrape:jobs` 通过 Node 的 `--use-env-proxy` 遵循现有 `HTTP_PROXY` / `HTTPS_PROXY` 配置。

### ReliefWeb

| 项目 | 当前值 |
| --- | --- |
| 中国 feed | `GET https://reliefweb.int/jobs/rss.xml?advanced-search=(C58)` |
| 不限地点 feed | `GET https://reliefweb.int/jobs/rss.xml?view=unspecified-location` |
| 当前样本 | 2026-10-13 合计 20 条 |
| 可确认字段 | RSS `title`、`link` / `guid`、`pubDate`、`category`；描述中的机构、国家、截止日期和摘要 |
| 日期 | `pubDate` 为发布时间；`Closing date` 为截止日期 |

没有调用 `api.reliefweb.int`：该 API 需要预先获批的 `appname`。当前只读取官方公开 RSS，每个 feed 固定返回最新 20 条。

### NGO Job Board

| 项目 | 当前值 |
| --- | --- |
| RSS | `GET https://ngojobboard.org/wpjobboard/xml/rss/` |
| 当前样本 | 2026-10-13 共 8 条 |
| 可确认字段 | 标题、机构、地点、详情 URL、摘要、`pubDate`、岗位类型与领域分类 |
| 日期 | `pubDate` 为发布时间；没有结构化截止日期 |

Excel 中的域名写成了 `ngojobsboard.org`，当前有效站点是没有复数 `s` 的 `ngojobboard.org`。适配器只接受该域名下的 `/post/` URL，不请求条目详情；任何包含 `blackhole` 的防爬陷阱链接都会被直接丢弃。

## 接入其他来源时的记录要求

每个新来源都应在本文新增独立小节，至少记录：

1. 来源名称、页面 URL、接口或解析入口、核验日期；
2. 采集范围、分页方式、频率限制、访问或授权要求；
3. 原始响应字段、类型、空值情况、枚举样本；
4. 哪些字段是来源事实，哪些是适配器推导、分类或拼接；
5. 发布、更新、刷新、截止等时间字段各自的准确语义；
6. 来源记录 ID 和原始 URL，确保去重、更新与追溯；
7. 无法映射到统一模型的字段和值，不要静默丢弃或编造默认值；
8. 采集输出中的 `source`、`sourceItemId`、`sourceUrl`、`scrapedAt` 等来源元数据。

统一模型应只承诺跨来源真正共有且语义一致的部分。来源专有字段可以保留在来源数据中；无法确认的字段应为空并记录原因，而不是由展示需要反推成“事实”。

## 2026-10-08 已调查但尚未接入

| 来源 | 未接入原因 |
| --- | --- |
| 民政部社会组织人才服务和培训平台 | 数据匹配度高，但公开页面的 JSON 接口要求按日期生成 `Web-Secret-Key`；当前不复刻该请求签名。 |
| NGO 英才网 | 代理返回 502，直连被重置。 |
| 社工中国网 | 页面可抓，但最新招聘更新频率很低，暂不增加低价值详情请求。 |
| 中国大学生志愿者招募网 | 当前跳转到“站点已过期”。 |
| 实习僧 | 页面可访问，但结构化 SSR 数据是可执行 JavaScript；当前不执行第三方页面脚本，也不破解字体混淆。 |
| 猎聘、BOSS 直聘 | robots 禁止带查询参数的搜索页，且接口需要客户端签名或浏览器检测。 |
| 智联、前程无忧、青团社 | 返回验证码、WAF 或安全校验页。 |
| 国聘 | 岗位接口要求客户端签名。 |
| 刺猬 CIWEI | TLS 证书过期，现有站点没有可确认的公开岗位列表。 |
| 为中国而教 | 只有长期品牌项目和年度招募文章，没有当前结构化职位列表。 |
| 中国乡村发展基金会 | 招聘列表结构存在，但当前为 0 条。 |
| 恩派公益、中华慈善总会、联劝网、阿里巴巴公益基金会 | 官网没有当前公开招聘列表。 |
| 中国青少年发展基金会 | 有公开 JSON API，但当前公告均已截止；不把历史公告混入当前职位快照。 |
| 深圳市社会公益基金会 | 静态列表没有日期，详情在受验证保护的微信文章中，无法判断是否仍在招。 |
| 中国红十字基金会 | 只有无日期的长期志愿参与说明，不是职位列表。 |
| Devex、DevelopmentAid、UN Volunteers | 自动请求被 403 / WAF / Incapsula 拦截。 |
| UNjobs | robots 对普通客户端禁止全站抓取。 |
| Idealist、Impactpool | 服务条款明确禁止自动抓取，未接入。 |
| DevNetJobs、CharityJob | 技术上可抓；前者需要从 sitemap 逐条拉详情，后者以英国本地岗位为主，留作后续低优先级来源。 |

这些状态只代表本次少量实时探测，不代表来源永久不可用。重新接入前必须再次核验 robots、使用条款、访问条件、字段、日期语义和转载边界。
