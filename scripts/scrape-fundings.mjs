#!/usr/bin/env node
/**
 * 公益资助抓取脚本
 *
 * 只保留“面向公益组织 / 社工机构 / 公益团队”的资金、物资或课程类支持信息。
 *
 * 数据源：
 *   1. 中国发展简报 · 公益资助（/abutment/getData，categoryId=17）
 *   2. 中国发展简报 · 资讯搜索（/search/news/getData）—— 补充 2025 年后项目征集
 *   3. 中国红十字基金会（crcf.org.cn）—— 补充基金会伙伴招募
 *   4. 中国慈展会 · 资源直通车（cncf.org.cn 行业动态 + 微信公众号）—— 每周项目/资助合集
 *   5. 中国人口福利基金会（cpwf.org.cn）—— 基金会资助公告
 *
 * 明确排除：政府采购/招标/中标、公众筹款/捐赠、个人/学生/患者招募、
 * 会议/沙龙/论坛/活动/课程报名/案例与作品征集。
 *
 * 用法：node --use-env-proxy scripts/scrape-fundings.mjs
 * 输出：src/lib/fundings-data.json
 */

import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import * as cheerio from "cheerio";

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const OUT = path.join(ROOT, "src/lib/fundings-data.json");
const REVIEW_STATUSES = new Set(["PENDING", "PENDING_REVIEW", "PUBLISHED", "REJECTED"]);
const UA = "InfiniteConnectionPreview/0.1 (+https://github.com/schneiderlin/infinite-connection)";
const BROWSER_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36";
const WECHAT_UA =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1";
const GAP_MS = 900;
const CUTOFF = "2023-01-01";

const CNCF_LIST_URL = "https://www.cncf.org.cn/cms/node/53";
const CNCF_MAX_LIST_PAGES = 12;
// 第 37 期先发于微信公众号、官网列表尚未收录；临时入口失效时自动跳过。
const CNCF_EXTRA_ISSUES = [
  {
    issue: 37,
    date: "2026-10-16",
    url: "https://mp.weixin.qq.com/s?src=11&timestamp=1792401373&ver=7036&signature=23CN4FcNEBvcIexsG6oKx5K8z4eDqOwHDDdDg9kLr7CyK2bQji-1-T5ulaQvVRo9Tb2eZZqGXXFxjqvhQ-9ma3WsjCEvjU*3LWbMm5q5sqtdIRrSgwYidA7VFnGy9V3L&new=1",
  },
];
const CPWF_CATEGORY_URL = "https://www.cpwf.org.cn/category/264";
const CPWF_MAX_PAGES = 24;
const CPWF_MAX_DETAILS = 40;

const CNCF_ORG_TARGET =
  /社会组织|公益组织|公益机构|社工|社会工作|社会服务机构|社区社会组织|社区组织|慈善组织|非营利|公益伙伴|合作伙伴|伙伴机构|伙伴网络|执行机构|申请机构|申报机构|申报单位|申请单位|执行单位|社会团体|民办非企业|养老机构|志愿服务组织|注册基金会|项目实施单位|合作机构|共建社区|县域组织|一线机构|项目点|学校|社区/;
const CNCF_FUNDING =
  /资助|资金支持|支持额度|最高支持|项目资助|公益创投|创投|奖金|物资|捐赠|支持计划|合作伙伴招募|伙伴招募|招募公益伙伴|招募合作伙伴|项目征集|征集项目|申报|申请|补贴|扶持/;
const CNCF_BLOCK =
  /结果公告|名单|公示|评审结果|中标|成交|立项名单|政府采购|招标|采购公告|供应商|询价|比选|竞争性磋商|作品征集|摄影|影像|案例征集|面向个人|个人申请|在校生|大学生|青年创业者|志愿者伙伴|志愿者招募|设计制作|视觉体系|宣传包|银杏伙伴|科研|课题|论文|医疗机构|医院|患者|医生|护士|教师个人|班主任|学生个人/;
const CNCF_JOB_TITLE =
  /招聘|招贤|岗位|简历|薪资|薪酬|应聘|求职|实习生|任职|岗位职责|工作地点|全职|兼职|主管|专员|经理|官员|助理|干事|主任|总监|会计|财务|传播岗|运营岗|筹资岗|管理岗|项目岗|工程师|研究员|综合岗|应届|毕业生/;
const CNCF_JOB_ISSUE = /招聘|招新|岗位|投递|求职|职等|职为|急聘|虚位以待|实习生|人才/;
const CNCF_PROJECT_ISSUE =
  /资助|伙伴|创投|资金|项目(?!经理|主管|专员|助理|岗位|岗|官员|实习|负责人)|助项/;
const CNCF_CALL_TITLE = /资助|招募|征集|申报|申请|创投|伙伴|计划|支持|共建|合作/;


const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const todayISO = () => new Date().toISOString().slice(0, 10);
const dateInShanghai = (seconds) =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Shanghai" }).format(new Date(seconds * 1000));


async function request(url, options = {}, label = url) {
  let lastError;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      const res = await fetch(url, {
        ...options,
        headers: { "User-Agent": UA, ...(options.headers ?? {}) },
        signal: AbortSignal.timeout(25_000),
      });
      if (res.status === 401 || res.status === 403 || res.status === 429) {
        throw new Error(`blocked: HTTP ${res.status}`);
      }
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res;
    } catch (error) {
      lastError = error;
      if (attempt < 3) await sleep(1_200 * attempt);
    }
  }
  console.warn(`  ! 请求失败 ${label}: ${lastError?.message ?? lastError}`);
  return null;
}

async function requestJSON(url, options, label) {
  const res = await request(url, options, label);
  if (!res) return null;
  try {
    return await res.json();
  } catch {
    console.warn(`  ! 返回不是 JSON: ${label}`);
    return null;
  }
}

