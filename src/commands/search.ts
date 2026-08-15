import puppeteer, { LaunchOptions } from 'puppeteer-core';
import { SearchArgs, SearchSource } from '../lib/cli';
import { CommandError, getErrorMessage } from '../lib/command-error';
import { BROWSER_USER_AGENT, buildBrowserLaunchOptions } from '../lib/parser';
import {
  detectAntispider,
  hasSogouResultPageSkeleton,
  parseSogouResults,
  SOGOU_BASE_URL,
} from '../lib/sogou';
import {
  assertMirrorColumnUrl,
  extractWeixinUrl,
  isMirrorColumnUrl,
  parseColumnPage,
} from '../lib/mirror';
import { assertSafeArticleUrl } from '../lib/url';

const DEFAULT_SEARCH_INTERVAL_MS = 3000;
const DEFAULT_RESOLVE_TIMEOUT_MS = 10000;
const RESOLVE_POLL_INTERVAL_MS = 200;
const DEFAULT_NAVIGATION_TIMEOUT_MS = 60000;
const MIRROR_FETCH_TIMEOUT_MS = 30000;
const WEIXIN_ARTICLE_HOST = 'mp.weixin.qq.com';

const SOGOU_CAPTCHA_MESSAGE =
  '搜狗触发了验证码/反爬拦截，已立即停止（不会自动重试）。请稍后重试、降低频率，或改用 --source mirror / 直接提供文章链接';

/** search 编排层只依赖 page 的这些能力；mock-puppeteer 按同一形状注入。 */
interface SearchBrowserPage {
  goto(
    url: string,
    options: { waitUntil: 'domcontentloaded'; timeout: number }
  ): Promise<unknown>;
  setUserAgent(userAgent: string): Promise<unknown>;
  setExtraHTTPHeaders(headers: Record<string, string>): Promise<unknown>;
  content(): Promise<string>;
  url(): string;
}

export interface SearchResultItem {
  title: string;
  account: string | null;
  pubDate: string | null;
  sourceUrl: string | null;
  resolved: boolean;
}

export interface SearchCommandResult {
  query: string;
  source: SearchSource;
  account: string | null;
  limit: number;
  intervalMs: number;
  /** 仅 mirror 源输出。 */
  columnUrl?: string;
  items: SearchResultItem[];
}

/**
 * 逐条还原中途触发验证码等部分失败时，已解析条目随 result 保留，
 * error 非空即对应信封里的 status:"partial"。
 */
export interface SearchCommandOutcome {
  result: SearchCommandResult;
  error?: CommandError;
}

type ProgressLog = (message: string) => void;

export async function searchCommand(args: SearchArgs): Promise<SearchCommandOutcome> {
  const intervalMs = readPositiveIntegerEnv(
    'WECHAT_NOTEBANK_SEARCH_INTERVAL_MS',
    DEFAULT_SEARCH_INTERVAL_MS
  );
  const log: ProgressLog = args.json ? console.error : console.log;

  if (args.source === 'mirror') {
    return searchMirror(args, intervalMs, log);
  }
  return searchSogou(args, intervalMs, log);
}

/**
 * sogou 源：单命令单浏览器会话。先访问搜狗首页落 SNUID cookie，再进
 * 搜索页解析结果，逐条导航 link 页等待浏览器跳到 mp.weixin.qq.com 直链。
 */
