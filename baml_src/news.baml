// 公益资讯/动态的结构化提取（与资助提取同一 MiniMax client，枚举全局共享）。

enum NewsType {
  PROJECT_PROGRESS @description("项目进展、成果发布、阶段性成果")
  ORGANIZATION_NEWS @description("机构动态、人事、战略发布")
  EVENT_REPORT      @description("会议、论坛、沙龙、颁奖等活动报道")
  INDUSTRY_INSIGHT  @description("行业观察、报告发布、研究结论")
  POLICY_RELEASE    @description("政策、规定、指引发布")
  RELIEF_RESPONSE   @description("救灾、应急救援、物资捐赠现场")
  OTHER             @description("其他公益资讯")
}

class NewsExtraction {
  is_relevant bool @description("是否值得作为公益行业动态收录（项目进展、机构行动、行业报告、政策发布、救灾响应等）")
  reject_reason string? @description("不相关时的一句话原因（如：个人求助、商品广告、纯娱乐内容）")
  org string? @description("报道主体机构名称；找不到返回 null")
  news_type NewsType
  field Field? @description("对应的一级领域；判断不了返回 null")
  issue Issue? @description("二级议题；判断不了返回 null")
  summary string @description("2-3 句中文摘要：发生了什么、涉及谁、有什么进展或影响")
}

function ExtractNews(
  title: string,
  source_name: string,
  published_date: string,
  body: string
) -> NewsExtraction {
  client MiniMax
  prompt #"
    你是公益行业资讯编辑。下面是一条从公益机构官网抓取的资讯，请判断是否值得收录，并抽取结构化字段。

    ## 收录标准
    收录（is_relevant=true）：项目进展与成果发布、机构战略/人事/年度报告、行业报告与研究发布、
      公益会议论坛的实质信息（议题、结论、发布内容）、政策与行业指引发布、救灾与应急响应进展。
    排除：个人求助、商品促销与广告、纯图片/视频花絮、与公益无关的社会新闻、纯募捐劝捐倡导。

    ## 抽取规则
    - news_type：按上面的六类归类。
    - field / issue：对应的一级领域和二级议题（从枚举里选），判断不了就给 null。
    - org：报道主体机构全称。
    - summary：2-3 句中文，说明发生了什么、涉及哪些机构、有什么进展或影响。

    ## 输入
    标题：{{ title }}
    来源：{{ source_name }}
    发布日期：{{ published_date }}
    正文：
    {{ body }}

    {{ ctx.output_format }}
  "#
}