async function requestText(url, label, headers = {}) {
  const res = await request(url, { headers }, label);
  if (!res) return null;
  try {
    return await res.text();
  } catch (error) {
    console.warn(`  ! 读取正文失败 ${label}: ${error?.message ?? error}`);
    return null;
  }
}

const clean = (value) =>
  String(value ?? "")
    .replace(/[\u200b-\u200d\ufeff]/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const hashId = (value) => createHash("sha1").update(value).digest("hex").slice(0, 12);

function daysSince(dateStr) {
  if (!dateStr) return 0;
  const then = new Date(`${dateStr.slice(0, 10)}T00:00:00+08:00`).getTime();
  if (Number.isNaN(then)) return 0;
  return Math.max(0, Math.round((Date.now() - then) / 86_400_000));
}

function daysUntil(dateStr) {
  if (!dateStr) return 0;
  const then = new Date(`${dateStr.slice(0, 10)}T23:59:59+08:00`).getTime();
  if (Number.isNaN(then)) return 0;
  return Math.max(0, Math.ceil((then - Date.now()) / 86_400_000));
}

function excerpt(text, max = 180) {
  const value = clean(text);
  if (value.length <= max) return value;
  return `${value.slice(0, max).replace(/[，、；：]$/, "")}…`;
}

function isBlocked(title, body = "") {
  const titleBlock =
    /政府采购|招标|中标|成交|采购公告|供应商|采购项目|询价|比选|竞争性磋商|支付宝|腾讯公益|公众筹款|众筹|募捐|捐赠|助学|奖学金|助学金|大学生|高校|学员|学生|青年|青少年|学子|高考|秘书长|管理岗|专业岗|患儿|患者|个人|志愿者招募|招聘|招人|会议|沙龙|论坛|发布会|活动|培训通知|课程报名|报名通知|案例征集|作品征集|摄影|骑手|观察员|注册|名单|公示|结果|评审|专家|妇联|团委|教育局|街道办/;
  if (titleBlock.test(title)) return true;
  const bodyBlock =
    /政府采购|招标公告|中标|成交公告|支付宝公益平台|腾讯公益平台|腾讯公益筹款|水滴筹|轻松筹|面向个人|个人申请|申请人为个人|招募个人|奖学金|助学金|患儿|患者个人|志愿者招募/;
  return bodyBlock.test(body);
}

const WANT = /资助|招募|申报|征集|创投|支持计划|合作伙伴|合作招募|伙伴|小额资助|开放申请|项目征集|资助启事/;


const ORG_TARGET =
  /社会组织|公益组织|公益机构|社工机构|社会工作服务|社会服务机构|社区社会组织|社区组织|慈善组织|非营利组织|公益伙伴|合作伙伴|伙伴机构|执行机构|申请机构|申报机构|机构资质|机构负责人|团队申报|组织申报|团队招募|传播团队|执行团队|项目团队|一线机构|枢纽型组织|支持性组织|基层社会组织|社区公益组织/;

function isOrgTarget(body) {
  return ORG_TARGET.test(body);
}

function inferRegion(address, text) {
  const source = `${address} ${text}`;
  const provinces = new Set();
  const cityMap = [
    [/北京|三里屯|朝阳|海淀|东城|西城|丰台|石景山|通州|顺义|昌平|大兴|怀柔|密云|延庆/, "北京市"],
    [/上海|浦东|徐汇|静安|长宁|普陀|虹口|杨浦|闵行|宝山|嘉定|松江|青浦|奉贤|崇明/, "上海市"],
    [/天津|滨海新区/, "天津市"],
    [/重庆/, "重庆市"],
    [/合肥|芜湖|蚌埠|淮南|马鞍山|安庆|黄山|阜阳|宿州|六安|亳州|池州|宣城|滁州/, "安徽省"],
    [/长沙|株洲|湘潭|衡阳|邵阳|岳阳|常德|张家界|益阳|郴州|永州|怀化|娄底|湘西/, "湖南省"],
    [/广州|深圳|珠海|汕头|佛山|韶关|湛江|肇庆|江门|茂名|惠州|梅州|汕尾|河源|阳江|清远|东莞|中山|潮州|揭阳|云浮/, "广东省"],
    [/太原|大同|阳泉|长治|晋城|朔州|晋中|运城|忻州|临汾|吕梁|山西/, "山西省"],
    [/银川|石嘴山|吴忠|固原|中卫|宁夏/, "宁夏回族自治区"],
    [/杭州|宁波|温州|嘉兴|湖州|绍兴|金华|衢州|舟山|台州|丽水|浙江/, "浙江省"],
    [/南京|无锡|徐州|常州|苏州|南通|连云港|淮安|盐城|扬州|镇江|泰州|宿迁|江苏/, "江苏省"],
    [/成都|自贡|攀枝花|泸州|德阳|绵阳|广元|遂宁|内江|乐山|南充|眉山|宜宾|广安|达州|雅安|巴中|资阳|四川/, "四川省"],
    [/昆明|曲靖|玉溪|保山|昭通|丽江|普洱|临沧|云南/, "云南省"],
    [/贵阳|六盘水|遵义|安顺|毕节|铜仁|贵州/, "贵州省"],
    [/西安|铜川|宝鸡|咸阳|渭南|延安|汉中|榆林|安康|商洛|陕西/, "陕西省"],
    [/兰州|嘉峪关|金昌|白银|天水|武威|张掖|平凉|酒泉|庆阳|定西|陇南|甘肃/, "甘肃省"],
    [/西宁|海东|青海/, "青海省"],
    [/乌鲁木齐|克拉玛依|吐鲁番|哈密|新疆/, "新疆维吾尔自治区"],
    [/拉萨|日喀则|昌都|林芝|山南|那曲|阿里|西藏/, "西藏自治区"],
    [/南宁|柳州|桂林|梧州|北海|防城港|钦州|贵港|玉林|百色|贺州|河池|来宾|崇左|广西/, "广西壮族自治区"],
    [/海口|三亚|三沙|儋州|海南/, "海南省"],
    [/石家庄|唐山|秦皇岛|邯郸|邢台|保定|张家口|承德|沧州|廊坊|衡水|雄安|河北/, "河北省"],
    [/沈阳|大连|鞍山|抚顺|本溪|丹东|锦州|营口|阜新|辽阳|盘锦|铁岭|朝阳|葫芦岛|辽宁/, "辽宁省"],
    [/长春|吉林|四平|辽源|通化|白山|松原|白城|延边/, "吉林省"],
    [/哈尔滨|齐齐哈尔|鸡西|鹤岗|双鸭山|大庆|伊春|佳木斯|七台河|牡丹江|黑河|绥化|大兴安岭|黑龙江/, "黑龙江省"],
    [/济南|青岛|淄博|枣庄|东营|烟台|潍坊|济宁|泰安|威海|日照|临沂|德州|聊城|滨州|菏泽|山东/, "山东省"],
    [/郑州|开封|洛阳|平顶山|安阳|鹤壁|新乡|焦作|濮阳|许昌|漯河|三门峡|南阳|商丘|信阳|周口|驻马店|济源|河南/, "河南省"],
    [/武汉|黄石|十堰|宜昌|襄阳|鄂州|荆门|孝感|荆州|黄冈|咸宁|随州|恩施|湖北/, "湖北省"],
    [/南昌|景德镇|萍乡|九江|新余|鹰潭|赣州|吉安|宜春|抚州|上饶|江西/, "江西省"],
    [/福州|厦门|莆田|三明|泉州|漳州|南平|龙岩|宁德|福建/, "福建省"],
    [/呼和浩特|包头|乌海|赤峰|通辽|鄂尔多斯|呼伦贝尔|巴彦淖尔|乌兰察布|内蒙古/, "内蒙古自治区"],
    [/香港/, "香港特别行政区"],
    [/澳门/, "澳门特别行政区"],
    [/台湾|台北|高雄/, "台湾省"],
  ];
  for (const [pattern, province] of cityMap) {
    if (pattern.test(source)) provinces.add(province);
  }
  if (provinces.size === 1) return [...provinces][0];
  return "全国";
}

function inferLocation(address) {
  const value = clean(address);
  if (!value || value.length > 24) return "全国";
  return value;
}


function inferField(text) {
  const rules = [
    [/救灾|应急|灾害|减灾|防灾|救援/, "应急救援"],
    [/气候|环境|生态|低碳|环保|碳中和|生物多样性/, "生态环保"],
    [/残障|无障碍|心智障碍|视障|听障|孤独症/, "残障融合"],
    [/老人|老龄|养老|老年|银龄/, "老龄关怀"],
    [/儿童|青少年|少年|困境儿童|留守儿童|乡村教育|阅读|学校|教师|支教/, "乡村教育"],
    [/女性|妇女|性别|女童/, "女性关怀"],
    [/社区|街道|乡村|乡村振兴|社区营造|社区韧性/, "社区营造"],
    [/医疗|健康|疾病|心理|艾滋病|罕见病/, "医疗健康"],
    [/文化|非遗|艺术|传统|历史/, "文化传承"],
    [/就业|创业|生计|产业|技能|农户|农民/, "产业生计"],
    [/人才|能力建设|研修|培训|督导|社工人才/, "人才培育"],
    [/科技|创新|数字化|人工智能|AI\b/, "创新探索"],
  ];
  for (const [pattern, field] of rules) {
    if (pattern.test(text)) return field;
  }
  return "其他";
}

function inferSupportType(text) {
  if (
    /物资资助|物资支持|捐赠物资|提供物资|生活物资|设备支持|设备|器材|图书|童书|教具|教育资源|课程名额|培训名额|研修名额|免费课程|学习名额|工作坊名额|奶粉|防跌包|温暖包|物资包|卫生用品|文具|衣物|米面油|生活用品|救灾物资|物料/.test(
      text,
    )
  ) {
    return "物资";
  }
  return "资金";
}

function extractDeadline(body, beginDay) {
  const strongDates = [];
  const contextDates = [];
  const add = (list, year, month, day) => {
    const y = Number(year);
    const m = Number(month);
    const d = Number(day);
    if (!y || m < 1 || m > 12 || d < 1 || d > 31) return;
    const iso = `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    if (!list.includes(iso)) list.push(iso);
  };

  const rangeRe =
    /(?:申请|申报|报名)时间[：:]\s*(20\d{2})[年\-/.](\d{1,2})[月\-/.](\d{1,2})日?\s*[-—~至]\s*(?:(20\d{2})[年\-/.]?)?(\d{1,2})[月\-/.](\d{1,2})日?/g;
  for (const match of body.matchAll(rangeRe)) {
    const [, y1, m1, , y2, m2, d2] = match;
    const endYear = y2 ? Number(y2) : Number(m2) < Number(m1) ? Number(y1) + 1 : Number(y1);
    add(strongDates, endYear, m2, d2);
  }

  const applyTimeRe =
    /(?:申请|申报|报名)时间[：:]\s*(?:延长至|截止到|截至|至)?\s*(20\d{2})[年\-/.](\d{1,2})[月\-/.](\d{1,2})日?/g;
  for (const match of body.matchAll(applyTimeRe)) add(strongDates, match[1], match[2], match[3]);

  const explicitRe =
    /(?:截止时间|截止日期|申报截止|申请截止|报名截止)[：:]?\s*(?:为|是|延长至|延至|至)?\s*(20\d{2})[年\-/.](\d{1,2})[月\-/.](\d{1,2})日?/g;
  for (const match of body.matchAll(explicitRe)) add(strongDates, match[1], match[2], match[3]);

  const extensionRe =
    /(?:延长|延期|顺延|延至)(?:至|到)?\s*(20\d{2})[年\-/.](\d{1,2})[月\-/.](\d{1,2})日?/g;
  for (const match of body.matchAll(extensionRe)) add(strongDates, match[1], match[2], match[3]);

  const beforeRe =
    /(?:请于|须于|应于|于)\s*(20\d{2})[年\-/.](\d{1,2})[月\-/.](\d{1,2})日?[^。；]{0,20}?前/g;
  for (const match of body.matchAll(beforeRe)) {
    const index = match.index ?? 0;
    const after = body.slice(index, index + match[0].length + 20);
    const before = body.slice(Math.max(0, index - 20), index);
    if (/前[^。；]{0,15}(?:评审|审核|公示|公布|结果)/.test(after)) continue;
    if (/评审|审核|公示|公布|结果|项目周期|活动时间|项目期限|实施时间|执行周期/.test(before)) continue;
    add(contextDates, match[1], match[2], match[3]);
  }

  const reverseRe =
    /(20\d{2})[年\-/.](\d{1,2})[月\-/.](\d{1,2})日?[^。；]{0,10}(?:截止|截止日期|截止时间)/g;
  for (const match of body.matchAll(reverseRe)) add(contextDates, match[1], match[2], match[3]);

  const genericRe = /(20\d{2})[年\-/.](\d{1,2})[月\-/.](\d{1,2})日?[^。；]{0,20}?前/g;
  for (const match of body.matchAll(genericRe)) {
    const index = match.index ?? 0;
    const window = body.slice(Math.max(0, index - 30), index + match[0].length + 15);
    if (!/申请|申报|报名|提交|发送|材料|资料|邮件|上传|报送|截止/.test(window)) continue;
    if (/项目周期|活动时间|项目期限|实施时间|执行周期/.test(body.slice(Math.max(0, index - 20), index))) continue;
    add(contextDates, match[1], match[2], match[3]);
  }

  const monthDayRe =
    /(?:截止|申报截止|申请截止|报名截止|截止时间|截止日期)[^。；]{0,30}?(\d{1,2})月(\d{1,2})日/g;
  for (const match of body.matchAll(monthDayRe)) {
    if (/20\d{2}年[^。；]{0,4}\d{1,2}月\d{1,2}日/.test(match[0])) continue;
    const month = Number(match[1]);
    const publishYear = beginDay ? Number(beginDay.slice(0, 4)) : new Date().getUTCFullYear();
    const publishMonth = beginDay ? Number(beginDay.slice(5, 7)) : new Date().getUTCMonth() + 1;
    const year = month < publishMonth ? publishYear + 1 : publishYear;
    add(strongDates, year, match[1], match[2]);
  }

  const publishTime = beginDay ? new Date(`${beginDay.slice(0, 10)}T00:00:00+08:00`).getTime() : 0;
  const isValid = (date) =>
    !publishTime || new Date(`${date}T00:00:00+08:00`).getTime() >= publishTime - 86_400_000;
  const latest = (list) => list.sort((a, b) => b.localeCompare(a))[0] ?? "";

  const validStrong = strongDates.filter(isValid);
  if (validStrong.length) return latest(validStrong);
  const validContext = contextDates.filter(isValid);
  if (validContext.length) return latest(validContext);
  const validAll = [...strongDates, ...contextDates].filter(isValid);
  if (validAll.length) return latest(validAll);
  return latest([...strongDates, ...contextDates]);
}

function extractOwner(body, fallback) {
  const match = body.match(/由([^。；]{5,90}?)双方/);
  return match ? clean(match[1]) : fallback;
}

function inferDuration(beginDay, endDay) {
  if (!beginDay || !endDay) return "详见原帖";
  const months = Math.max(
    0,
    Math.round((new Date(endDay).getTime() - new Date(beginDay).getTime()) / (30.44 * 86_400_000)),
  );
  if (months <= 6) return "6个月内";
  if (months <= 12) return "6-12个月";
  if (months <= 24) return "1-2年";
  return "2年以上";
}

function inferType(title, owner) {
  if (/创投|项目大赛|公益创业赛/.test(title)) return "公益创投";
  if (/物资|防跌包|童书|奶粉|图书|温暖包|物资包/.test(title)) return "物资资助";
  if (/合作伙伴|伙伴招募|合作招募|公益伙伴|支持性组织|联合招募/.test(title)) return "公益项目伙伴招募";
  if (/基金会|慈善会|公益基金会/.test(owner)) return "慈善会/基金会资助";
  if (/民政|社会工作部|街道|乡镇|政府/.test(owner)) return "政府资助";
  if (/企业|公司|集团|银行|星巴克|蚂蚁|腾讯|字节/.test(owner)) return "企业CSR";
  if (/大学|学院|研究院|研究所|学校/.test(owner)) return "高校/研究机构";
  return "公益组织资助";
}

function parseAmount(text) {
  const normalized = clean(text);
  let amountWan = 0;
  const range = normalized.match(/(\d[\d,]*(?:\.\d+)?)\s*[-—~至]\s*(\d[\d,]*(?:\.\d+)?)\s*万/);
  if (range) {
    amountWan = Math.round((Number(range[1].replace(/,/g, "")) + Number(range[2].replace(/,/g, ""))) / 2);
  } else {
    const focused = normalized.match(
      /(?:资助|支持|金额|预算|最高|不超过|上限|共计|总额|合计|每(?:个)?项目点?|单个项目|每机构)[^。；]{0,28}?(\d[\d,]*(?:\.\d+)?)\s*(万)?元/,
    );
    if (focused) {
      const value = Number(focused[1].replace(/,/g, ""));
      if (focused[2]) amountWan = value;
      else if (value >= 10_000) amountWan = Math.round(value / 1_000) / 10;
      else return { amountWan: value / 10_000, amount: `${value}元` };
    } else {
      const single = normalized.match(/(\d[\d,]*(?:\.\d+)?)\s*万(?:元)?/);
      if (single) amountWan = Number(single[1].replace(/,/g, ""));
      else if (/百万/.test(normalized)) amountWan = 100;
    }
  }
  if (!amountWan) return { amountWan: 0, amount: "详见原帖" };
  return { amountWan, amount: `${Number(amountWan.toFixed(1))}万` };
}

function buildFunding({ title, owner, address, beginDay, endDay, body, url, sourceName }) {
  const supportType = inferSupportType(`${title} ${body}`);
  const type = inferType(title, owner);
  const region = inferRegion(address, `${title} ${body}`);
  const location = inferLocation(address);
  const publishDate = beginDay || todayISO();
  const due = endDay || (/长期|招满|申请完|滚动|常年/.test(body) ? "长期有效" : "详见原帖");
  const openStatus = endDay && endDay < todayISO() ? "已截止" : "开放中";
  const amount = parseAmount(body);
  const summary = excerpt(body, 190) || `${title}（来源：${sourceName}）`;
  return {
    id: `fund-${hashId(url || `${title}-${owner}`)}`,
    kind: "资助",
    type,
    supportType,
    duration: inferDuration(beginDay, endDay),
    field: inferField(`${title} ${body}`),
    region,
    title,
    summary,
    org: clean(owner) || "来源机构未注明",
    location,
    amount: amount.amount,
    amountWan: amount.amountWan,
    dueDays: daysUntil(endDay),
    due,
    publishedDays: daysSince(publishDate),
    // status 表示人工审核状态（新抓取记录一律待审）；openStatus 表示申报通道是否开放。
    status: "PENDING",
    openStatus,
    sourceName,
    publishedDate: publishDate,
    url,
  };
}

/* ---------- 来源 1：中国发展简报 · 公益资助 ---------- */
async function scrapeCDBFundings() {
  const json = await requestJSON(
    "https://www.chinadevelopmentbrief.org.cn/abutment/getData",
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: "categoryId=17&pageNum=1&pageSize=500",
    },
    "CDB 公益资助列表",
  );
  const rows = json?.result?.list ?? [];
  console.log(`CDB 公益资助：接口返回 ${rows.length} 条`);

  const candidates = rows
    .filter((row) => (row.beginDay || row.endDay || "") >= CUTOFF)
    .filter((row) => !isBlocked(row.title))
    .filter((row) => WANT.test(row.title))
    .sort((a, b) => String(b.beginDay || "").localeCompare(String(a.beginDay || "")));

  console.log(`CDB 公益资助：2023 年后且标题初筛通过 ${candidates.length} 条`);

  const accepted = [];
  for (const row of candidates) {
    const url = `https://www.chinadevelopmentbrief.org.cn/abutment/detail/${row.id}.html`;
    const html = await requestText(url, `CDB ${row.id}`);
    await sleep(GAP_MS);
    if (!html) continue;

    const $ = cheerio.load(html);
    const body = clean($(".detail-content").text() || $(".content").text());
    if (body.length < 160) {
      console.log(`  - 跳过（正文过短/图片正文）: ${row.title}`);
      continue;
    }
    if (isBlocked(row.title, body)) {
      console.log(`  - 跳过（命中排除规则）: ${row.title}`);
      continue;
    }
    if (!isOrgTarget(body)) {
      console.log(`  - 跳过（未明确面向机构/团队）: ${row.title}`);
      continue;
    }

    accepted.push(
      buildFunding({
        title: clean(row.title),
        owner: row.owner,
        address: row.address,
        beginDay: row.beginDay,
        endDay: row.endDay,
        body,
        url,
        sourceName: "中国发展简报·公益资助",
      }),
    );
  }
  console.log(`CDB 公益资助：正文复核通过 ${accepted.length} 条`);
  return accepted;
}

/* ---------- 来源 2：中国发展简报 · 资讯搜索（补充最新项目征集） ---------- */
async function scrapeCDBNews() {
  const terms = ["开放申请", "项目征集", "伙伴招募", "资助计划", "小额资助", "公益创投", "支持计划", "招募合作伙伴", "合作伙伴招募", "资助项目"];
  const found = new Map();

  for (const term of terms) {
    const json = await requestJSON(
      "https://www.chinadevelopmentbrief.org.cn/search/news/getData",
      {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ search: "1", title: term, pageNum: "1", pageSize: "50" }).toString(),
      },
      `CDB 资讯搜索 ${term}`,
    );
    for (const row of json?.result?.list ?? []) {
      if ((row.createTime || "") < "2025-01-01") continue;
      if (isBlocked(row.title)) continue;
      if (!WANT.test(row.title)) continue;
      found.set(String(row.id), row);
    }
    await sleep(GAP_MS);
  }

  console.log(`CDB 资讯搜索：2025 年后候选 ${found.size} 条`);
  const accepted = [];
  for (const row of found.values()) {
    const url = `https://www.chinadevelopmentbrief.org.cn/news/detail/${row.id}.html`;
    const html = await requestText(url, `CDB news ${row.id}`);
    await sleep(GAP_MS);
    if (!html) continue;
    const $ = cheerio.load(html);
    const body = clean($(".detail-content").text() || $(".content").text());
    if (body.length < 200) {
      console.log(`  - 跳过（正文过短/图片正文）: ${row.title}`);
      continue;
    }
    if (isBlocked(row.title, body) || !isOrgTarget(body)) {
      console.log(`  - 跳过（排除规则/非机构）: ${row.title}`);
      continue;
    }
    accepted.push(
      buildFunding({
        title: clean(row.title),
        owner: extractOwner(body, body.match(/来源[:：]\s*([^ ]{2,30})/)?.[1] || "中国发展简报"),
        address: "",
        beginDay: row.createTime,
        endDay: extractDeadline(body, row.createTime),
        body,
        url,
        sourceName: "中国发展简报·资讯",
      }),
    );
  }
  console.log(`CDB 资讯搜索：正文复核通过 ${accepted.length} 条`);
  return accepted;
}

