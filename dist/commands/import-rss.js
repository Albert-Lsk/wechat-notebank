"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.importRssCommand = importRssCommand;
const command_error_1 = require("../lib/command-error");
const feed_1 = require("../lib/feed");
const parser_1 = require("../lib/parser");
const url_1 = require("../lib/url");
const FEED_FETCH_TIMEOUT_MS = 30000;
const WEIXIN_ARTICLE_HOST = 'mp.weixin.qq.com';
/** 存在 resolvable:false 条目时随 result 附带的说明。 */
const UNRESOLVABLE_NOTE = '当前 fetch 仅支持微信文章页：resolvable:false 的条目仅供查看，不能交给 fetch 归档';
/**
 * import-rss 命令：读取 RSS 2.0 / Atom / JSON Feed 源，枚举统一条目列表。
 *
 * 与 search 同构的只读发现命令：零落盘，不写知识库任何文件；归档由用户
 * 挑选后逐篇调用 fetch。feed URL 与全部条目链接都过 assertSafeArticleUrl
 * 安全闸，未通过的条目标 resolvable:false 而不是静默丢弃。
 */
async function importRssCommand(args) {
    let feedUrl;
    try {
        feedUrl = (0, url_1.assertSafeArticleUrl)(args.feedUrl, { allowPrivate: args.allowLocal });
    }
    catch (error) {
        throw new command_error_1.CommandError('CLI_USAGE_ERROR', `feed 链接未通过安全校验: ${(0, command_error_1.getErrorMessage)(error)}`);
    }
    const feedText = await fetchFeedText(feedUrl.toString());
    const outcome = (0, feed_1.parseFeed)(feedText, feedUrl.toString());
    if (!outcome.ok) {
        throw new command_error_1.CommandError('FEED_PARSE_FAILED', outcome.message);
    }
    const items = outcome.items.slice(0, args.limit).map((item) => ({
        title: item.title,
        link: item.link,
        pubDate: item.pubDate || null,
        resolvable: isResolvableArticleUrl(item.link),
    }));
    return {
        feedUrl: feedUrl.toString(),
        feedKind: outcome.kind,
        limit: args.limit,
        items,
        ...(items.some((item) => !item.resolvable) ? { note: UNRESOLVABLE_NOTE } : {}),
    };
}
/** feed 必须可达且返回 2xx；超时/网络错误/非 2xx 都映射 FEED_UNAVAILABLE。 */
async function fetchFeedText(url) {
    let response;
    try {
        response = await globalThis.fetch(url, {
            headers: {
                'User-Agent': parser_1.BROWSER_USER_AGENT,
                Accept: 'application/rss+xml, application/atom+xml, application/feed+json, '
                    + 'application/json, application/xml, text/xml;q=0.9, */*;q=0.8',
            },
            signal: AbortSignal.timeout(FEED_FETCH_TIMEOUT_MS),
        });
    }
    catch (error) {
        throw new command_error_1.CommandError('FEED_UNAVAILABLE', `feed 获取失败: ${(0, command_error_1.getErrorMessage)(error)}`);
    }
    if (!response.ok) {
        throw new command_error_1.CommandError('FEED_UNAVAILABLE', `feed 获取失败（HTTP ${response.status}）: ${url}`);
    }
    try {
        return await response.text();
    }
    catch (error) {
        throw new command_error_1.CommandError('FEED_UNAVAILABLE', `feed 响应读取失败: ${(0, command_error_1.getErrorMessage)(error)}`);
    }
}
/** 安全闸 + host 白名单：可归档当且仅当通过校验且为 mp.weixin.qq.com。 */
function isResolvableArticleUrl(rawLink) {
    try {
        const parsed = (0, url_1.assertSafeArticleUrl)(rawLink);
        return parsed.hostname.toLowerCase() === WEIXIN_ARTICLE_HOST;
    }
    catch {
        return false;
    }
}
