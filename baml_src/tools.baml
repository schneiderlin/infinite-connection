// 能力工具（学习资源）正文的结构化提取。
// 用于修复 CDB 僵尸数据（错误日期/模板摘要）并重新分类。

enum ToolCategory {
  TRAINING       @description("培训课程：可报名学习的课程、研修班、训练营")
  SALON          @description("行业沙龙会议：沙龙、研讨会、论坛、年会等活动信息")
  TEMPLATE       @description("公益工具模板库：可直接使用的模板、表格、清单、工具包")
  REPORT         @description("行业报告：研究报告、年刊、指南、手册")
  STANDARD       @description("行业标准：法律法规、标准、办法、规范、指引")
  EXPERIENCE     @description("同行经验文章：方法、经验、案例、实务文章")
  INTERNATIONAL  @description("国际经验：国际公益实践、译介、海外案例")
  OTHER          @description("其他与公益能力建设相关的内容")
}

enum ToolDomain {
  PM         @description("项目管理")
  FIN        @description("财务")
  COMMS      @description("传播")
  FUNDRAISE  @description("筹款")
  TEAM       @description("团队管理")
  GENERAL    @description("综合素养")
  DEGREE     @description("学位课程")
  OTHER      @description("其他")
}

enum ToolFormat {
  ONLINE   @description("线上（在线课程、直播、线上会议）")
  OFFLINE  @description("线下（线下课程、会议、活动）")
  DOWNLOAD @description("可下载的资料、模板、报告文件")
}

enum ToolPeriod {
  M1       @description("学习周期 1 个月内")
  M6       @description("6 个月内")
  M6_12    @description("6-12 个月")
  Y1P      @description("1 年期以上")
  UNKNOWN  @description("学习周期未知或不适用（文章、报告等非课程类）")
}

class ToolExtraction {
  is_relevant bool @description("是否属于面向公益从业者的学习资源/工具/课程/资料")
  reject_reason string? @description("不相关时的一句话原因（如：纯新闻报道、活动花絮、个人故事）")
  category ToolCategory
  domain ToolDomain
  format ToolFormat? @description("交付形式；纯阅读类文章返回 null")
  period ToolPeriod @description("学习周期；只有培训课程类才可能明确，其余返回 UNKNOWN")
  is_free bool @description("是否免费；正文未提及费用时按免费处理")
  org string? @description("内容出品方/主办方机构全称；找不到返回 null")
  summary string @description("2-3 句中文摘要：内容是什么、适合谁、能学到/获得什么")
}

function ExtractTool(
  title: string,
  published_date: string,
  body: string
) -> ToolExtraction {
  client MiniMax
  prompt #"
    你是公益行业内容编辑。下面是一条从中国发展简报抓取的资讯，请判断它是否属于"能力工具"板块，并抽取结构化字段。

    ## 收录标准
    收录（is_relevant=true）：面向公益组织/从业者的课程培训、工具模板、行业报告、法规标准、
      实务方法与经验文章、案例研究、国际经验译介、行业沙龙/研讨会/会议信息。
    排除：纯新闻报道、活动花絮与合影回顾、个人故事/人物特写、与公益能力建设无关的内容。

    ## 抽取规则
    - category：八类归一（见枚举描述）。
    - domain：内容主要服务的能力领域。
    - format：在线课程/直播 → ONLINE；线下课程/会议 → OFFLINE；可下载的资料/模板/报告 → DOWNLOAD；
      普通阅读类文章返回 null。
    - period：只有培训课程类按正文判断学习周期；正文没说或非课程类 → UNKNOWN。
    - is_free：正文未提费用 → true。
    - summary：2-3 句中文，说明内容是什么、适合谁、能学到或获得什么。

    ## 输入
    标题：{{ title }}
    发布日期：{{ published_date }}
    正文：
    {{ body }}

    {{ ctx.output_format }}
  "#
}
