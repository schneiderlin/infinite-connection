// 招聘岗位正文的结构化提取（公益垂类）。
// 字段口径与前端筛选词表一致（jobKinds / jobRoles）。

enum JobKind {
  FULLTIME   @description("全职")
  PARTTIME   @description("兼职")
  INTERN     @description("实习")
  VOLUNTEER  @description("志愿者（无薪或补贴性质的志愿服务）")
  CONSULTANT @description("顾问")
}

enum JobRole {
  PM          @description("项目官员：项目执行、项目管理、项目协调")
  COMMS       @description("传播：品牌、媒体、新媒体运营、内容")
  FIN         @description("财务：会计、出纳、审计、财务管理")
  HR          @description("人力资源")
  EXEC        @description("高级管理：秘书长、总监、负责人、主任")
  SUPERVISOR  @description("督导：社工督导、专业督导")
  FUNDRAISE   @description("筹款：筹资、捐赠人服务、资源拓展")
  LEGAL       @description("法务")
  RESEARCH    @description("研究：研究员、评估、监测")
  SOCIAL_WORK @description("社工：一线社会工作者、社工助理")
  OTHER       @description("其他")
}

class JobExtraction {
  is_relevant bool @description("招聘主体是公益组织/社会组织/基金会/社工机构/协会/国际组织/公益项目，或岗位内容明确是社会工作/志愿服务/公益项目执行")
  reject_reason string? @description("不相关时的一句话原因（如：商业公司、猎头劳务、与公益无关的行政岗）")
  kind JobKind
  role JobRole
  org string? @description("招聘机构全称；找不到返回 null")
  location string? @description("工作地点，规范为 省·市（如 广东省·深圳市）、直辖市（如 北京市）、线上；多地用 / 分隔；找不到返回 null")
  salary string? @description("薪资，规范为 面议、N-M元/月、N元/天、志愿服务 之一；正文没写返回 null")
  deadline string? @description("应聘截止日期 YYYY-MM-DD；只在正文明确写出时返回，绝不推测或编造")
  summary string @description("2-3 句中文：什么机构、岗位做什么、核心要求")
}

function ExtractJob(
  title: string,
  org_hint: string,
  source_name: string,
  body: string
) -> JobExtraction {
  client MiniMax
  prompt #"
    你是公益行业招聘编辑。下面是一条职位信息，请判断它是否属于公益招聘，并抽取结构化字段。

    ## 收录标准
    收录（is_relevant=true）：公益组织、社会组织、基金会、社工机构、协会、国际公益/人道组织、
      公益项目的招聘（全职/兼职/实习/志愿者/顾问）；政府或事业单位发布的社会工作、
      志愿服务类岗位也收录。
    排除：商业公司（有限公司、咨询、文化发展、猎头、劳务派遣）、与公益/社会工作无关的
      行政后勤或生产岗位；申请流程说明、FAQ、面试经验等不是职位发布的页面。

    ## 抽取规则
    - kind：志愿者/志愿服务 → VOLUNTEER；实习生 → INTERN；顾问 → CONSULTANT；兼职 → PARTTIME；其余 → FULLTIME。
    - role：按岗位职责归类到最接近的一类。
    - location：规范为"省·市"或直辖市或"线上"；国外城市保留原文城市名；多地用 / 分隔。
    - salary：正文写了具体数字 → "N-M元/月"或"N元/天"；写"面议"→ 面议；志愿者无薪 → 志愿服务；没写 → null。
    - deadline：只在正文明确写出应聘/报名截止日期时返回（YYYY-MM-DD），绝不推测、绝不编造。
    - summary：2-3 句中文，说明什么机构、岗位做什么、核心要求（学历/经验/地点）。

    ## 输入
    标题：{{ title }}
    机构线索：{{ org_hint }}
    来源：{{ source_name }}
    正文：
    {{ body }}

    {{ ctx.output_format }}
  "#
}
