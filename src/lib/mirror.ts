import * as cheerio from 'cheerio';

/**
 * 今天看啥镜像站允许的主机名。
 *
 * 专栏页是公开列表入口；这里使用全等主机名比较，避免把
 * `jintiankansha.me.example.com` 之类的伪域名当成镜像站。
 */
export const MIRROR_HOSTS = [
  'jintiankansha.me',
  'www.jintiankansha.me',
] as const;

export interface MirrorColumnItem {
  title: string;
  url: string;
}

export interface MirrorColumnPage {
  items: MirrorColumnItem[];
  nextPageUrl: string | null;
}

/** 专栏页至少应包含一个 `/t/` 列表链接；否则不能把未知页面当成空结果。 */
export function hasMirrorColumnPageSkeleton(html: string): boolean {
  const $ = cheerio.load(html || '');
  return $("a[href*='/t/']").length > 0;
}

/**
 * 解析今天看啥专栏页的文章列表。
 *
 * 这是纯解析函数：不触网、不跟随链接，也不对文章页做二次请求。专栏
 * 页面常把同一文章链接放在多个卡片/辅助节点中，因此按规范先按标题
 * 去重；标题不足五个字符的导航或残缺节点会跳过。
 */
export function parseColumnPage(html: string, baseUrl: string): MirrorColumnPage {
  const $ = cheerio.load(html || '');
  const items: MirrorColumnItem[] = [];
  const seenTitles = new Set<string>();

  $("a[href*='/t/']").each((_, element) => {
    const $anchor = $(element);
    const title = normalizeText($anchor.text());
    if (title.length < 5 || seenTitles.has(title)) {
      return;
    }

    const href = $anchor.attr('href');
    const articleUrl = resolveMirrorArticleUrl(href, baseUrl);
    if (!articleUrl) {
      return;
    }

    seenTitles.add(title);
    items.push({ title, url: articleUrl });
  });

  return {
    items,
    nextPageUrl: findNextPageUrl($, baseUrl),
  };
}

/**
 * 从今天看啥 `/t/` 页面中还原微信公众号原文直链。
 *
 * 镜像文章页可能把 URL 放在普通 HTML 属性、脚本字符串或 HTML entity
 * 中；先做最小的实体/转义归一化，再用严格的 mp.weixin.qq.com/s 前缀
 * 正则提取。VIP 墙或没有原文链接时按契约返回 null。
 */
export function extractWeixinUrl(html: string): string | null {
  const source = normalizeHtmlSource(String(html || ''));
  const match = source.match(
    /https?:\/\/(?:mp\.weixin\.qq\.com)\/s(?=$|[/?#])(?:[/?#][^"'<>\s]*)?/i
  );
  if (!match) {
    return null;
  }

  const url = stripTrailingUrlPunctuation(match[0]);
  try {
    const parsed = new URL(url);
    if (
      (parsed.protocol !== 'http:' && parsed.protocol !== 'https:')
      || parsed.hostname.toLowerCase() !== 'mp.weixin.qq.com'
      || !parsed.pathname.startsWith('/s')
    ) {
      return null;
    }
    return parsed.toString();
  } catch {
    return null;
  }
}

/** 判断一个 URL 是否为允许的今天看啥专栏地址。 */
export function isMirrorColumnUrl(rawUrl: string): boolean {
  try {
    const parsed = new URL(rawUrl);
    return isMirrorColumnUrlObject(parsed);
  } catch {
    return false;
  }
}

/**
 * 校验并返回规范化后的专栏 URL，供命令编排层在开始 fetch 前调用。
 */
export function assertMirrorColumnUrl(rawUrl: string): URL {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new Error(`无效的今天看啥专栏链接: ${rawUrl}`);
  }

  if (!isMirrorColumnUrlObject(parsed)) {
    throw new Error(
      '今天看啥专栏链接必须使用 jintiankansha.me 或 www.jintiankansha.me 的 /column/ 路径'
    );
  }

  return parsed;
}

// 给编排层保留语义相近的别名，避免各命令重复实现 host/path 校验。
export const isValidMirrorColumnUrl = isMirrorColumnUrl;
export const validateMirrorColumnUrl = assertMirrorColumnUrl;
export const assertValidMirrorColumnUrl = assertMirrorColumnUrl;

function resolveMirrorArticleUrl(href: string | undefined, baseUrl: string): string | null {
  if (!href) {
    return null;
  }

  let parsed: URL;
  try {
    parsed = new URL(href, baseUrl);
  } catch {
    return null;
  }

  if (
    (parsed.protocol !== 'http:' && parsed.protocol !== 'https:')
    || !isMirrorHost(parsed.hostname)
    || !parsed.pathname.startsWith('/t/')
  ) {
    return null;
  }

  return parsed.toString();
}

function findNextPageUrl($: cheerio.CheerioAPI, baseUrl: string): string | null {
  const candidates: cheerio.Cheerio<any>[] = [];

  // rel=next is the most explicit form and should win over text heuristics.
  $('a[rel~="next" i]').each((_, element) => {
    candidates.push($(element));
  });
  $('a#p_next').each((_, element) => {
    candidates.push($(element));
  });
  $('.next a, a.next, .pagination-next a, .pager-next a').each((_, element) => {
    candidates.push($(element));
  });

  // Common Chinese/English labels used by pagination widgets.
  $('nav a, .pagination a, .pager a, .page a, .pages a').each((_, element) => {
    const $anchor = $(element);
    const label = normalizeText($anchor.text()).toLowerCase();
    if (/^(?:下一页|下页|后一页|next|›|»|>|→)$/.test(label)) {
      candidates.push($anchor);
    }
  });

  const seen = new Set<string>();
  for (const $candidate of candidates) {
    const href = $candidate.attr('href');
    if (!href) {
      continue;
    }

    let parsed: URL;
    try {
      parsed = new URL(href, baseUrl);
    } catch {
      continue;
    }

    const normalized = parsed.toString();
    if (seen.has(normalized)) {
      continue;
    }
    seen.add(normalized);

    if (isMirrorColumnUrlObject(parsed)) {
      return normalized;
    }
  }

  return null;
}

function isMirrorColumnUrlObject(parsed: URL): boolean {
  return (
    (parsed.protocol === 'http:' || parsed.protocol === 'https:')
    && isMirrorHost(parsed.hostname)
    && parsed.pathname.startsWith('/column/')
    && parsed.pathname.length > '/column/'.length
  );
}

function isMirrorHost(hostname: string): boolean {
  return (MIRROR_HOSTS as readonly string[]).includes(hostname.toLowerCase());
}

function normalizeText(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

function normalizeHtmlSource(value: string): string {
  return value
    .replace(/&amp;/gi, '&')
    .replace(/&#x2f;|&#47;/gi, '/')
    .replace(/&#x3f;|&#63;/gi, '?')
    .replace(/&#x3d;|&#61;/gi, '=')
    .replace(/\\\//g, '/');
}

function stripTrailingUrlPunctuation(value: string): string {
  return value.replace(/[.,;:!?)}\]}>]+$/g, '');
}
