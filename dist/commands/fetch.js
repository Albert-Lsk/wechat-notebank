"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.fetchCommand = fetchCommand;
const parser_1 = require("../lib/parser");
const storage_1 = require("../lib/storage");
const config_1 = require("../lib/config");
async function fetchCommand(url) {
    // 检查配置
    const config = await (0, config_1.readConfig)();
    if (!config) {
        console.log('❌ 未找到配置文件，请先运行 wechat-notebank init');
        return;
    }
    console.log(`📥 正在获取文章: ${url}`);
    try {
        // 获取 HTML
        const html = await (0, parser_1.fetchArticleHtml)(url);
        // 解析文章
        const parseResult = (0, parser_1.parseWechatArticle)(html, url);
        // 构建元数据
        const meta = (0, parser_1.buildMeta)(parseResult, url);
        // 保存文件
        const filePath = await (0, storage_1.saveArticle)(config.archivePath, parseResult.title, parseResult.content, meta);
        console.log(`\n✅ 文章已保存！`);
        console.log(`📄 文件: ${filePath}`);
        console.log(`📌 标题: ${meta.title}`);
        console.log(`👤 作者: ${meta.author}`);
        console.log(`📅 发布: ${meta.pubDate}`);
        console.log(`🏷️  来源: ${meta.wechatName}`);
    }
    catch (error) {
        console.error(`\n❌ 错误: ${error instanceof Error ? error.message : '未知错误'}`);
        process.exit(1);
    }
}
