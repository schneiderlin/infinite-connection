// 公益资助正文的结构化提取（替代原 scrape-fundings.mjs 的 regex 提取）。
// 字段口径见各属性的 description，修改后运行 `pnpm baml:generate` 重新生成客户端。

enum DeadlineKind {
  EXPLICIT   @description("正文或来源接口明确给出了申报/报名截止日期")
  ROLLING    @description("滚动招募、常年接受申请、名额有限招满即止")
  LONG_TERM  @description("长期有效、无固定截止")
  NONE       @description("正文完全没有提及截止时间")
}

enum AmountScope {
  PER_PROJECT  @description("单个项目 / 每家机构可获得的资助额度")
  TOTAL_POOL   @description("资金池总额、历年累计、总预算等非单项目金额")
}

enum SupportType {
  MONEY    @description("资金资助")
  IN_KIND  @description("物资、设备、图书、课程名额等非现金支持")
}

enum FundingType {
  FOUNDATION_GRANT     @description("慈善会/基金会资助")
  PARTNER_RECRUITMENT  @description("公益项目伙伴招募")
  VENTURE              @description("公益创投、项目大赛")
  GOVERNMENT           @description("政府资助、政府购买服务")
  CSR                  @description("企业CSR")
  ACADEMIC             @description("高校/研究机构")
  NGO_GRANT            @description("公益组织资助")
  MATERIAL             @description("物资资助")
}

enum DurationBucket {
  WITHIN_6M        @description("项目实施周期 6 个月以内")
  SIX_TO_TWELVE_M  @description("6-12 个月")
  ONE_TO_TWO_Y     @description("1-2 年")
  OVER_TWO_Y       @description("2 年以上")
  UNKNOWN          @description("正文未说明项目实施周期")
}

enum Field {
  RURAL_EDU    @description("乡村教育")
  ECO          @description("生态环保")
  LIVELIHOOD   @description("产业生计")
  CULTURE      @description("文化传承")
  TALENT       @description("人才培育")
  DISABILITY   @description("残障融合")
  CHILD        @description("儿童保护")
  YOUTH        @description("青少年发展")
  ELDERLY      @description("老龄关怀")
  HEALTH       @description("医疗健康")
  MENTAL       @description("心理健康")
  WOMEN        @description("女性关怀")
  COMMUNITY    @description("社区营造")
  EMERGENCY    @description("应急救援")
  VOLUNTEER    @description("志愿服务")
  ORG_SUPPORT  @description("社会组织支持")
  INNOVATION   @description("创新探索")
  OTHER        @description("其他")
}

class FundingExtraction {
  is_relevant bool @description("是否是面向公益组织/社工机构/公益团队的资金、物资或课程类支持机会")
  reject_reason string? @description("不相关时的一句话原因（如：政府采购公告、面向个人的招募）")
  org string? @description("资助方/招募方机构全称；正文找不到时返回 null")
  deadline string? @description("申报截止日期，YYYY-MM-DD；只在正文明确写出时返回，绝不推测或编造")
  deadline_kind DeadlineKind
  amount_wan float? @description("单个项目/每家机构可获得的资助金额，单位万元；只有口径是单项目额度时才返回")
  amount_scope AmountScope? @description("金额口径；无金额时返回 null")
  support_type SupportType
  funding_type FundingType
  field Field
  region string? @description("项目实施/面向地区：全国，或省份名（如广东省）；找不到返回 null")
  duration DurationBucket @description("项目实施周期（不是申报窗口）；正文未说明时返回 UNKNOWN")
  summary string @description("2-3 句中文摘要：资助方、支持内容、对象、额度与截止时间（若正文有）")
}

function ExtractFunding(
  title: string,
  org_hint: string,
  published_date: string,
  source_deadline_hint: string,
  body: string
) -> FundingExtraction {
  client MiniMax
  prompt #"
    你是公益行业信息抽取助手。下面是一条从公益资讯网站抓取的候选信息，请判断它是否值得收录，并抽取结构化字段。

    ## 收录标准
    只收录【面向公益组织 / 社会组织 / 社工机构 / 公益团队】的资金、物资或课程类支持机会（资助、伙伴招募、公益创投、项目征集等）。
    排除（is_relevant=false）：政府采购/招标/中标公告、公众筹款或捐赠倡导、面向个人/学生/患者/家庭的招募、
    会议/沙龙/论坛/培训报名、案例或作品征集、纯新闻报道、结果公示/名单。

    ## 抽取规则
    - deadline：只有正文明确写出申报/报名截止日期才返回（YYYY-MM-DD），绝不推测、绝不编造。
      来源接口提供的截止日期（若不为空）是可信的，可以直接采用。
      正文写"滚动招募/常年接受/招满即止"→ deadline_kind=ROLLING；写"长期有效"→ LONG_TERM；完全没提 → NONE。
    - amount_wan：只有"单个项目/每家机构可获得"的额度才返回（万元）。
      资金池总额、历年累计、项目总预算属于 TOTAL_POOL，此时 amount_wan 返回 null。
      "服务 10 万人次"之类的服务量不是金额。正文没有明确金额 → 两者都返回 null。
    - duration：指项目实施周期（如"项目周期一年"），不是申报窗口；正文未说明 → UNKNOWN。
    - region：项目实施或面向的地区。全国性的返回"全国"，否则返回省份名（如"广东省"）。
    - summary：2-3 句中文，说明谁资助/招募、支持什么、面向谁、额度和截止时间（正文有才写）。

    ## 输入
    标题：{{ title }}
    机构线索：{{ org_hint }}
    发布日期：{{ published_date }}
    来源接口提供的截止日期：{{ source_deadline_hint }}
    正文：
    {{ body }}

    {{ ctx.output_format }}
  "#
}