/* ---------- 来源 3：中国红十字基金会 ---------- */
async function scrapeCRCF() {
  const listUrl = "https://www.crcf.org.cn/web/newspage/xinwenzhongxin_rendaojishi.thtml?classFlag=rdjs_xinwenzhongxin";
  const html = await requestText(listUrl, "CRCF 列表");
  if (!html) return [];
  const $ = cheerio.load(html);
  const found = new Map();

  $("a[href*='cid=']").each((_, el) => {
    const title = clean($(el).text());
    const href = $(el).attr("href");
    if (!title || !href) return;
    if (title.length < 8 || !/征集|招募|资助|伙伴|开放|申请/.test(title)) return;
    if (/专家|评审|公示|名单|结果|招聘|捐赠|活动|会议|培训|沙龙|论坛|案例|作品/.test(title)) return;
    const url = new URL(href, listUrl).href;
    if (!found.has(url)) found.set(url, { title, url });
  });

  console.log(`CRCF：候选 ${found.size} 条`);
  const accepted = [];
  for (const row of found.values()) {
    const detail = await requestText(row.url, `CRCF ${row.title}`);
    await sleep(GAP_MS);
    if (!detail) continue;
    const page = cheerio.load(detail);
    const body = clean(page(".r_detail_body").text() || page(".content").text());
    if (body.length < 200) continue;
    if (!/(公益组织|社会组织|公益机构|社工|合作伙伴|伙伴)/.test(body)) continue;
    if (!/(申请|报名|征集|招募|资助|支持)/.test(body)) continue;
    if (isBlocked(row.title, body)) continue;

    const dateText =
      clean(page(".r_detail_title_date").text()) ||
      clean(page(".r_detail_time").text()) ||
      clean(page(".time").text()) ||
      body.match(/20\d{2}[-./年]\d{1,2}[-./月]\d{1,2}/)?.[0] ||
      "";
    const dateMatch = dateText.match(/(20\d{2})[年\-/.](\d{1,2})[月\-/.](\d{1,2})/);
    const beginDay = dateMatch
      ? `${dateMatch[1]}-${String(dateMatch[2]).padStart(2, "0")}-${String(dateMatch[3]).padStart(2, "0")}`
      : todayISO();
    accepted.push(
      buildFunding({
        title: row.title,
        owner: "中国红十字基金会",
        address: "",
        beginDay,
        endDay: extractDeadline(body, beginDay),
        body,
        url: row.url,
        sourceName: "中国红十字基金会",
      }),
    );
  }
  console.log(`CRCF：正文复核通过 ${accepted.length} 条`);
  return accepted;
}