async function searchSogou(
  args: SearchArgs,
  intervalMs: number,
  log: ProgressLog
): Promise<SearchCommandOutcome> {
  const browser = await puppeteer.launch(buildSearchLaunchOptions());
  try {
    const page = (await browser.newPage()) as unknown as SearchBrowserPage;
    await page.setUserAgent(BROWSER_USER_AGENT);
    await page.setExtraHTTPHeaders({ 'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8' });

    const result = baseResult(args, intervalMs);

    log(`🔍 正在通过搜狗搜索: ${args.query}`);
    await page.goto(SOGOU_BASE_URL, gotoOptions());
    await page.goto(buildSogouSearchUrl(args.query), gotoOptions());

    const listHtml = await page.content();
    if (detectAntispider(page.url(), listHtml)) {
      throw new CommandError('SOGOU_CAPTCHA', SOGOU_CAPTCHA_MESSAGE);
    }
    if (!hasSogouResultPageSkeleton(listHtml)) {
      throw new CommandError(
        'SEARCH_UNAVAILABLE',
        '搜狗结果页结构无法识别（可能是页面改版或站点不可达）。这与「没有搜到结果」不同，请检查数据源状态'
      );
    }

    let entries = parseSogouResults(listHtml);
    if (args.account) {
      entries = entries.filter((entry) => entry.account === args.account);
    }
    entries = entries.slice(0, args.limit);

    for (const entry of entries) {
      log(`🔗 正在还原直链: ${entry.title}`);
      const resolution = await resolveSogouEntry(page, entry.rawLink, intervalMs);
      if (resolution.captcha) {
        return {
          result,
          error: new CommandError(
            'SOGOU_CAPTCHA',
            '逐条还原直链中途触发搜狗验证码，已停止；已解析的条目保留在 result.items 中，可继续归档'
          ),
        };
      }
      result.items.push({
        title: entry.title,
        account: entry.account || null,
        pubDate: entry.pubDate || null,
        sourceUrl: resolution.sourceUrl,
        resolved: resolution.sourceUrl !== null,
      });
    }

    return { result };
  } finally {
    await browser.close();
  }
}

/** 逐条还原：sleep → goto(rawLink) → 轮询 page.url() 至微信直链（≤10s）→ 双闸校验。 */
async function resolveSogouEntry(
  page: SearchBrowserPage,
  rawLink: string,
  intervalMs: number
): Promise<{ captcha: boolean; sourceUrl: string | null }> {
  await sleep(intervalMs);

  try {
    await page.goto(rawLink, gotoOptions());
  } catch {
    // 单条导航失败不中断整批；下方仍会检查是否落入验证码页。
  }

  if (detectAntispider(page.url(), '')) {
    return { captcha: true, sourceUrl: null };
  }

  const finalUrl = await pollPageUrl(
    page,
    (url) => url.startsWith(`https://${WEIXIN_ARTICLE_HOST}/`),
    readResolveTimeoutMs()
  );

  if (detectAntispider(page.url(), '')) {
    return { captcha: true, sourceUrl: null };
  }

  if (!finalUrl) {
    return { captcha: false, sourceUrl: null };
  }

  return { captcha: false, sourceUrl: toResolvedWeixinUrl(finalUrl) };
}

/**
 * mirror 源：专栏页与 /t/ 文章页反爬较轻，用 global fetch + cheerio 即可，
 * 无需浏览器。翻页跟随（跨页按标题去重、分页循环保护）直到 limit 或无下
 * 一页，再逐条访问 /t/ 页还原微信直链。
 */
async function searchMirror(
  args: SearchArgs,
  intervalMs: number,
  log: ProgressLog
): Promise<SearchCommandOutcome> {
  let columnUrl: string;
  if (isMirrorColumnUrl(args.query)) {
    columnUrl = assertMirrorColumnUrl(args.query).toString();
  } else {
    // 关键词便利路径：借搜狗会话搜 site:jintiankansha.me 找专栏地址；
    // 找不到时给出结构化提示，引导用户直接贴专栏 URL。
    log(`🔍 正在通过搜狗查找「${args.query}」的今天看啥专栏`);
    columnUrl = await findMirrorColumnUrlViaSogou(args.query, intervalMs, log);
  }

  const result: SearchCommandResult = { ...baseResult(args, intervalMs), columnUrl };

  const entries: { title: string; url: string }[] = [];
  const seenTitles = new Set<string>();
  const visitedPages = new Set<string>();
  let pageUrl: string | null = columnUrl;
  while (pageUrl && entries.length < args.limit && !visitedPages.has(pageUrl)) {
    visitedPages.add(pageUrl);
    if (visitedPages.size > 1) {
      await sleep(intervalMs);
    }

    log(`📄 正在读取专栏页: ${pageUrl}`);
    const html = await fetchMirrorPage(pageUrl);
    if (detectAntispider(pageUrl, html)) {
      throw new CommandError(
        'SEARCH_UNAVAILABLE',
        '今天看啥触发了验证码/反爬拦截，已立即停止。请稍后重试或降低频率'
      );
    }

    const page = parseColumnPage(html, pageUrl);
    for (const item of page.items) {
      if (entries.length >= args.limit) {
        break;
      }
      if (seenTitles.has(item.title)) {
        continue;
      }
      seenTitles.add(item.title);
      entries.push(item);
    }
    pageUrl = page.nextPageUrl;
  }

  for (const entry of entries) {
    log(`🔗 正在还原直链: ${entry.title}`);
    await sleep(intervalMs);
    const sourceUrl = await resolveMirrorEntry(entry.url);
    result.items.push({
      title: entry.title,
      account: null,
      pubDate: null,
      sourceUrl,
      resolved: sourceUrl !== null,
    });
  }

  return { result };
}

