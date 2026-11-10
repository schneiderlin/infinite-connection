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
  CP     @description("儿童与青少年")
  AG     @description("长者与残障")
  ED     @description("教育与能力建设")
  EN     @description("环境与气候")
  AN     @description("动物福利")
  CM     @description("社区发展与减贫")
  EQ     @description("社会公平与权利")
  CA     @description("文化艺术与体育")
  CR     @description("企业责任与可持续")
  SS     @description("行业支持与基础设施")
  OTHER  @description("其他")
}

enum Issue {
  CP01 @description("儿童保护（防虐待、防拐卖、未成年人保护）")
  CP02 @description("困境儿童关爱（孤儿、留守儿童、大病儿童）")
  CP03 @description("儿童教育与发展（早期发展、课后托管）")
  CP04 @description("青少年发展（心理健康、职业规划）")
  AG01 @description("老年服务（居家养老、社区养老、安宁疗护）")
  AG02 @description("残障融合（心智障碍、视障听障、无障碍）")
  AG03 @description("康复与照护（康复训练、长期照护）")
  ED01 @description("教育公平（教育资源均衡、助学）")
  ED02 @description("乡村教育")
  ED03 @description("职业教育与就业能力")
  ED04 @description("终身学习（成人扫盲、数字素养）")
  EN01 @description("环境保护（污染防治、垃圾分类）")
  EN02 @description("气候变化与减碳（碳中和、清洁能源）")
  EN03 @description("自然生态保护（森林、海洋、生物多样性）")
  AN01 @description("伴侣动物与流浪动物（领养、TNR）")
  AN02 @description("野生动物保护")
  AN03 @description("农场动物与实验动物福利")
  CM01 @description("乡村振兴（产业、人才、文化、生态）")
  CM02 @description("城市社区营造（邻里、公共空间）")
  CM03 @description("减贫与生计（小额信贷、就业帮扶）")
  CM04 @description("灾害救援与重建")
  EQ01 @description("性别平等（妇女赋能、反暴力）")
  EQ02 @description("多元包容（LGBTQ+、少数族群、DEI）")
  EQ03 @description("劳工权益（农民工、灵活就业保障）")
  EQ04 @description("健康与医疗可及（罕见病、公共卫生）")
  EQ05 @description("法律救助与司法公正")
  CA01 @description("文化艺术（美育、艺术普及）")
  CA02 @description("文化遗产保护（非遗、古建）")
  CA03 @description("体育公益（残障运动、乡村体育）")
  CR01 @description("CSR（企业社会责任、企业基金会、公益慈善）")
  CR02 @description("ESG（环境、社会、治理信息披露与合规）")
  CR03 @description("责任投资与影响力投资（绿色金融、SRI）")
  SS01 @description("公益行业赋能（组织能力、人才培养）")
  SS02 @description("志愿服务（志愿者管理、时间银行）")
  SS03 @description("公益金融与慈善信托")
  SS04 @description("研究、倡导与行业平台")
  OTHER @description("其他")
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
  issue Issue @description("二级议题，归到最贴近的一个；判断不了返回 OTHER")
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
    - field / issue：按这次机会直接提供的支持及用途归类，不按资助方名称、机构日常使命或申请机构原有服务领域归类。
      先区分两类伙伴招募：
      1. 如果申请方获得的是开放项目库、联合筹款、资源链接、传播、能力建设、伙伴网络或在地执行网络，
         且没有被要求交付一种明确的终端服务，归 SS / SS01（行业支持与基础设施 / 公益行业赋能）。
      2. 如果申请方获得特定课程包、设备或项目方案，并被要求向明确人群交付一种具体服务，按最终服务对象和内容归类。
      不要因标题含「残疾人基金会」就归残障，也不要因正文提到社区落地就归社区发展。
      心理治疗、抑郁症干预、医疗保险和医院医疗空间归 EQ / EQ04；只有明确面向残障人士的融合、康复或长期照护才归 AG。
      面向儿童的科普教育、玩乐和成长活动仍归 CP / CP03，即使课程主题涉及健康或医疗。
      校准示例：开放议题项目库、议题伙伴深度合作、公益伙伴联合劝募、困境行善者在地伙伴网络 → SS / SS01；
      向合作方提供课程包并要求为 7-12 岁儿童开展活动、儿童健康科普教育 → CP / CP03；向医院捐建抗抑郁空间 → EQ / EQ04。
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
