// 招聘岗位正文的结构化提取（公益垂类）。
// 字段口径与前端筛选词表一致（jobKinds / jobRoles）。

enum JobGroup {
  P @description("项目与服务：一线执行与服务交付")
  R @description("资源与筹资：筹款、捐赠人服务、资源拓展")
  C @description("合规与ESG：法务合规、内控、ESG披露与评级")
  S @description("战略与研究：政策倡导、行业研究、战略规划")
  O @description("运营与支持：传播、人力、财务行政、产品技术")
}

enum JobSubCategory {
  P1 @description("社会工作与社区服务：一线社工、社区工作者、网格员")
  P2 @description("公益项目执行：项目官员/经理、监测评估、志愿者管理")
  P3 @description("企业CSR")
  P4 @description("企业ESG：ESG专员、碳管理、环境工程")
  R1 @description("公益筹资与拓展：筹款、月捐、捐赠人服务、资源合作")
  C1 @description("公益组织合规：合规、法务、内控")
  C2 @description("ESG信息披露与报告")
  C3 @description("ESG评级与合规：评级分析、供应链审核、DEI")
  S1 @description("政策与倡导：政策研究、政府关系、公共事务")
  S2 @description("行业研究与咨询：行业研究、影响力评估、咨询顾问")
  S3 @description("战略规划与管理：机构战略、秘书长/副秘书长、总干事")
  O1 @description("传播与品牌：传播、品牌、新媒体、内容")
  O2 @description("人力与组织发展：HR、DEI、组织发展")
  O3 @description("财务与行政：财务、会计、出纳、行政")
  O4 @description("产品与技术：产品经理、数据、技术开发")
}

enum JobLevel {
  L1 @description("入门执行 0-2年：助理/Assistant/见习/实习/储备，在指导下执行，无下属")
  L2 @description("独立执行 2-4年：专员/项目官员/Officer/分析师，独立执行但不正式管理团队或模块")
  L3 @description("模块主管 4-7年：主管/项目经理/高级专员，明确管理小团队或对完整模块结果负责")
  L4 @description("中层管理 7-10年：总监/部门总监/高级经理，跨模块统筹、预算与风险")
  L5 @description("高层管理 10-15年：秘书长/执行长/CEO/Head，机构层面运营与战略执行")
  L6 @description("决策层 15年+：理事长/董事会主席/治理层，组织治理与重大决策")
}

enum Education {
  DOCTOR    @description("博士")
  MASTER    @description("硕士")
  BACHELOR  @description("本科")
  COLLEGE   @description("大专")
  TECHNICAL @description("中专/中技")
  ANY       @description("不限或未写明")
}