/** 关键词 → 专栏 URL 的便利路径：搜狗搜 site:jintiankansha.me，逐条还原出专栏地址。 */
async function findMirrorColumnUrlViaSogou(
  keyword: string,
  intervalMs: number,
  log: ProgressLog
): Promise<string> {
  const mirrorHint = '请直接提供今天看啥专栏链接（https://www.jintiankansha.me/column/...）后重试';
  const browser = await puppeteer.launch(buildSearchLaunchOptions());
  try {
    const page = (await browser.newPage()) as unknown as SearchBrowserPage;
    await page.setUserAgent(BROWSER_USER_AGENT);
    await page.setExtraHTTPHeaders({ 'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8' });

    await page.goto(SOGOU_BASE_URL, gotoOptions());
    await page.goto(buildSogouSearchUrl(`site:jintiankansha.me ${keyword}`), gotoOptions());

    const listHtml = await page.content();
    if (detectAntispider(page.url(), listHtml)) {
      throw new CommandError('SOGOU_CAPTCHA', `${SOGOU_CAPTCHA_MESSAGE}；${mirrorHint}`);
    }
    if (!hasSogouResultPageSkeleton(listHtml)) {
      throw new CommandError(
        'SEARCH_UNAVAILABLE',
        `搜狗结果页结构无法识别，无法查找专栏。${mirrorHint}`
      );
    }

    for (const entry of parseSogouResults(listHtml)) {
      await sleep(intervalMs);
      try {
        await page.goto(entry.rawLink, gotoOptions());
      } catch {
        continue;
      }
      if (detectAntispider(page.url(), '')) {
        throw new CommandError('SOGOU_CAPTCHA', `${SOGOU_CAPTCHA_MESSAGE}；${mirrorHint}`);
      }
      const finalUrl = await pollPageUrl(
        page,
        (url) => isMirrorColumnUrl(url),
        readResolveTimeoutMs()
      );
      if (finalUrl) {
        log(`📚 找到专栏: ${finalUrl}`);
        return assertMirrorColumnUrl(finalUrl).toString();
      }
    }

    throw new CommandError(
      'SEARCH_UNAVAILABLE',
      `未能通过搜狗找到「${keyword}」的今天看啥专栏。${mirrorHint}`
    );
  } finally {
    await browser.close();
  }
}

/** 专栏页必须 200，否则视为数据源不可达（区别于「没有更多文章」）。 */
async function fetchMirrorPage(url: string): Promise<string> {
  let response: Response;
  try {
    response = await globalThis.fetch(url, mirrorFetchInit());
  } catch (error) {
    throw new CommandError(
      'SEARCH_UNAVAILABLE',
      `今天看啥页面获取失败: ${getErrorMessage(error)}`
    );
  }
  if (!response.ok) {
    throw new CommandError(
      'SEARCH_UNAVAILABLE',
      `今天看啥页面获取失败（HTTP ${response.status}）: ${url}`
    );
  }
  return response.text();
}