/* ---------- 来源 4：中国慈展会 · 资源直通车 ---------- */

function parseCNCFSections(paras) {
  const starts = [];
  for (let i = 0; i < paras.length - 1; i += 1) {
    if (!/^\d{1,2}$/.test(paras[i])) continue;
    const title = clean(paras[i + 1]);
    if (title.length < 6 || title.length > 90) continue;
    if (!CNCF_CALL_TITLE.test(title)) continue;
    if (/^(项目简介|申报要求|招募对象|申请条件|截止时间|招募链接|申报对象)/.test(title)) continue;
    starts.push({ start: i, title });
  }
  return starts.map((section, index) => ({
    title: section.title,
    text: paras.slice(section.start, index + 1 < starts.length ? starts[index + 1].start : paras.length).join("\n"),
  }));
}

function cncfSectionBody(section) {
  const lines = section.text.split("\n");
  if (/^\d{1,2}$/.test(lines[0] ?? "")) lines.shift();
  if (lines[0] === section.title) lines.shift();
  return clean(
    lines
      .join("\n")
      .replace(/招募链接[：:][\s\S]*$/, "")
      .replace(/详情请戳[：:][\s\S]*$/, "")
      .replace(/END\s*来源[\/／][\s\S]*$/i, ""),
  );
}

