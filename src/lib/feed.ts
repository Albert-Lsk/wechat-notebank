import * as cheerio from 'cheerio';

/**
 * feed 纯解析模块：与 sogou / mirror 纯解析同构。
 *
 * 只吃 feed 原文字符串，不做任何网络请求；命令编排层（import-rss）负责
 * 拉取内容、安全闸与结构化错误码映射。解析失败通过返回值表达（结构化
 * 错误对象），不向调用方抛裸异常。
 */

export type FeedKind = 'rss' | 'atom' | 'json';

/** 统一条目：pubDate 为 ISO 8601 字符串，缺失时为空字符串。 */
export interface FeedItem {
  title: string;
  link: string;
  pubDate: string;
}

export type FeedParseOutcome =
  | { ok: true; kind: FeedKind; items: FeedItem[] }
  | { ok: false; code: 'FEED_PARSE_FAILED'; message: string };

const JSONFEED_VERSION_PATTERN = /jsonfeed\.org\/version/i;

/**
 * 解析 RSS 2.0 / Atom / JSON Feed 原文，自动识别格式并输出统一条目。
 *
 * - RSS 2.0：`<channel>` 下的 `<item>`；标题/链接支持 CDATA。
 * - Atom：`<feed>` 下的 `<entry>`；链接优先 `rel="alternate"`，日期优先
 *   `<published>`，缺失时回退 `<updated>`。
 * - JSON Feed v1/v1.1：`items[]`；链接取 `url`（回退 `external_url`）。
 *
 * `baseUrl` 用于把 Atom/RSS 里的相对链接补全为绝对地址。缺少标题或链接
 * 的残缺条目会被跳过；单条日期缺失只留下空字符串，不影响其余条目。
 */
export function parseFeed(source: string, baseUrl?: string): FeedParseOutcome {
  const text = String(source ?? '');

  try {
    const trimmed = text.trim();
    if (trimmed.startsWith('{')) {
      return parseJsonFeed(trimmed);
    }

    const $ = cheerio.load(text, { xmlMode: true });
    if ($('feed').length > 0 || $('entry').length > 0) {
      return { ok: true, kind: 'atom', items: parseAtomEntries($, baseUrl) };
    }
    // RSS 2.0 必须有 <channel>（条目容器）或 <item>；只有 <rss> 外壳而无
    // 任何内容节点的文档视为格式损坏，而不是合法的空 feed。
    if ($('channel').length > 0 || $('item').length > 0) {
      return { ok: true, kind: 'rss', items: parseRssItems($, baseUrl) };
    }

    return {
      ok: false,
      code: 'FEED_PARSE_FAILED',
      message: '内容不是可识别的 RSS 2.0 / Atom / JSON Feed 格式',
    };
  } catch (error) {
    return {
      ok: false,
      code: 'FEED_PARSE_FAILED',
      message: `feed 解析失败: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

function parseJsonFeed(trimmed: string): FeedParseOutcome {
  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    return {
      ok: false,
      code: 'FEED_PARSE_FAILED',
      message: '内容以 JSON 开头但无法解析为 JSON Feed',
    };
  }

  const document = parsed && typeof parsed === 'object' ? parsed as Record<string, unknown> : null;
  if (!document || !Array.isArray(document.items)) {
    return {
      ok: false,
      code: 'FEED_PARSE_FAILED',
      message: 'JSON 内容缺少 JSON Feed 的 items 数组',
    };
  }

  const declaredVersion = typeof document.version === 'string' ? document.version : '';
  if (declaredVersion && !JSONFEED_VERSION_PATTERN.test(declaredVersion)) {
    return {
      ok: false,
      code: 'FEED_PARSE_FAILED',
      message: `JSON 对象不是 JSON Feed（version: ${declaredVersion}）`,
    };
  }

  const items: FeedItem[] = [];
  for (const raw of document.items) {
    if (!raw || typeof raw !== 'object') {
      continue;
    }
    const entry = raw as Record<string, unknown>;
    const title = normalizeText(readString(entry.title));
    const link = readString(entry.url) || readString(entry.external_url);
    if (!title || !link) {
      continue;
    }
    items.push({
      title,
      link,
      pubDate: normalizeDate(readString(entry.date_published)),
    });
  }

  return { ok: true, kind: 'json', items };
}

function parseRssItems(
  $: cheerio.CheerioAPI,
  baseUrl: string | undefined
): FeedItem[] {
  const items: FeedItem[] = [];
  $('item').each((_, element) => {
    const $item = $(element);
    const title = normalizeText($item.find('title').first().text());
    const href = $item.find('link').first().text() || $item.find('guid').first().text();
    const link = absolutizeLink(href, baseUrl);
    if (!title || !link) {
      return;
    }
    const pubDate = $item.find('pubDate').first().text()
      || $item.find('date').first().text();
    items.push({ title, link, pubDate: normalizeDate(pubDate) });
  });
  return items;
}

function parseAtomEntries(
  $: cheerio.CheerioAPI,
  baseUrl: string | undefined
): FeedItem[] {
  const items: FeedItem[] = [];
  $('entry').each((_, element) => {
    const $entry = $(element);
    const title = normalizeText($entry.find('title').first().text());
    const link = absolutizeLink(findAtomLink($, $entry), baseUrl);
    if (!title || !link) {
      return;
    }
    const published = $entry.find('published').first().text();
    const updated = $entry.find('updated').first().text();
    items.push({ title, link, pubDate: normalizeDate(published || updated) });
  });
  return items;
}

/** Atom 链接优先级：rel=alternate > 无 rel > 第一个 link 的 href。 */
function findAtomLink(
  $: cheerio.CheerioAPI,
  $entry: cheerio.Cheerio<any>
): string {
  const $alternate = $entry.find('link[rel="alternate"]').first();
  if ($alternate.attr('href')) {
    return $alternate.attr('href') as string;
  }

  const links = $entry.find('link').toArray();
  const plain = links.find((element) => !$(element).attr('rel'));
  if (plain) {
    return $(plain).attr('href') ?? '';
  }

  const $first = links.length > 0 ? $(links[0]) : null;
  return $first?.attr('href') ?? '';
}

function absolutizeLink(href: string | undefined, baseUrl: string | undefined): string {
  const value = String(href ?? '').trim();
  if (!value) {
    return '';
  }
  if (!baseUrl) {
    return value;
  }
  try {
    return new URL(value, baseUrl).toString();
  } catch {
    // 与 sogou 的同名处理一致：单条坏链接原样保留，不抹掉整个列表。
    return value;
  }
}

/** 可解析的日期输出 ISO 8601；无法解析时保留原文；空值返回空字符串。 */
function normalizeDate(raw: string): string {
  const value = normalizeText(raw);
  if (!value) {
    return '';
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }
  return parsed.toISOString();
}

function readString(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function normalizeText(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}
