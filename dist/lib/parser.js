"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.fetchArticleHtml = fetchArticleHtml;
exports.fetchArticleHtmlFromPage = fetchArticleHtmlFromPage;
exports.parseWechatArticle = parseWechatArticle;
exports.buildMeta = buildMeta;
const cheerio = __importStar(require("cheerio"));
const puppeteer_core_1 = __importDefault(require("puppeteer-core"));
const url_1 = require("./url");
const DEFAULT_NAVIGATION_TIMEOUT_MS = 60000;
const DEFAULT_CONTENT_TIMEOUT_MS = 30000;
/**
 * 使用 Puppeteer 获取微信公众号文章 HTML
 * 微信公众号有较强的反爬机制，需要使用无头浏览器
 */
async function fetchArticleHtml(url) {
    (0, url_1.assertSafeArticleUrl)(url);
    const launchOptions = {
        headless: true,
        args: [
            '--disable-dev-shm-usage',
            '--disable-accelerated-2d-canvas',
            '--disable-gpu',
            // 仅在 root / 容器等无法使用沙箱的环境才关闭 Chrome 沙箱。
            ...(shouldDisableSandbox() ? ['--no-sandbox', '--disable-setuid-sandbox'] : []),
        ],
    };
    if (process.env.WECHAT_NOTEBANK_CHROME_PATH) {
        launchOptions.executablePath = process.env.WECHAT_NOTEBANK_CHROME_PATH;
    }
    else {
        launchOptions.channel = 'chrome';
    }
    const browser = await puppeteer_core_1.default.launch(launchOptions);
    try {
        const page = await browser.newPage();
        // 设置 User-Agent
        await page.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
        // 设置额外的请求头
        await page.setExtraHTTPHeaders({
            'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
        });
        return await fetchArticleHtmlFromPage(page, url);
    }
    finally {
        await browser.close();
    }
}
async function fetchArticleHtmlFromPage(page, url) {
    try {
        await page.goto(url, {
            waitUntil: 'domcontentloaded',
            timeout: readPositiveIntegerEnv('WECHAT_NOTEBANK_NAVIGATION_TIMEOUT_MS', DEFAULT_NAVIGATION_TIMEOUT_MS),
        });
    }
    catch (error) {
        if (!isNavigationTimeoutError(error)) {
            throw error;
        }
    }
    // 微信文章的图片和统计请求可能很久不结束；正文出现后即可解析。
    await page.waitForSelector('#js_content', {
        timeout: readPositiveIntegerEnv('WECHAT_NOTEBANK_CONTENT_TIMEOUT_MS', DEFAULT_CONTENT_TIMEOUT_MS),
    }).catch(() => {
        // 继续返回页面内容，让解析层给出统一的文章结构错误。
    });
    return await page.content();
}
/**
 * 默认保留 Chrome 沙箱。仅当显式 opt-in，或以 root 身份运行
 * （沙箱无法在 root 下启动）时才关闭。
 */
function shouldDisableSandbox() {
    if (process.env.WECHAT_NOTEBANK_NO_SANDBOX === '1') {
        return true;
    }
    return typeof process.getuid === 'function' && process.getuid() === 0;
}
function isNavigationTimeoutError(error) {
    if (!(error instanceof Error)) {
        return false;
    }
    return error.name === 'TimeoutError' || /Navigation timeout/i.test(error.message);
}
function readPositiveIntegerEnv(name, fallback) {
    const value = process.env[name];
    if (!value) {
        return fallback;
    }
    const parsed = Number(value);
    return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}
/**
 * 解析微信公众号 HTML，提取文章内容
 */
