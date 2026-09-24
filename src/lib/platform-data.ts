// 平台四个模块的假数据（Mock），后续对接后端时替换为接口数据。
// 排序/筛选需要的结构化字段（region、amountWan、publishedHours 等）
// 在接后端时可直接对应到接口字段。

/* ---------- 项目动态（参考微博信息流） ---------- */

export type UpdateMedia = {
  icon: string;
  tone: string;
  caption: string;
};

export type UpdateItem = {
  id: number;
  kind: "最新动态" | "项目主页" | "志愿活动" | "行业活动";
  field: string;
  region: string;
  rating: number;
  publishedHours: number;
  time: string;
  source: string;
  org: string;
  title: string;
  content: string;
  hashtags: string[];
  location: string;
  period: string;
  media?: UpdateMedia;
  shares: number;
  comments: number;
  likes: number;
  helps: number;
};

export const updates: UpdateItem[] = [
  {
    id: 1,
    kind: "最新动态",
    field: "环保生态",
    region: "西北",
    rating: 4.8,
    publishedHours: 3,
    time: "3小时前",
    source: "来自 项目主页",
    org: "蚂蚁森林 × 中国绿化基金会",
    title: "阿拉善左旗梭梭种植基地 · 第32次更新",
    content:
      "9月7日完成春季梭梭补植3,200株，新铺设滴灌管线2.4公里。本季累计种植1.8万株，覆盖退化土地380亩。感谢每一位线上浇水的你。",
    hashtags: ["梭梭树", "荒漠化防治"],
    location: "内蒙古·阿拉善",
    period: "长期",
    media: { icon: "🌳", tone: "mint", caption: "基地实拍 · 6张图" },
    shares: 234,
    comments: 86,
    likes: 1200,
    helps: 312,
  },
  {
    id: 2,
    kind: "最新动态",
    field: "乡村教育",
    region: "全国",
    rating: 4.9,
    publishedHours: 28,
    time: "昨天",
    source: "来自 项目主页",
    org: "美丽中国 Teach For China",
    title: "2026-2028届准老师招募 · 宣讲会回顾",
    content:
      "本季累计在23所高校举办宣讲会，吸引1,820位应届毕业生报名，9月底截止初筛。期待优秀的你加入两年支教。",
    hashtags: ["支教招募", "乡村教育"],
    location: "全国23所高校",
    period: "长期项目",
    shares: 187,
    comments: 142,
    likes: 856,
    helps: 204,
  },
  {
    id: 3,
    kind: "项目主页",
    field: "残健融合",
    region: "京津冀",
    rating: 4.7,
    publishedHours: 52,
    time: "2天前",
    source: "来自 项目主页",
    org: "融爱融乐",
    title: "心智障碍青年就业 · 9月新增3家合作雇主",
    content:
      "与北京3家连锁咖啡品牌签订合作协议，将在9月底前为15位心智障碍青年提供门店实习岗位，配套就业辅导员全程支持。",
    hashtags: ["心智障碍青年就业"],
    location: "北京",
    period: "2026-09 至 2027-08",
    media: { icon: "☕", tone: "orange", caption: "合作门店 · 3张图" },
    shares: 198,
    comments: 57,
    likes: 623,
    helps: 168,
  },
  {
    id: 4,
    kind: "项目主页",
    field: "儿童保护",
    region: "西南",
    rating: 4.8,
    publishedHours: 76,
    time: "3天前",
    source: "来自 项目主页",
    org: "壹基金 × 当地教育局",
    title: "云南山区留守儿童心理健康关爱 · 秋季开学第一课",
    content:
      "9月1日开学季，在云南怒江5所乡村学校开展心理健康第一课，覆盖学生620人，同步培训乡村教师28名。",
    hashtags: ["开学第一课", "儿童心理健康"],
    location: "云南·怒江",
    period: "长期项目",
    shares: 156,
    comments: 76,
    likes: 948,
    helps: 245,
  },
  {
    id: 5,
    kind: "最新动态",
    field: "老龄关怀",
    region: "长三角",
    rating: 4.6,
    publishedHours: 120,
    time: "5天前",
    source: "来自 项目主页",
    org: "乐龄合作社",
    title: "社区助餐点升级 · 10月将新增8个老年餐桌",
    content:
      "联合街道社工站完成8个助餐点选址，预计10月中旬营业，惠及社区老人约2,400人，同步招募助餐志愿者。",
    hashtags: ["老年餐桌"],
    location: "上海",
    period: "长期",
    shares: 92,
    comments: 38,
    likes: 432,
    helps: 97,
  },
  {
    id: 6,
    kind: "项目主页",
    field: "医疗健康",
    region: "西北",
    rating: 4.9,
    publishedHours: 170,
    time: "1周前",
    source: "来自 项目主页",
    org: "韩红爱心慈善基金会",
    title: "乡村义诊巡回 · 第三季度覆盖12个乡镇",
    content:
      "本季度巡回义诊已走进12个乡镇，累计接诊3,100人次，为460位慢性病患者建立健康档案并纳入随访。",
    hashtags: ["乡村义诊"],
    location: "甘肃·陇南",
    period: "季度巡回",
    media: { icon: "🩺", tone: "sky", caption: "义诊现场 · 9张图" },
    shares: 341,
    comments: 203,
    likes: 2100,
    helps: 386,
  },
  {
    id: 7,
    kind: "志愿活动",
    field: "环保生态",
    region: "珠三角",
    rating: 4.6,
    publishedHours: 10,
    time: "10小时前",
    source: "来自 志愿活动",
    org: "蓝色海洋保护协会",
    title: "全国沿海净滩行动 · 深圳站志愿者招募",
    content:
      "10月1日-3日，深圳西涌海滩净滩行动，招募志愿者120名，提供保险、午餐与志愿服务证明，欢迎团队报名。",
    hashtags: ["净滩行动", "志愿者招募"],
    location: "广东·深圳",
    period: "10月1日-3日",
    media: { icon: "🌊", tone: "blue", caption: "往期活动 · 4张图" },
    shares: 268,
    comments: 94,
    likes: 1300,
    helps: 421,
  },
  {
    id: 8,
    kind: "志愿活动",
    field: "残健融合",
    region: "长三角",
    rating: 4.8,
    publishedHours: 30,
    time: "昨天",
    source: "来自 志愿活动",
    org: "黑暗跑团",
    title: "杭州马拉松视障陪跑志愿者招募",
    content:
      "11月2日杭州马拉松，招募视障陪跑志愿者60名，需完成2次线下陪跑培训，有跑步基础者优先。",
    hashtags: ["视障陪跑", "杭马"],
    location: "浙江·杭州",
    period: "11月2日",
    shares: 175,
    comments: 66,
    likes: 890,
    helps: 356,
  },
  {
    id: 9,
    kind: "行业活动",
    field: "乡村教育",
    region: "京津冀",
    rating: 4.7,
    publishedHours: 48,
    time: "2天前",
    source: "来自 行业活动",
    org: "公益数字化联盟",
    title: "2026乡村教育公益数字化峰会 · 开放报名",
    content:
      "10月25日北京，聚焦乡村教育项目的数字化评估与透明化披露，12家基金会与30家一线机构确认出席，开放200个参会名额。",
    hashtags: ["公益数字化", "峰会报名"],
    location: "北京",
    period: "10月25日",
    shares: 143,
    comments: 58,
    likes: 670,
    helps: 89,
  },
  {
    id: 10,
    kind: "志愿活动",
    field: "乡村教育",
    region: "京津冀",
    rating: 4.5,
    publishedHours: 96,
    time: "4天前",
    source: "来自 志愿活动",
    org: "满天星公益",
    title: "社区图书馆周末伴读志愿者（长期）",
    content:
      "每周六下午，在北京5个社区图书馆为流动儿童开展伴读活动，长期招募，提供岗前培训，可按月排班。",
    hashtags: ["伴读志愿者"],
    location: "北京",
    period: "长期",
    shares: 84,
    comments: 41,
    likes: 502,
    helps: 233,
  },
];

