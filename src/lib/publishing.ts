import type { ContentModule } from "@prisma/client";

export type PublishModuleSlug = "updates" | "funding" | "jobs" | "tools";

export type PublishModuleConfig = {
  module: ContentModule;
  label: string;
  description: string;
  organizationOnly: boolean;
  subtypes: string[];
  bodyLabel: string;
  bodyPlaceholder: string;
};

export const publishModules: Record<PublishModuleSlug, PublishModuleConfig> = {
  updates: {
    module: "UPDATE",
    label: "项目动态",
    description: "让爱与善意传递给更多人。",
    organizationOnly: false,
    subtypes: ["公益项目", "公益活动"],
    bodyLabel: "动态内容",
    bodyPlaceholder: "描述项目背景、进展、受益对象和所需支持，禁止填写收款账号或私人二维码。",
  },
  funding: {
    module: "FUNDING",
    label: "资金与物资",
    description: "发布机构间资源供给或合作需求，不接受个人求助和个人募捐。",
    organizationOnly: true,
    subtypes: ["资金资助", "物资资助"],
    bodyLabel: "资源说明",
    bodyPlaceholder: "说明资源目的、使用方向、目标受益人、执行情况和申请要求。",
  },
  jobs: {
    module: "JOB",
    label: "人力资源",
    description: "发布公益行业全职、兼职、实习、志愿者或顾问岗位。",
    organizationOnly: true,
    subtypes: ["全职", "兼职", "实习", "志愿者", "顾问"],
    bodyLabel: "岗位职责",
    bodyPlaceholder: "完整填写岗位职责，避免与岗位无关的歧视性条件。",
  },
  tools: {
    module: "TOOL",
    label: "能力工具",
    description: "分享课程、沙龙、模板、报告、标准或一线经验。",
    organizationOnly: false,
    subtypes: ["培训课程", "行业沙龙会议", "公益工具模板库", "行业报告", "行业标准", "同行经验文章", "国际经验"],
    bodyLabel: "详细内容",
    bodyPlaceholder: "介绍内容背景、适用对象、使用方式和版权来源。",
  },
};

/** 按 Content.module 取回对应的发布配置，供审核等后台场景复用分类枚举。 */
export const publishModuleByContentModule: Record<ContentModule, PublishModuleConfig> = {
  UPDATE: publishModules.updates,
  FUNDING: publishModules.funding,
  JOB: publishModules.jobs,
  TOOL: publishModules.tools,
};

export const publicInterestFields = [
  "教育助学",
  "乡村振兴",
  "环境保护",
  "医疗卫生",
  "养老服务",
  "儿童关爱",
  "残障帮扶",
  "社区治理",
  "应急救援",
  "文化传承",
  "志愿服务",
  "社会组织支持",
];

export function isPublishModuleSlug(value: string): value is PublishModuleSlug {
  return value in publishModules;
}

export const moduleHref: Record<ContentModule, string> = {
  UPDATE: "/updates",
  FUNDING: "/funding",
  JOB: "/hr",
  TOOL: "/tools",
};

export const moduleLabel: Record<ContentModule, string> = {
  UPDATE: "项目动态",
  FUNDING: "资金与物资",
  JOB: "人力资源",
  TOOL: "能力工具",
};