enum OrgType {
  FOUNDATION    @description("基金会")
  CHARITY_ASSOC @description("慈善会/慈善联合会/红十字会")
  MINFEI        @description("民办非企业单位")
  COMPANY       @description("企业（含企业基金会发起方的企业主体）")
  SOCIAL_WORK   @description("社工机构")
  ASSOCIATION   @description("社会团体/协会/研究会")
  INTERNATIONAL @description("国际NGO/国际组织")
  OTHER         @description("其他")
}

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
  title string @description("仅岗位名称；保留岗位方向等括号备注，去掉招聘字样、机构或项目品牌、地点及宣传文案")
  kind JobKind
  job_group JobGroup
  sub_category JobSubCategory
  level JobLevel
  education Education
  org_type OrgType
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
      志愿服务类岗位也收录。招聘主体一旦属于前述公益/社会组织，其财务、行政、后勤、党务等支持岗位也必须收录。
    排除：商业公司（有限公司、咨询、文化发展、猎头、劳务派遣）发布的岗位，以及一般招聘网站中与公益/社会工作无关的
      行政后勤或生产岗位；申请流程说明、FAQ、面试经验等不是职位发布的页面。

    ## 抽取规则
    - title：只保留岗位名称，可保留原始标题中已有、且说明岗位方向的括号备注。删除「招聘/招募/诚聘」等招聘字样、机构或项目品牌、
      城市/省份等地点、日期、薪资、人数、分隔符及宣传文案；不要改写岗位名称，不得新增原始标题中没有的括号备注、级别或岗位属性。
      示例：
      「童年一课招聘教学部项目官员（阅读方向）」→「项目官员（阅读方向）」
      「招聘｜罕见病社群服务项目主管（筹资传播方向）-济南」→「罕见病社群服务项目主管（筹资传播方向）」
      「招聘传播主管｜不止罕见的故事待你继续讲述」→「传播主管」
      「招聘｜合作发展总监/主管-北京」→「合作发展总监/主管」
      「爱童行项目助理 广州」→「项目助理」
    - kind：志愿者/志愿服务 → VOLUNTEER；实习生 → INTERN；兼职 → PARTTIME；顾问/咨询类短期外部专家 → PARTTIME；其余 → FULLTIME。
    - role：按岗位职责归类到最接近的一类。
    - job_group / sub_category：按岗位职责归到职业群（P/R/C/S/O）及子类。注意区分：为公益机构做财务 → O3；
      企业的 ESG 披露岗 → C2；筹款与捐赠人维护 → R1；机构日常运营、团队与绩效管理 → O2，
      即使岗位名称是「运营总监」且职责包括战略分解，也不是 S3；只有以制定机构整体战略为主要职责时才归 S3。
    - level：综合岗位名称、管理范围、职责和年限判定，不得因正文出现单个关键词直接升级。
      先判定明确的高层级：组织治理与重大决策 → L6；机构整体运营并向董事会/治理层汇报、对全机构结果负责 → L5；
      部门级或多个模块管理，且有正式团队、预算、风险或跨部门决策权 → L4。只负责单一职能、任务区或小团队通常最高 L3，
      即使职责覆盖该职能的预算、审计、内控等完整流程也不自动升级为 L4。
      L1-L3 按以下顺序判定：
      1. 岗位名称是「助理/Assistant/见习/实习/储备」时默认 L1；但名称虽为助理，若要求至少 2 年专业经验、
         独立承担药物警戒/法务/财务等专业交付且不是一般行政辅助，可判 L2。实习生始终为 L1。
      2. 岗位名称是「专员/官员/Officer/协调员/分析师」时默认 L2；只有名称含「高级/资深/主管/经理」或正文明确写有正式团队管理、
         绩效/排班权、完整模块预算与结果责任时才可判 L3。
      3. 名称为「经理/主管/Senior/高级」通常判 L3；「发展部经理、人力资源经理」等部门/完整职能经理，即使最低年限为 2 年也判 L3，
         「国际发展经理」要求 3 年并独立负责国际项目模块时也判 L3。只有「产品经理」等本身常作为个人贡献者职系的称谓，且只要求约 2 年经验、
         没有正式下属、绩效、预算或模块结果权，实际只是需求、进度、供应商交付时，才可判 L2。
         「负责人/总监」只有明确负责区域中心、部门或多个模块及正式团队时才判 L4。
      4. 「管理技术员工及承包商、供应商协调」不等于正式团队管理；必须区分外部承包商/供应商协调与对正式下属的招聘、绩效、排班权。
      5. 「专职工作者」是独立正式岗位而非助理，承担完整的党务、党员管理、会议/调研/档案等职责时至少判 L2。
      6. 「负责、运营、维护、撰写、培训志愿者、沟通协调、质量支持、质量改进」只描述执行工作，不能单独作为 L2/L3 的升级依据。
      7. 年限用于校验而非覆盖岗位称谓：0-2年倾向 L1，2-4年倾向 L2，4-7年倾向 L3，7-10年倾向 L4，10-15年倾向 L5，15年+倾向 L6。
      示例：「项目官员（阅读方向）」要求 1-3 年、无正式下属，即使负责培训督导和质量改进也判 L2；
      「项目助理」即使负责新媒体运营、捐赠人维护并协助志愿者团队，也判 L1；「数字化产品经理」仅要求 2 年、
      无正式下属而负责需求和供应商交付 → L2；「国际发展经理」要求 3 年并对完整项目模块负责 → L3；
      「前线后勤人员」要求 2 年且只是协调技术员工/承包商 → L2；「海外前线财务统筹人员」负责单一财务职能和小团队 → L3。
      上述校准案例的结论优先于通用规则：标题恰为「国际发展经理」且要求 3 年时必须判 L3；
      无国界医生「前线后勤人员」即使正文写管理技术员工和承包商，仍必须判 L2，不得因这句话升级为 L3。
    - education：正文明确写了学历要求才取对应值（"本科及以上"→ BACHELOR）；没写 → ANY。
    - org_type：按招聘主体性质归类。
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