export const hotProjects = [
  { rank: 1, title: "蚂蚁森林·阿拉善梭梭种植", meta: "互动 1.5k · 评分 4.8" },
  { rank: 2, title: "美丽中国支教招募", meta: "互动 1.1k · 评分 4.9" },
  { rank: 3, title: "心智障碍青年就业", meta: "互动 866 · 评分 4.7" },
  { rank: 4, title: "留守儿童心理健康", meta: "互动 945 · 评分 4.8" },
  { rank: 5, title: "全国沿海净滩行动", meta: "互动 1.3k · 评分 4.6" },
];

export const platformStats = [
  { label: "在线项目", value: "428", tone: "green" },
  { label: "累计动态", value: "3,256", tone: "orange" },
  { label: "活跃机构", value: "286", tone: "blue" },
  { label: "参与用户", value: "12.8k", tone: "purple" },
];

/* ---------- 资金 & 物资 ---------- */

export type FundingItem = {
  id: number;
  kind: "资助" | "需求" | "物资";
  type: string;
  field: string;
  region: string;
  title: string;
  summary: string;
  org: string;
  location: string;
  amount: string;
  amountWan: number;
  dueDays: number;
  due: string;
  publishedDays: number;
};

export const fundings: FundingItem[] = [
  {
    id: 1,
    kind: "资助",
    type: "基金会资助",
    field: "乡村教育",
    region: "全国",
    title: "2026年南都基金会“银杏成长计划”资助项目征集",
    summary:
      "面向乡村教育领域一线公益机构，单个项目资助20-80万元，需提交项目申请书与机构资质材料。",
    org: "南都公益基金会",
    location: "全国",
    amount: "20-80万",
    amountWan: 50,
    dueDays: 3,
    due: "2026-09-11",
    publishedDays: 2,
  },
  {
    id: 2,
    kind: "资助",
    type: "政府购买",
    field: "社会工作",
    region: "北京",
    title: "北京市朝阳区2026年街道社工服务项目购买公告",
    summary:
      "朝阳区民政局面向社会工作服务机构购买43个街道社工站运营服务，预算合计1,290万元，3年合同期。",
    org: "朝阳区民政局",
    location: "北京·朝阳",
    amount: "30万/站/年",
    amountWan: 30,
    dueDays: 7,
    due: "2026-09-15",
    publishedDays: 4,
  },
  {
    id: 3,
    kind: "资助",
    type: "企业CSR",
    field: "环保生态",
    region: "全国",
    title: "蚂蚁集团2026年度生态保护合作伙伴招募计划",
    summary:
      "围绕荒漠化防治、海洋保护两个方向招募执行伙伴，单个项目支持30-100万元，需有在地执行经验。",
    org: "蚂蚁集团CSR",
    location: "全国",
    amount: "30-100万",
    amountWan: 65,
    dueDays: 14,
    due: "2026-09-22",
    publishedDays: 1,
  },
  {
    id: 4,
    kind: "资助",
    type: "基金会资助",
    field: "儿童保护",
    region: "全国",
    title: "壹基金·壹乐园儿童关怀项目2026年招募",
    summary:
      "为乡村学校建设多功能儿童活动空间并配备驻校社工，单个项目资助40-60万元，优先欠发达地区。",
    org: "壹基金",
    location: "全国",
    amount: "40-60万",
    amountWan: 50,
    dueDays: 21,
    due: "2026-09-29",
    publishedDays: 6,
  },
  {
    id: 5,
    kind: "资助",
    type: "招标采购",
    field: "儿童保护",
    region: "广东",
    title: "深圳市困境儿童关爱服务项目公开招标",
    summary:
      "采购全市困境儿童入户评估与个案管理服务，分3个标段，单标段预算80-120万元，需具备社工服务资质。",
    org: "深圳市民政局",
    location: "广东·深圳",
    amount: "80-120万",
    amountWan: 100,
    dueDays: 10,
    due: "2026-09-18",
    publishedDays: 3,
  },
  {
    id: 6,
    kind: "资助",
    type: "合作共建",
    field: "老龄关怀",
    region: "广东",
    title: "万科社区营造共建计划 · 老年友好社区试点",
    summary:
      "与社区社会组织共建老年友好社区，提供场地、资金与专业支持，单个社区共建资金10-30万元。",
    org: "万科公益基金会",
    location: "广东·深圳",
    amount: "10-30万",
    amountWan: 20,
    dueDays: 30,
    due: "2026-10-08",
    publishedDays: 8,
  },
  {
    id: 7,
    kind: "需求",
    type: "资助需求",
    field: "乡村教育",
    region: "四川",
    title: "甘肃会宁3所乡村小学冬季取暖资助需求",
    summary:
      "3所村小约420名学生，冬季取暖煤与电费缺口约6万元，寻求基金会或企业一对一支持，可提供执行报告。",
    org: "会宁县教育局支教办",
    location: "甘肃·会宁",
    amount: "6万",
    amountWan: 6,
    dueDays: 25,
    due: "2026-10-03",
    publishedDays: 2,
  },
  {
    id: 8,
    kind: "需求",
    type: "资助需求",
    field: "医疗健康",
    region: "四川",
    title: "罕见病家庭紧急医疗救助资金需求",
    summary:
      "在册罕见病家庭12户，年度自付医疗费用缺口合计约35万元，寻求医疗救助专项支持，个案资料完备。",
    org: "成都罕见病关爱中心",
    location: "四川·成都",
    amount: "35万",
    amountWan: 35,
    dueDays: 40,
    due: "2026-10-18",
    publishedDays: 5,
  },
  {
    id: 9,
    kind: "物资",
    type: "物资需求",
    field: "乡村教育",
    region: "全国",
    title: "云南山区学校课桌椅与图书角物资需求",
    summary:
      "怒江4所村小需课桌椅260套、图书角12个，可接收二手物资，物流可协调，接收后提供签收与使用反馈。",
    org: "怒江州教育体育局",
    location: "云南·怒江",
    amount: "估值约8万",
    amountWan: 8,
    dueDays: 45,
    due: "2026-10-23",
    publishedDays: 3,
  },
  {
    id: 10,
    kind: "物资",
    type: "物资供给",
    field: "残健融合",
    region: "上海",
    title: "企业闲置办公电脑捐赠（可供80台）",
    summary:
      "上海某互联网企业退役办公电脑80台，已格式化并检测，优先捐赠给残障就业支持与乡村教学点，需自提或到付。",
    org: "某互联网企业行政部",
    location: "上海·浦东",
    amount: "估值约16万",
    amountWan: 16,
    dueDays: 20,
    due: "2026-09-28",
    publishedDays: 1,
  },
];

