import * as cheerio from 'cheerio';

/** 搜狗微信搜索结果页的固定入口域名。 */
export const SOGOU_BASE_URL = 'https://weixin.sogou.com';

/**
 * 搜狗结果块中供 search 编排层使用的原始条目。
 *
 * `rawLink` 是搜狗的会话绑定跳转地址；它不是可归档的微信直链，后续
 * 必须在同一个浏览器会话中导航并等待页面跳到 mp.weixin.qq.com。
 */
export interface SogouResult {
  title: string;
  rawLink: string;
  account: string;
  pubDate: string;
}

export interface SogouResultPageInspection {
  /** 已识别搜狗结果页外壳；为 false 时应报告 SEARCH_UNAVAILABLE。 */
  hasSkeleton: boolean;
  /** 结果块数量；可以为 0，表示正常空结果。 */
  itemCount: number;
}

/**
 * 搜狗结果页外壳的稳定选择器。
 *
 * 搜狗会在「没有匹配结果」时保留结果列表容器，但不会输出任何
 * `sogou_vr_11002601_box_*` 条目。只检查这些已知容器，避免把验证码页或
 * 任意错误页的 `<body>` 误判为「正常空结果」。
 */
const RESULT_ITEM_SELECTOR = "li[id^='sogou_vr_11002601_box']";

const RESULT_PAGE_SKELETON_SELECTORS = [
  '#sogou_vr_11002601',
  '#sogou_vr_11002601_box',
  '.news-list',
  'ul.news-list',
  '.news-list2',
  'ul.news-list2',
  // A non-empty result list is itself unambiguous evidence of the known
  // skeleton, even when a future Sogou response changes the surrounding
  // container class.
  RESULT_ITEM_SELECTOR,
];

/**
 * 判断页面是否包含可识别的搜狗结果页骨架。
 *
 * `true` + 0 个条目是正常空结果；`false` 表示页面结构无法识别，交由
 * search 命令映射为 SEARCH_UNAVAILABLE。此函数纯解析，不触网。
 */
export function hasSogouResultPageSkeleton(html: string): boolean {
  const $ = cheerio.load(html || '');
  return RESULT_PAGE_SKELETON_SELECTORS.some((selector) => $(selector).length > 0);
}

/** 语义更明确的别名，供编排层按布尔判据直接调用。 */
export const detectSogouResultPageSkeleton = hasSogouResultPageSkeleton;

// Keep the shorter names available for command code and downstream callers;
// all aliases intentionally share the same pure predicate.
export const hasSogouResultSkeleton = hasSogouResultPageSkeleton;
export const isSogouResultPage = hasSogouResultPageSkeleton;

/**
 * 返回结果页骨架与条目数量，避免调用方重复解析 HTML。
 */
export function inspectSogouResultPage(html: string): SogouResultPageInspection {
  const $ = cheerio.load(html || '');
  return {
    hasSkeleton: RESULT_PAGE_SKELETON_SELECTORS.some((selector) => $(selector).length > 0),
    itemCount: $(RESULT_ITEM_SELECTOR).length,
  };
}

/** 兼容喜欢「parse page」命名的调用方；结果数组仍由 parseSogouResults 返回。 */
export function parseSogouPage(html: string, baseUrl = SOGOU_BASE_URL): {
  hasSkeleton: boolean;
  items: SogouResult[];
} {
  const inspection = inspectSogouResultPage(html);
  return {
    hasSkeleton: inspection.hasSkeleton,
    items: parseSogouResults(html, baseUrl),
  };
}

/**
 * 解析搜狗微信搜索结果列表。
 *
 * 只读取结果页 HTML，不发起网络请求，也不做公众号过滤或条数截断；这
 * 两项属于 search 命令的编排语义。缺少标题/链接的残缺块会被跳过，单条
 * 日期缺失只留下空字符串，不会让整页结果丢失。
 */
export function parseSogouResults(
  html: string,
  baseUrl = SOGOU_BASE_URL
): SogouResult[] {
  const $ = cheerio.load(html || '');
  const results: SogouResult[] = [];

  $(RESULT_ITEM_SELECTOR).each((_, element) => {
    const $item = $(element);
    const $anchor = $item.find('h3 a').first();
    const href = $anchor.attr('href');

    // 搜狗偶尔会留下没有标题链接的广告/残缺条目；它不是可用结果。
    if (!href) {
      return;
    }

    const title = normalizeText($anchor.text());
    if (!title) {
      return;
    }

    const rawLink = absolutizeLink(href, baseUrl);
    const account = normalizeText($item.find('.all-time-y2').first().text());
    const pubDate = extractSogouDate($, $item);

    results.push({ title, rawLink, account, pubDate });
  });

  return results;
}

/**
 * 检测搜狗验证码/反爬页面。
 *
 * URL 判据覆盖 antispider 重定向；正文判据覆盖搜狗页面中的常见验证码
 * 标记。检测到后调用方必须立即停止，不应自动重试。
 */
export function detectAntispider(url: string, html: string): boolean {
  const urlText = String(url || '');
  const htmlText = String(html || '');

  if (/\/antispider(?:\/|\?|#|$)/i.test(urlText)) {
    return true;
  }

  // Keep the marker list intentionally narrow: these are the documented
  // Sogou challenge signals, not generic words such as "security".
  return /VerifyCode|验证码|seccode|antispider/i.test(htmlText);
}

/** 兼容旧命名；新代码优先使用 detectAntispider。 */
export const isSogouAntispider = detectAntispider;

function absolutizeLink(href: string, baseUrl: string): string {
  try {
    return new URL(href, baseUrl).toString();
  } catch {
    // The normal Sogou markup always has a valid href. Preserve malformed
    // markup verbatim so one bad result does not erase the remaining list.
    return href;
  }
}

function extractSogouDate(
  $: cheerio.CheerioAPI,
  $item: cheerio.Cheerio<any>
): string {
  const $date = $item.find('.s2').first();
  if (!$date.length) {
    return '';
  }

  // The timestamp lives in the script source because document.write() has not
  // run when we parse the response with cheerio.
  const source = $.html($date) || '';
  const match = source.match(
    /timeConvert\s*\(\s*(?:['"]|&apos;|&#39;)?(\d{1,12})(?:['"]|&apos;|&#39;)?\s*\)/i
  );
  if (!match) {
    return '';
  }

  return unixSecondsToShanghaiDate(match[1]);
}

function unixSecondsToShanghaiDate(rawSeconds: string): string {
  const seconds = Number(rawSeconds);
  if (!Number.isSafeInteger(seconds)) {
    return '';
  }

  const date = new Date(seconds * 1000);
  if (Number.isNaN(date.getTime())) {
    return '';
  }

  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const year = parts.find((part) => part.type === 'year')?.value;
  const month = parts.find((part) => part.type === 'month')?.value;
  const day = parts.find((part) => part.type === 'day')?.value;

  return year && month && day ? `${year}-${month}-${day}` : '';
}

function normalizeText(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}