function parseWechatArticle(html, url) {
    const $ = cheerio.load(html);
    // 尝试多种选择器来获取标题
    let title = '';
    if ($('#activity-name').length) {
        title = $('#activity-name').text().trim();
    }
    else if ($('h1').length) {
        title = $('h1').first().text().trim();
    }
    else if ($('.article-title').length) {
        title = $('.article-title').text().trim();
    }
    // 获取作者
    let author = '';
    if ($('#js_name').length) {
        author = $('#js_name').text().trim();
    }
    else if ($('.account_nickname').length) {
        author = $('.account_nickname').text().trim();
    }
    else if ($('[itemprop="author"]').length) {
        author = $('[itemprop="author"]').text().trim();
    }
    // 获取公众号名称
    let wechatName = author;
    // 获取发布时间
    let pubDate = '';
    if ($('#publish_time').length) {
        pubDate = $('#publish_time').text().trim();
    }
    else if ($('.time').length) {
        pubDate = $('.time').text().trim();
    }
    if (!pubDate) {
        pubDate = extractWechatTimestampDate(html);
    }
    // 获取正文内容
    let content = '';
    if ($('#js_content').length) {
        content = $('#js_content').html() || '';
    }
    else if ($('.article-content').length) {
        content = $('.article-content').html() || '';
    }
    else if ($('article').length) {
        content = $('article').html() || '';
    }
    // 如果解析失败，抛出错误
    if (!title || !content) {
        throw new Error('解析失败：无法提取文章标题或内容。可能是反爬机制或页面结构变化。');
    }
    // 清理 HTML
    content = cleanHtml(content);
    return {
        title,
        author,
        wechatName,
        pubDate: normalizeDate(pubDate),
        content,
    };
}
function cleanHtml(html) {
    const $ = cheerio.load(html);
    // 移除可能存在的脚注、版权信息等
    $('[class*="copyright"], [class*="footer"], [id*="copyright"]').remove();
    // 处理懒加载图片：将 data-src 转为 src（如果 src 是占位符）
    $('img[data-src]').each((_, img) => {
        const $img = $(img);
        const dataSrc = $img.attr('data-src');
        const currentSrc = $img.attr('src') || '';
        // 如果 src 是 data URI 占位符，用 data-src 替换
        if (currentSrc.startsWith('data:') || currentSrc === '') {
            if (dataSrc) {
                $img.attr('src', dataSrc);
            }
        }
        $img.removeAttr('data-src');
    });
    normalizeCodeBlocks($);
    // 保留段落和基本格式
    return $.html();
}
function normalizeCodeBlocks($) {
    $('.code-snippet__fix').each((_, snippet) => {
        const $snippet = $(snippet);
        const $pre = $snippet.is('pre') ? $snippet : $snippet.find('pre').first();
        if (!$pre.length) {
            return;
        }
        $snippet.replaceWith(createCleanCodeBlock($, $pre));
    });
    $('pre').each((_, pre) => {
        const $pre = $(pre);
        if (isCleanCodeBlock($pre)) {
            return;
        }
        $pre.replaceWith(createCleanCodeBlock($, $pre));
    });
}
function isCleanCodeBlock($pre) {
    const attrs = $pre.attr() || {};
    const $code = $pre.children('code');
    return Object.keys(attrs).length === 0 && $code.length === 1 && $code.children().length === 0;
}
function createCleanCodeBlock($, $pre) {
    const language = extractCodeLanguage($pre);
    const $cleanPre = $('<pre></pre>');
    const $cleanCode = $('<code></code>');
    if (language) {
        $cleanCode.attr('class', `language-${language}`);
    }
    $cleanCode.text(extractCodeText($, $pre));
    $cleanPre.append($cleanCode);
    return $cleanPre;
}
function extractCodeText($, $pre) {
    const $codeLines = $pre.children('code');
    const rawText = $codeLines.length > 1
        ? $codeLines
            .toArray()
            .map((code) => $(code).text())
            .join('\n')
        : $pre.text();
    return normalizeCodeText(rawText);
}
function normalizeCodeText(text) {
    return text
        .replace(/\r\n?/g, '\n')
        .replace(/\u00a0/g, ' ')
        .replace(/^\n+/, '')
        .replace(/\n+$/, '');
}
function extractCodeLanguage($pre) {
    const dataLang = sanitizeCodeLanguage($pre.attr('data-lang') || '');
    if (dataLang) {
        return dataLang;
    }
    const className = $pre.attr('class') || '';
    const classLang = className.match(/\b(?:language-|code-snippet__)([a-zA-Z0-9_+-]+)/);
    return sanitizeCodeLanguage(classLang?.[1] || '');
}
function sanitizeCodeLanguage(language) {
    return language
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9_+-]/g, '');
}
function normalizeDate(dateStr) {
    if (!dateStr)
        return new Date().toISOString().split('T')[0];
    const chineseDateMatch = dateStr.match(/(\d{4})\s*年\s*(\d{1,2})\s*月\s*(\d{1,2})\s*日/);
    if (chineseDateMatch) {
        return formatDateParts(Number(chineseDateMatch[1]), Number(chineseDateMatch[2]), Number(chineseDateMatch[3]));
    }
    const numericDateMatch = dateStr.match(/(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
    if (numericDateMatch) {
        return formatDateParts(Number(numericDateMatch[1]), Number(numericDateMatch[2]), Number(numericDateMatch[3]));
    }
    // 尝试解析日期
    const date = new Date(dateStr);
    if (isNaN(date.getTime())) {
        return new Date().toISOString().split('T')[0];
    }
    return date.toISOString().split('T')[0];
}
function extractWechatTimestampDate(html) {
    const match = html.match(/\bvar\s+ct\s*=\s*["'](\d{10})["']/);
    if (!match)
        return '';
    const timestamp = Number(match[1]) * 1000;
    const date = new Date(timestamp);
    if (isNaN(date.getTime()))
        return '';
    return formatDateInTimeZone(date, 'Asia/Shanghai');
}
function formatDateParts(year, month, day) {
    return [
        String(year).padStart(4, '0'),
        String(month).padStart(2, '0'),
        String(day).padStart(2, '0'),
    ].join('-');
}
function formatDateInTimeZone(date, timeZone) {
    const parts = new Intl.DateTimeFormat('en-US', {
        timeZone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
    }).formatToParts(date);
    const values = Object.fromEntries(parts
        .filter((part) => part.type !== 'literal')
        .map((part) => [part.type, part.value]));
    return `${values.year}-${values.month}-${values.day}`;
}
function buildMeta(result, url) {
    return {
        title: result.title,
        author: result.author,
        wechatName: result.wechatName,
        pubDate: result.pubDate,
        sourceUrl: url,
        archivedAt: new Date().toISOString(),
        tags: [],
    };
}