export const urgentFundings = [
  { title: "银杏成长计划", org: "南都基金会 · 乡村教育", due: "3天后截止" },
  { title: "朝阳社工服务购买", org: "朝阳民政局 · 社会工作", due: "7天后截止" },
  { title: "壹基金海洋公益", org: "壹基金 · 海洋保护", due: "9天后截止" },
  { title: "万科社区营造", org: "万科基金会 · 社区", due: "15天后截止" },
];

export const fundingStats = [
  { label: "本月新增", value: "428" },
  { label: "本月截止", value: "156" },
  { label: "累计资助额", value: "8.6亿+" },
  { label: "活跃资助方", value: "286" },
];

/* ---------- 人力 & 专家 ---------- */

export type JobItem = {
  id: number;
  kind: "全职" | "兼职" | "实习";
  role: string;
  time: string;
  publishedDays: number;
  title: string;
  summary: string;
  org: string;
  location: string;
  salary: string;
  due: string;
};

export const jobs: JobItem[] = [
  {
    id: 1,
    kind: "全职",
    role: "项目官员",
    time: "3天前发布",
    publishedDays: 3,
    title: "【招聘】教育公平项目官员 · 美丽中国",
    summary:
      "负责乡村教育项目的设计、执行、监测与评估。要求公益/教育/社会学等相关专业，2年以上项目经验。",
    org: "美丽中国 Teach For China",
    location: "北京",
    salary: "12-18K·13薪",
    due: "截止 2026-09-30",
  },
  {
    id: 2,
    kind: "全职",
    role: "传播",
    time: "昨天发布",
    publishedDays: 1,
    title: "【招聘】品牌传播经理 · 蚂蚁森林",
    summary:
      "负责蚂蚁森林品牌传播策略、内容策划、KOL合作。要求3年以上传播经验，有公益/CSR背景优先。",
    org: "蚂蚁集团 CSR",
    location: "杭州",
    salary: "18-28K·14薪",
    due: "截止 2026-09-25",
  },
  {
    id: 3,
    kind: "兼职",
    role: "督导",
    time: "5天前发布",
    publishedDays: 5,
    title: "【招聘】社工督导（兼职）· 上海某社工机构",
    summary:
      "面向持证中级社工师，提供一线社工督导服务，按项目周期结算。要求5年以上实务经验+督导资质。",
    org: "上海联劝公益基金会",
    location: "上海·多区",
    salary: "800-1500元/天",
    due: "长期招募",
  },
  {
    id: 4,
    kind: "实习",
    role: "研究",
    time: "1周前发布",
    publishedDays: 7,
    title: "【实习】公益行业研究员 · 中国发展简报",
    summary:
      "参与公益行业研究报告撰写、政策分析、案例调研。每周到岗3天以上，实习期3-6个月，提供补贴+实习证明。",
    org: "中国发展简报",
    location: "北京·朝阳",
    salary: "200元/天",
    due: "截止 2026-10-15",
  },
  {
    id: 5,
    kind: "全职",
    role: "筹款",
    time: "2天前发布",
    publishedDays: 2,
    title: "【招聘】月捐筹款经理 · 壹基金",
    summary:
      "负责月捐人发展与维护体系搭建，管理筹款活动与捐赠人旅程。要求2年以上筹款或用户运营经验。",
    org: "壹基金",
    location: "深圳",
    salary: "15-22K·13薪",
    due: "截止 2026-10-10",
  },
  {
    id: 6,
    kind: "兼职",
    role: "财务",
    time: "4天前发布",
    publishedDays: 4,
    title: "【招聘】兼职财务主管 · 北京某社区基金会",
    summary:
      "负责基金会全盘账务与年度审计对接，每周到岗2天。要求熟悉民非财务制度，持中级会计职称。",
    org: "北京某社区基金会",
    location: "远程办公",
    salary: "6-8K/月",
    due: "截止 2026-10-20",
  },
  {
    id: 7,
    kind: "实习",
    role: "传播",
    time: "6天前发布",
    publishedDays: 6,
    title: "【实习】新媒体传播实习生 · 成都公益园",
    summary:
      "协助公众号与短视频内容策划、活动执行。每周到岗4天，实习期3个月以上，欢迎新闻传播相关专业。",
    org: "成都公益组织服务园",
    location: "成都",
    salary: "120元/天",
    due: "截止 2026-09-28",
  },
  {
    id: 8,
    kind: "全职",
    role: "项目官员",
    time: "1周前发布",
    publishedDays: 8,
    title: "【招聘】生态保护项目官员 · 山水自然保护中心",
    summary:
      "负责社区保护地项目的落地执行与数据管理，每年有1/3时间在野外工作点。生态学相关专业优先。",
    org: "山水自然保护中心",
    location: "北京",
    salary: "10-15K·13薪",
    due: "截止 2026-10-05",
  },
];