function tidyCNCFOwner(value, fallback) {
  let owner = clean(value)
    .replace(/^由\s*/, "")
    .replace(/^(?:在|是|为|以|将|对|与|和|及)\s*/, "")
    .replace(/^(?:20\d{2}年|第[一二三四五六七八九十百]+届)\s*/, "")
    .replace(/^(?:依照|根据)[^及。；]*及/, "")
    .replace(/^能够[^与。；]*与/, "")
    .replace(/^(?:认同|引领|号召|鼓励|支持|推动)\s*/, "")
    .replace(/(?:于)?20\d{2}年.*$/, "")
    .replace(/[，,；;、].*$/, "")
    .replace(/[。；].*$/, "")
    .replace(/[\s\-—–:：]+$/, "");
  if (owner.length < 2 || owner.length > 80) return fallback;
  if (
    /^(?:广大|青年|儿童|项目|活动|机构|单位|人员|家庭|公众|践行|当地|入选|庭|国家|相关|符合|面向|计划|通过|围绕)/.test(
      owner,
    )
  ) {
    return fallback;
  }
  return owner;
}

function inferCNCFOwner(sectionText, title, fallback) {
  const by = sectionText.match(
    /由([^。；]{2,90}?)(?:于\d{4}年)?(?:共同|联合)?(?:立项)?(?:发起|主办|资助|支持|开展|实施)/,
  );
  if (by) return tidyCNCFOwner(by[1], fallback);
  const org = sectionText.match(
    /([\u4e00-\u9fa5A-Za-z0-9（）()·\-]{2,40}(?:公益基金会|基金会|慈善会|联合会|协会|社会工作服务中心|研究院|中心|民政局|总工会|妇联|团委|人民政府))/,
  );
  if (org) return tidyCNCFOwner(org[1], fallback);
  const titled = title.match(
    /^([\u4e00-\u9fa5A-Za-z0-9（）()·\-]{2,40}(?:公益基金会|基金会|慈善会|联合会|协会|社会工作服务中心|研究院|中心|民政局|总工会|妇联|团委))/,
  );
  if (titled) return tidyCNCFOwner(titled[1], fallback);
  return fallback;
}

