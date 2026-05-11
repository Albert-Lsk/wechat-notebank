#!/usr/bin/env node
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const init_1 = require("./commands/init");
const fetch_1 = require("./commands/fetch");
const import_1 = require("./commands/import");
const config_1 = require("./lib/config");
const cli_1 = require("./lib/cli");
async function main() {
    const normalized = (0, cli_1.normalizeCliArgs)(process.argv.slice(2));
    const { command, args } = normalized;
    // 帮助信息
    if (command === '--help' || command === '-h' || !command) {
        console.log(`
wechat-notebank / alskai-notebank - 微信公众号文章存档工具 🏦

使用方法:
  alskai-notebank init                    初始化知识库
  alskai-notebank <url> [--output <folder>]
                                          存档文章
  alskai-notebank import <Excel文件地址>   批量导入文章

兼容命令:
  wechat-notebank fetch <url> [--output <folder>]
                                          存档文章
  wechat-notebank import <Excel文件地址>   批量导入文章
  wechat-notebank --help                  显示帮助

示例:
  alskai-notebank https://mp.weixin.qq.com/s/xxx -o ~/WeChatArticles
  alskai-notebank import ./articles.xlsx
  wechat-notebank fetch https://mp.weixin.qq.com/s/xxx

首次使用会自动引导初始化设置。
    `);
        return;
    }
    // 初始化命令
    if (command === 'init') {
        await (0, init_1.initCommand)();
        return;
    }
    // fetch 命令
    if (command === 'fetch') {
        let fetchArgs;
        try {
            fetchArgs = (0, cli_1.parseFetchArgs)(args);
        }
        catch (error) {
            console.error(`❌ ${error instanceof Error ? error.message : '参数错误'}`);
            console.error('   用法: alskai-notebank <url> [--output <folder>]');
            process.exit(1);
        }
        const { url, outputPath } = fetchArgs;
        if (!url) {
            console.error('❌ 请提供文章链接');
            console.error('   用法: alskai-notebank <url> [--output <folder>]');
            process.exit(1);
        }
        // 未指定输出目录时，沿用默认配置；不存在则引导初始化
        if (!outputPath && !(await (0, config_1.configExists)())) {
            console.log('🤖 首次使用，正在引导初始化...\n');
            await (0, init_1.initCommand)();
            console.log('');
        }
        await (0, fetch_1.fetchCommand)(url, outputPath);
        return;
    }
    // import 命令
    if (command === 'import') {
        let importArgs;
        try {
            importArgs = (0, cli_1.parseImportArgs)(args);
        }
        catch (error) {
            console.error(`❌ ${error instanceof Error ? error.message : '参数错误'}`);
            console.error('   用法: alskai-notebank import <Excel文件地址>');
            process.exit(1);
        }
        try {
            await (0, import_1.importCommand)(importArgs.filePath);
        }
        catch (error) {
            console.error(`\n❌ 导入失败: ${error instanceof Error ? error.message : '未知错误'}`);
            process.exit(1);
        }
        return;
    }
    // 未知命令
    console.error(`❌ 未知命令: ${command}`);
    console.error('   使用 alskai-notebank --help 查看帮助');
    process.exit(1);
}
main();