export const hotJobs = [
  { rank: 1, title: "品牌传播经理 · 蚂蚁森林", meta: "杭州 · 18-28K" },
  { rank: 2, title: "项目官员 · 美丽中国", meta: "北京 · 12-18K" },
  { rank: 3, title: "社工督导（兼职）", meta: "上海 · 800-1500元/天" },
  { rank: 4, title: "公益行业研究员（实习）", meta: "北京 · 200元/天" },
  { rank: 5, title: "月捐筹款经理 · 壹基金", meta: "深圳 · 15-22K" },
];

export const jobStats = [
  { label: "本月新增岗位", value: "186" },
  { label: "在招机构", value: "92" },
  { label: "累计投递", value: "3.4万+" },
  { label: "远程岗位", value: "47" },
];

/* ---------- 能力工具 ---------- */

export type ToolItem = {
  id: number;
  category: string;
  field: string;
  forms: ("线上" | "线下" | "付费" | "免费")[];
  priceTag: string;
  title: string;
  meta: string;
  summary: string;
  action: string;
  price?: string;
  tone: string;
  icon: string;
  downloads: number;
  rating: number;
  publishedDays: number;
};

export const tools: ToolItem[] = [
  {
    id: 1,
    category: "培训课程",
    field: "项目管理",
    forms: ["线下", "付费"],
    priceTag: "商业付费",
    title: "公益项目设计·LFA逻辑框架实战培训",
    meta: "📅 9月29-30日 · 📍 北京·线下",
    summary:
      "两天一夜深度培训，覆盖问题树、利益相关方分析、逻辑框架搭建、指标体系设计，含午餐与结业证书。",
    action: "立即报名",
    price: "¥880/人",
    tone: "mint",
    icon: "🎓",
    downloads: 126,
    rating: 4.8,
    publishedDays: 3,
  },
  {
    id: 2,
    category: "行业沙龙",
    field: "项目管理",
    forms: ["线下", "免费"],
    priceTag: "免费",
    title: "公益组织透明度建设·北京月度沙龙",
    meta: "📅 9月20日 19:00 · 📍 北京·朝阳",
    summary:
      "8位机构负责人闭门分享透明度建设经验，含年度报告撰写、信息披露实操，限30人。",
    action: "立即报名",
    tone: "blue",
    icon: "☕",
    downloads: 30,
    rating: 4.6,
    publishedDays: 5,
  },
  {
    id: 3,
    category: "工具模板",
    field: "项目管理",
    forms: ["免费"],
    priceTag: "免费",
    title: "公益项目计划书模板（基金会申报通用版）",
    meta: "📦 Word+PDF · ⬇ 1.8k 次下载",
    summary:
      "含问题背景、目标设定、项目设计、预算编制、监测评估等核心模块，已适配南都、壹基金等格式。",
    action: "⬇ 下载模板",
    tone: "orange",
    icon: "📋",
    downloads: 1800,
    rating: 4.9,
    publishedDays: 12,
  },
  {
    id: 4,
    category: "行业报告",
    field: "团队管理",
    forms: ["免费"],
    priceTag: "免费",
    title: "2026中国公益行业人才发展报告",
    meta: "📄 PDF · ⬇ 328 次下载",
    summary:
      "基于2.4万份问卷分析公益行业人才流动、薪酬水平与能力缺口，含分领域数据对比。",
    action: "⬇ 下载报告",
    tone: "purple",
    icon: "📊",
    downloads: 328,
    rating: 4.7,
    publishedDays: 8,
  },
  {
    id: 5,
    category: "经验文章",
    field: "财务",
    forms: ["线上", "免费"],
    priceTag: "免费",
    title: "小额资助项目如何做好财务合规？",
    meta: "✍️ 经验文章 · 12 分钟读完",
    summary:
      "从票据管理、专款专用、审计准备三个环节，拆解年资助额50万以下项目的财务合规要点。",
    action: "阅读全文",
    tone: "green",
    icon: "✍️",
    downloads: 960,
    rating: 4.5,
    publishedDays: 2,
  },
  {
    id: 6,
    category: "行业标准",
    field: "财务",
    forms: ["免费"],
    priceTag: "免费",
    title: "慈善组织信息公开标准（2026修订版）解读",
    meta: "📚 行业标准 · 含配套清单",
    summary:
      "对照2026修订版逐条解读信息披露要求，附信息公开时限清单与常见违规案例。",
    action: "查看标准",
    tone: "sky",
    icon: "📚",
    downloads: 745,
    rating: 4.8,
    publishedDays: 15,
  },
  {
    id: 7,
    category: "工具模板",
    field: "团队管理",
    forms: ["免费"],
    priceTag: "免费",
    title: "志愿者服务时长记录与证明模板",
    meta: "📦 Excel · ⬇ 2.3k 次下载",
    summary:
      "含时长登记表、服务证明、月度汇总三张表，内置数据校验，可直接打印使用。",
    action: "⬇ 下载模板",
    tone: "rose",
    icon: "🧾",
    downloads: 2300,
    rating: 4.9,
    publishedDays: 20,
  },
  {
    id: 8,
    category: "培训课程",
    field: "筹款",
    forms: ["线上", "付费"],
    priceTag: "商业付费",
    title: "公益筹款人认证课程（PFF·春季班）",
    meta: "📅 10月18日开课 · 💻 线上直播",
    summary:
      "覆盖公众筹款、企业合作、月度捐赠三大模块，共24课时，结业可获行业认证证书。",
    action: "立即报名",
    price: "¥1,280/人",
    tone: "sand",
    icon: "🎤",
    downloads: 214,
    rating: 4.7,
    publishedDays: 6,
  },
  {
    id: 9,
    category: "行业沙龙",
    field: "筹款",
    forms: ["线下", "免费"],
    priceTag: "免费",
    title: "社区基金会发展圆桌·上海站",
    meta: "📅 10月12日 14:00 · 📍 上海·静安",
    summary:
      "围绕社区基金会资金多元化与治理结构展开圆桌讨论，开放20个机构旁听名额。",
    action: "立即报名",
    tone: "mint",
    icon: "🏛️",
    downloads: 20,
    rating: 4.4,
    publishedDays: 9,
  },
];

