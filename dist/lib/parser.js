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
exports.parseWechatArticle = parseWechatArticle;
exports.buildMeta = buildMeta;
const cheerio = __importStar(require("cheerio"));
const puppeteer_core_1 = __importDefault(require("puppeteer-core"));
/**
 * 使用 Puppeteer 获取微信公众号文章 HTML
 * 微信公众号有较强的反爬机制，需要使用无头浏览器
 */
async function fetchArticleHtml(url) {
    const launchOptions = {
        headless: true,
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-accelerated-2d-canvas',
            '--disable-gpu',
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
        // 访问页面
        await page.goto(url, {
            waitUntil: 'networkidle2',
            timeout: 30000,
        });
        // 等待文章内容加载
        await page.waitForSelector('#js_content', { timeout: 10000 }).catch(() => {
            // 可能已经加载，忽略超时
        });
        // 获取渲染后的 HTML
        const html = await page.content();
        return html;
    }
    finally {
        await browser.close();
    }
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
    // 保留段落和基本格式
    return $.html();
}
function normalizeDate(dateStr) {
    if (!dateStr)
        return new Date().toISOString().split('T')[0];
    // 尝试解析日期
    const date = new Date(dateStr);
    if (isNaN(date.getTime())) {
        return new Date().toISOString().split('T')[0];
    }
    return date.toISOString().split('T')[0];
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