async function collectCNCFIssues() {
  const found = new Map();
  for (let page = 1; page <= CNCF_MAX_LIST_PAGES; page += 1) {
    const url = `${CNCF_LIST_URL}${page > 1 ? `?page=${page}` : ""}`;
    const html = await requestText(url, `CNCF 列表 p${page}`, { "User-Agent": BROWSER_UA });
    if (!html) break;
    const $ = cheerio.load(html);
    let added = 0;
    $("a[href]").each((_, el) => {
      const text = clean($(el).text());
      const href = $(el).attr("href");
      if (!href || !href.includes("mp.weixin.qq.com") || !/2026年\d+期/.test(text)) return;
      const issue = Number(text.match(/2026年(\d+)期/)?.[1]);
      if (!issue || found.has(issue)) return;
      const parent = clean($(el).closest("li, .item, .news-item, .list-item, div").text());
      const date = parent.match(/20\d{2}-\d{2}-\d{2}/)?.[0] ?? "";
      found.set(issue, { issue, title: text, url: href, date });
      added += 1;
    });
    await sleep(300);
    if (!added && page > 1) break;
  }
  for (const extra of CNCF_EXTRA_ISSUES) {
    if (!found.has(extra.issue)) {
      found.set(extra.issue, { ...extra, title: `2026年${extra.issue}期` });
    }
  }
  return [...found.values()].sort((a, b) => b.issue - a.issue);
}