/* ---------- 筛选配置 ---------- */

export const updateTabs = [
  { label: "全部", count: "428" },
  { label: "最新动态", count: "186" },
  { label: "项目主页", count: "142" },
  { label: "志愿活动", count: "85" },
  { label: "行业活动", count: "15" },
];

export const fundingTabs = [
  { label: "最新资助", icon: "💰", count: "1,825" },
  { label: "最新需求", icon: "📋", count: "486" },
  { label: "物资供需", icon: "📦", count: "218" },
];

export const toolTabs = [
  { label: "全部", icon: "", count: "3,256" },
  { label: "培训课程", icon: "🎓", count: "286" },
  { label: "行业沙龙", icon: "☕", count: "128" },
  { label: "工具模板", icon: "📋", count: "1,425" },
  { label: "行业报告", icon: "📊", count: "328" },
  { label: "行业标准", icon: "📚", count: "85" },
  { label: "经验文章", icon: "✍️", count: "1,004" },
];

export const filterGroups = {
  fields: ["全部", "乡村教育", "环保生态", "残健融合", "儿童保护", "老龄关怀", "医疗健康"],
  fundingFields: ["全部", "乡村教育", "环保生态", "儿童保护", "残健融合", "老龄关怀", "医疗健康", "社会工作"],
  regions: ["全部", "京津冀", "长三角", "珠三角", "西南", "西北", "全国"],
  fundingTypes: ["全部类型", "基金会资助", "政府购买", "企业CSR", "招标采购", "合作共建"],
  amounts: ["不限", "10万以下", "10-50万", "50-200万", "200万以上"],
  fundingRegions: ["全部", "北京", "上海", "广东", "四川"],
  jobRoles: ["全部", "项目官员", "传播", "财务", "督导", "筹款", "研究"],
  jobCities: ["全部", "北京", "上海", "广州/深圳", "成都", "远程办公"],
  toolFields: ["全部", "项目管理", "财务", "传播", "筹款", "团队管理"],
  toolForms: ["全部", "线上", "线下", "付费", "免费"],
};