/** 单篇 /t/ 页还原失败（非 200 / 无直链 / 未过双闸）只标 resolved:false，不中断整批。 */
async function resolveMirrorEntry(articleUrl: string): Promise<string | null> {
  let html: string;
  try {
    const response = await globalThis.fetch(articleUrl, mirrorFetchInit());
    if (!response.ok) {
      return null;
    }
    html = await response.text();
  } catch {
    return null;
  }

  const weixinUrl = extractWeixinUrl(html);
  if (!weixinUrl) {
    return null;
  }
  return toResolvedWeixinUrl(weixinUrl);
}

/**
 * 输出安全闸：通用 SSRF 校验 + mp.weixin.qq.com host 全等白名单。
 * 未通过的 URL 不落 JSON（搜狗 rawLink 会过期、镜像 /t/ 链接无归档价值）。
 */
function toResolvedWeixinUrl(rawUrl: string): string | null {
  try {
    const parsed = assertSafeArticleUrl(rawUrl);
    if (parsed.hostname.toLowerCase() !== WEIXIN_ARTICLE_HOST) {
      return null;
    }
    return parsed.toString();
  } catch {
    return null;
  }
}

/**
 * search 复用 parser 的浏览器启动配置，并追加自己的反爬缓解：
 * `--disable-blink-features=AutomationControlled`，以及
 * `WECHAT_NOTEBANK_SEARCH_HEADFUL=1` 的有头逃生舱。fetch 的启动配置不变。
 */
function buildSearchLaunchOptions(): LaunchOptions {
  const launchOptions = buildBrowserLaunchOptions();
  launchOptions.args = [
    ...(launchOptions.args ?? []),
    '--disable-blink-features=AutomationControlled',
  ];
  if (process.env.WECHAT_NOTEBANK_SEARCH_HEADFUL === '1') {
    launchOptions.headless = false;
  }
  return launchOptions;
}

function baseResult(args: SearchArgs, intervalMs: number): SearchCommandResult {
  return {
    query: args.query,
    source: args.source,
    account: args.account ?? null,
    limit: args.limit,
    intervalMs,
    items: [],
  };
}

function buildSogouSearchUrl(query: string): string {
  return `${SOGOU_BASE_URL}/weixin?type=2&query=${encodeURIComponent(query)}`;
}

function gotoOptions(): { waitUntil: 'domcontentloaded'; timeout: number } {
  return {
    waitUntil: 'domcontentloaded',
    timeout: readPositiveIntegerEnv(
      'WECHAT_NOTEBANK_NAVIGATION_TIMEOUT_MS',
      DEFAULT_NAVIGATION_TIMEOUT_MS
    ),
  };
}

function mirrorFetchInit(): RequestInit {
  return {
    headers: {
      'User-Agent': BROWSER_USER_AGENT,
      'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
    },
    signal: AbortSignal.timeout(MIRROR_FETCH_TIMEOUT_MS),
  };
}

/** 轮询 page.url() 直到满足条件或超时；返回最终 URL，超时返回 null。 */
async function pollPageUrl(
  page: SearchBrowserPage,
  matches: (url: string) => boolean,
  timeoutMs: number
): Promise<string | null> {
  const deadline = Date.now() + timeoutMs;
  let current = page.url();
  while (!matches(current) && Date.now() < deadline) {
    await sleep(Math.min(RESOLVE_POLL_INTERVAL_MS, timeoutMs));
    current = page.url();
  }
  return matches(current) ? current : null;
}

function readResolveTimeoutMs(): number {
  // 测试专用：调低逐条直链还原的轮询上限；真实使用保持默认 10 秒。
  return readPositiveIntegerEnv(
    'WECHAT_NOTEBANK_SEARCH_RESOLVE_TIMEOUT_MS',
    DEFAULT_RESOLVE_TIMEOUT_MS
  );
}

function readPositiveIntegerEnv(name: string, fallback: number): number {
  const value = process.env[name];
  if (!value) {
    return fallback;
  }

  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