async function scrapeCNCF() {
  const issues = await collectCNCFIssues();
  console.log(`CNCF：2026 年资源直通车 ${issues.length} 期`);
  const accepted = [];
  const seen = new Set();

  for (const issue of issues) {
    if (CNCF_JOB_ISSUE.test(issue.title) && !CNCF_PROJECT_ISSUE.test(issue.title)) {
      console.log(`  - 跳过（招聘专场）: ${issue.issue}期 ${issue.title.slice(0, 40)}`);
      continue;
    }
    const html = await requestText(issue.url, `CNCF ${issue.issue}期`, { "User-Agent": WECHAT_UA });
    await sleep(GAP_MS);
    if (!html) continue;
    const $ = cheerio.load(html);
    const paras = $("#js_content p")
      .map((_, el) => clean($(el).text()))
      .get()
      .filter(Boolean);
    if (paras.length < 10) {
      console.log(`  - 跳过（正文过短/图片正文）: ${issue.issue}期`);
      continue;
    }
    const ct = Number(html.match(/var ct = "(\d+)"/)?.[1] || 0);
    const published = ct ? dateInShanghai(ct) : issue.date || todayISO();
    const links = [];
    $("#js_content a[href]").each((_, el) => {
      const title = clean($(el).text());
      const href = $(el).attr("href");
      if (href && title.length >= 5 && !href.startsWith("#")) links.push({ title, href });
    });
    const sections = parseCNCFSections(paras);
    let added = 0;

    for (const section of sections) {
      const full = clean(section.text);
      const body = cncfSectionBody(section);
      if (body.length < 80) continue;
      if (CNCF_JOB_ISSUE.test(issue.title) && !CNCF_CALL_TITLE.test(section.title)) continue;
      if (CNCF_JOB_TITLE.test(section.title)) continue;
      if (CNCF_BLOCK.test(`${section.title} ${full}`)) continue;
      if (!CNCF_FUNDING.test(full) || !CNCF_ORG_TARGET.test(full)) continue;
      if (/培训|研修|工作坊|课程|沙龙|论坛|会议|创造营/.test(section.title) && !/资助|资金|创投|奖金|扶持|补贴|物资/.test(section.title)) {
        continue;
      }

      let link = null;
      let linkIndex = -1;
      for (const candidate of links) {
        const index = full.lastIndexOf(candidate.title);
        if (index > linkIndex) {
          link = candidate;
          linkIndex = index;
        }
      }
      if (!link || linkIndex < 0) continue;
      const url = new URL(link.href, issue.url).href;
      if (seen.has(url)) continue;
      seen.add(url);

      const owner = inferCNCFOwner(full, section.title, "中国慈展会");
      accepted.push(
        buildFunding({
          title: section.title,
          owner,
          address: "",
          beginDay: published,
          endDay: extractDeadline(body, published),
          body,
          url,
          sourceName: "中国慈展会·资源直通车",
        }),
      );
      added += 1;
    }
    console.log(`  · ${issue.issue}期 ${published}: ${added} 条`);
  }

  console.log(`CNCF：正文复核通过 ${accepted.length} 条`);
  return accepted;
}

/* ---------- 来源 5：中国人口福利基金会 ---------- */

const CPWF_WANT = /资助|招募|申报|征集|开放申请|合作伙伴|项目征集|支持计划|资助计划|申请/;
const CPWF_BLOCK_TITLE =
  /结果|名单|公示|评审|采购|招标|中标|审计|评价|遴选|招聘|委托|体检|会务|课题|研究|学者|学生|医院|医疗机构|妇幼保健院|卫生健康委|医疗物资|医疗设备|医疗仪器|药品|启动|总结|案例|作品|声明|患者|援助项目/;
const CPWF_BLOCK_BODY = /面向个人|个人申请|申请人为个人|患者个人|志愿者招募/;
const CPWF_NGO =
  /社会组织|公益组织|公益机构|社工组织|社工机构|社工团体|社会工作者|社会工作服务|社会服务机构|慈善组织|公益伙伴|合作伙伴|社会团体|民办非企业|养老机构|志愿服务组织|社区社会组织|社区组织/;
const CPWF_TARGET_RE =
  /(?:申报对象|申请对象|招募对象|资助对象|申报单位|申请单位|招募范围|资助范围|申请范围|申请条件|单位性质|面向)([^。；]{0,220})/g;
const CPWF_FUNDING_BODY = /资助|资金|物资|支持|补贴|扶持|捐赠/;

