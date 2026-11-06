export type UpdateMedia = {
  icon: string;
  tone: string;
  caption: string;
};

export type UpdateItem = {
  id: string;
  kind: "最新动态" | "项目主页" | "志愿活动" | "行业活动";
  posterType: "机构" | "个人";
  field: string;
  fields?: string[]; // 加上这个
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
  images?: { id: string; fileName: string }[]; // 加上这个
  media?: { icon: string; tone: string; caption: string };
  shares: number;
  comments: number;
  likes: number;
  helps: number;
  isLiked?: boolean; // 加上这个
  isHelped?: boolean; // 加上这个
};

export type FundingItem = {
  id: string;
  kind: "资助" | "需求" | "物资";
  type: string;
  supportType: "资金" | "物资";
  duration: "6个月内" | "6-12个月" | "1-2年" | "2年以上" | "详见原帖";
  field: string;
  issue?: string;
  region: string;
  title: string;
  summary: string;
  org: string;
  location: string;
  amount: string;
  amountWan: number;
  due: string;
  publishedDays: number;
  openStatus?: "开放中" | "已截止" | "以原帖为准";
  sourceName?: string;
  publishedDate?: string;
  url?: string;
};

export type JobItem = {
  id: string;
  category?: "人员招聘" | "志愿者招募";
  kind: "全职" | "兼职" | "实习" | "志愿者" | "顾问";
  role: string;
  // 新岗位分类标准（2026-11）：职业群 / 子类 / 职级 / 学历 / 机构性质
  jobGroup?: string;
  subCategory?: string;
  level?: string;
  education?: string;
  orgType?: string;
  servicePeriod?: "短期" | "长期";
  time: string;
  publishedDays: number;
  title: string;
  summary: string;
  org: string;
  location: string;
  salary: string;
  due: string;
  sourceName?: string;
  url?: string;
};

export type ToolItem = {
  id: string;
  category: string;
  field: string;
  forms: string[];
  duration: string;
  title: string;
  summary: string;
  publisher: string;
  tone: string;
  icon: string;
  priceTag: string;
  meta: string;
  price?: string;
  action: string;
  publishedDays: number;
  downloads: number;
  rating: number;
  url: string;
};
