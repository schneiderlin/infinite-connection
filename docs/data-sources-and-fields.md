# 数据来源与结构化字段记录

本文记录当前代码**实际采集了哪些来源、原站能确认提供哪些结构化字段，以及这些字段如何进入站内模型**。

不同来源的原始结构不要求一致。每个来源应保留独立的来源契约和适配逻辑，再映射到站内统一字段；不得把推导字段写成原站直接提供的事实。

## 当前数据来源概览

| 模块 | 来源 | 接入状态 | 当前页面数据 |
| --- | --- | --- | --- |
| 人力资源 / 招聘 | [中国发展简报·NGO 招聘](https://www.chinadevelopmentbrief.org.cn/jobs.html) | 已接入列表接口 | 20 条抓取快照 + 8 条 mock 数据 |
| 项目动态 | 无 | 未接入 | 静态 mock 数据 |
| 资金 & 物资 | 无 | 未接入 | 静态 mock 数据 |
| 能力工具 | 无 | 未接入 | 静态 mock 数据 |

候选招聘来源来自 [`references/公益招聘网站信息库.xlsx`](./references/公益招聘网站信息库.xlsx)。候选清单不代表已经接入，也不代表链接、采集许可或字段仍然有效。

## 当前采集链路

当前没有常驻爬虫、定时任务、数据库或 Next.js 后端接口。采集是手动生成静态快照：

```text
pnpm scrape:jobs
  → 请求来源列表接口
  → 来源专用转换逻辑
  → src/lib/jobs-scraped.json
  → JobsBrowser 在构建/开发时静态 import
  → /hr 展示抓取数据和 mock 数据
```

- 脚本：[`scripts/scrape-jobs.mjs`](../scripts/scrape-jobs.mjs)
- 快照：[`src/lib/jobs-scraped.json`](../src/lib/jobs-scraped.json)
- 页面接入：[`src/components/JobsBrowser.tsx`](../src/components/JobsBrowser.tsx)
- 每次只请求每个来源的前 20 条；启动 `pnpm dev` 不会自动刷新。
- 快照本身没有 `scrapedAt`、来源版本或本次采集报告等元数据。

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
| `kind` | 接受完全匹配的 `全职`、`兼职`、`实习`，否则按标题猜测 | 派生值；原站的 `实习生`、`志愿者`会被错误降级或归类 |
| `role` | 对 `postName + title` 做关键词匹配 | 推断值，不是原站类别的原样保留 |
| `time` | 根据 `updateTime` 计算“今天发布”等相对文案 | **语义错误**：来源只证明“更新”，不能称为“发布” |
| `publishedDays` | 当前时间减 `updateTime` | **命名错误**：实际是距更新时间的天数 |
| `title` | `【招聘】{title} · {companyName}` | 拼接值 |
| `summary` | `companyDomains`、`experience`、`educationValue` 拼接 | 摘要为站内生成，不是原站职位正文 |
| `org` | `companyName` | 来源直接字段，改了字段名 |
| `location` | `provinceName`、`cityName` 拼接；`jobModel === YCBG` 时写“远程办公” | 部分派生；远程编码尚待核验 |
| `salary` | 只有同时存在 `salaryBegin` 和 `salaryEnd` 才拼区间，否则写“面议” | 当前响应没有 `salaryEnd`；会丢失 `salaryBegin` 中已有的薪资区间 |
| `due` | 固定写“详见原帖” | 站内占位，不是来源字段 |
| `sourceName` | 固定写“中国发展简报·NGO招聘” | 来源标识 |
| `url` | 用原站 `id` 构造详情页 URL | 派生值，可追溯到原帖 |

原始接口还提供 `welfare`、`otherWelfare`、`companyLogo`、`companyFoundedYear`、`companyScale` 等结构化字段，但当前快照转换没有保存它们。

### 当前边界与风险

1. **没有首次发布日期。** 目前只有更新时间，页面显示“今天发布”是不准确的。
2. **快照不是自动更新。** 数据只在手动运行脚本时刷新，也没有在页面上展示采集时间。
3. **只采第一页 20 条。** 接口虽然提供分页和总量，脚本没有继续翻页。
4. **没有职位正文和截止日期。** 当前摘要由几个列表字段拼接，用户需要去原站查看完整信息。
5. **来源类型与站内枚举不一致。** `实习生`、`志愿者`等来源值无法无损进入当前 `JobItem.kind`。
6. **来源 ID 没有保存。** 站内生成 ID 随排序改变，不适合去重、更新或增量同步。
7. **接口没有稳定性承诺。** 需要保留失败报告，并在字段变化时停止错误映射，而不是静默填充默认值。

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

## 已调查但尚未接入

| 来源 | 当前状态 |
| --- | --- |
| ReliefWeb | API 需要申请获批的 `appname`；获批前未接入 |
| NGO 英才网 | 调查时连接超时，未接入 |
| NGO Job Board | 调查时连接超时，未接入 |

这些状态只代表最近一次实现调查，不代表来源永久不可用。重新接入前需要再次核验访问条件、字段和转载边界。