function cpwfTargetsNgo(body) {
  const targets = [...body.matchAll(CPWF_TARGET_RE)].map((match) => match[1]).join("。");
  const scope = targets || body;
  const ngo = CPWF_NGO.test(scope);
  const nonProfit = /非营利/.test(scope);
  const medical = /医疗机构|医院|妇幼保健院|卫生健康委|医疗卫生机构|公立医院|定点医院|患者/.test(scope);
  if (medical) return ngo;
  return ngo || nonProfit;
}

async function scrapeCPWF() {
  const found = new Map();
  for (let page = 1; page <= CPWF_MAX_PAGES; page += 1) {
    const url = `${CPWF_CATEGORY_URL}?page=${page}`;
    const html = await requestText(url, `CPWF 列表 p${page}`);
    if (!html) break;
    const $ = cheerio.load(html);
    const rows = $(".dynamic-item");
    if (!rows.length) break;
    let added = 0;
    rows.each((_, el) => {
      const anchor = $(el).find("a.content").first().length
        ? $(el).find("a.content").first()
        : $(el).find("a[href]").first();
      const title = clean($(el).find(".title").text() || anchor.text());
      const href = anchor.attr("href");
      if (!title || !href) return;
      const date = clean($(el).find(".time").text()).match(/20\d{2}-\d{2}-\d{2}/)?.[0] ?? "";
      if (date && date < "2025-01-01") return;
      if (!CPWF_WANT.test(title) || CPWF_BLOCK_TITLE.test(title)) return;
      const detailUrl = new URL(href, CPWF_CATEGORY_URL).href;
      if (found.has(detailUrl)) return;
      found.set(detailUrl, { title, url: detailUrl, date });
      added += 1;
    });
    console.log(`CPWF 列表 p${page}：新增候选 ${added} 条`);
    await sleep(300);
  }

  const rows = [...found.values()]
    .sort((a, b) => String(b.date).localeCompare(String(a.date)))
    .slice(0, CPWF_MAX_DETAILS);
  console.log(`CPWF：2025 年后候选 ${found.size} 条，复核前 ${rows.length} 条`);

  const accepted = [];
  for (const row of rows) {
    const detail = await requestText(row.url, `CPWF ${row.title}`);
    await sleep(GAP_MS);
    if (!detail) continue;
    const $ = cheerio.load(detail);
    const body = clean($(".content").text() || $(".article-content").text() || $(".detail-content").text());
    if (body.length < 200) continue;
    if (CPWF_BLOCK_BODY.test(body) || !cpwfTargetsNgo(body) || !CPWF_FUNDING_BODY.test(body)) continue;
    const beginDay = row.date || todayISO();
    accepted.push(
      buildFunding({
        title: row.title,
        owner: "中国人口福利基金会",
        address: "",
        beginDay,
        endDay: extractDeadline(body, beginDay),
        body,
        url: row.url,
        sourceName: "中国人口福利基金会",
      }),
    );
    console.log(`  + ${row.title}`);
  }
  console.log(`CPWF：正文复核通过 ${accepted.length} 条`);
  return accepted;
}

/* ---------- 合并输出 ---------- */


function dedupe(items) {
  const seen = new Set();
  return items.filter((item) => {
    const key = `${item.title}|${item.org}`;
    if (seen.has(key) || seen.has(item.url)) return false;
    seen.add(key);
    seen.add(item.url);
    return true;
  });
}

async function main() {
  // 抓取会重建整份资助快照；先读取旧快照，保住人工审核状态和已审核分类。
  // 历史快照没有 status 时按“已发布”处理，避免每次重跑都把线上记录变成待审。
  let existing = [];
  try {
    existing = JSON.parse(await readFile(OUT, "utf8"));
    console.log(`已有记录：${existing.length} 条（将保留审核状态与已审核分类）`);
  } catch {
    console.log("未找到既有 fundings-data.json，将从空列表开始。");
  }

  const previousByUrl = new Map(
    existing.filter((item) => item.url).map((item) => [item.url, item]),
  );
  const previousByTitle = new Map(
    existing.map((item) => [`${item.title}|${item.org}`, item]),
  );

  const [cdbFundings, cdbNews, crcf, cncf, cpwf] = await Promise.all([
    scrapeCDBFundings(),
    scrapeCDBNews(),
    scrapeCRCF(),
    scrapeCNCF(),
    scrapeCPWF(),
  ]);

  const all = dedupe([...cdbFundings, ...cdbNews, ...crcf, ...cncf, ...cpwf])
    .map((item) => {
      const previous =
        previousByUrl.get(item.url) ??
        previousByTitle.get(`${item.title}|${item.org}`);
      if (!previous) return item;

      const status = REVIEW_STATUSES.has(previous.status)
        ? previous.status
        : "PUBLISHED";
      return {
        ...item,
        status,
        // 已发布 / AI 待复核记录的领域是审核结果，抓取规则不能覆盖它。
        ...(["PUBLISHED", "PENDING_REVIEW"].includes(status) && previous.field
          ? { field: previous.field }
          : {}),
        ...(previous.aiSuggestedCategory
          ? { aiSuggestedCategory: previous.aiSuggestedCategory }
          : {}),
        ...(typeof previous.aiConfidence === "number"
          ? { aiConfidence: previous.aiConfidence }
          : {}),
      };
    })
    .sort((a, b) => {
      if (a.openStatus !== b.openStatus) return a.openStatus === "开放中" ? -1 : 1;
      return a.publishedDays - b.publishedDays;
    });

  await writeFile(OUT, `${JSON.stringify(all, null, 2)}\n`, "utf8");

  console.log("\n写入完成：", OUT);
  console.log(`总计 ${all.length} 条（开放中 ${all.filter((item) => item.openStatus === "开放中").length} 条）`);
  for (const item of all) {
    console.log(
      `- [${item.openStatus}] ${item.publishedDate} | ${item.supportType} | ${item.type} | ${item.org} | ${item.title}`,
    );
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
