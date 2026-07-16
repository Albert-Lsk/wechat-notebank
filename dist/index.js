#!/usr/bin/env node
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const init_1 = require("./commands/init");
const fetch_1 = require("./commands/fetch");
const import_1 = require("./commands/import");
const config_1 = require("./lib/config");
const cli_1 = require("./lib/cli");
const command_output_1 = require("./lib/command-output");
const command_error_1 = require("./lib/command-error");
async function main() {
    const normalized = (0, cli_1.normalizeCliArgs)(process.argv.slice(2));
    const { command, args } = normalized;
    // 帮助信息
    if (command === '--help' || command === '-h' || !command) {
        console.log(`
wechat-notebank / alskai-notebank - 微信公众号文章存档工具 🏦

使用方法:
  alskai-notebank init                    初始化知识库
  alskai-notebank init --scope <global|project> --archive-path <folder> [options]
                                          配置全局默认或项目覆盖
  alskai-notebank <url> [--output <folder>] [--json]
                                          存档文章
  alskai-notebank import <Excel文件地址>   批量导入文章

兼容命令:
  wechat-notebank fetch <url> [--output <folder>] [--json]
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
        const jsonRequested = (0, cli_1.isJsonOutputRequested)(args);
        let initArgs;
        try {
            initArgs = (0, cli_1.parseInitArgs)(args);
        }
        catch (error) {
            const commandError = new command_error_1.CommandError('CLI_USAGE_ERROR', (0, command_error_1.getErrorMessage)(error));
            if (jsonRequested) {
                writeCommandJsonFailure('init', commandError);
                return;
            }
            console.error(`❌ ${commandError.message}`);
            process.exitCode = 1;
            return;
        }
        try {
            const result = await (0, init_1.initCommand)(initArgs);
            if (initArgs.json && result) {
                (0, command_output_1.writeJsonOutput)({
                    ok: true,
                    command: 'init',
                    status: 'configured',
                    result,
                });
            }
            else if (result) {
                console.log('✅ 配置已保存');
                console.log(`📍 范围: ${result.scope}`);
                console.log(`📄 配置: ${result.configFile}`);
                console.log(`📁 归档: ${result.archivePath}`);
            }
        }
        catch (error) {
            const commandError = error instanceof command_error_1.CommandError
                ? error
                : new command_error_1.CommandError('CONFIG_INVALID', (0, command_error_1.getErrorMessage)(error));
            if (initArgs.json) {
                writeCommandJsonFailure('init', commandError);
                return;
            }
            console.error(`❌ ${commandError.message}`);
            process.exitCode = 1;
        }
        return;
    }
    // fetch 命令
    if (command === 'fetch') {
        const jsonRequested = (0, cli_1.isJsonOutputRequested)(args);
        let fetchArgs;
        try {
            fetchArgs = (0, cli_1.parseFetchArgs)(args);
        }
        catch (error) {
            const message = error instanceof Error ? error.message : '参数错误';
            if (jsonRequested) {
                writeCommandJsonFailure('fetch', new command_error_1.CommandError('CLI_USAGE_ERROR', message));
                return;
            }
            console.error(`❌ ${message}`);
            console.error('   用法: alskai-notebank <url> [--output <folder>] [--json]');
            process.exitCode = 1;
            return;
        }
        const { url, outputPath, json } = fetchArgs;
        if (!url) {
            if (json) {
                writeCommandJsonFailure('fetch', new command_error_1.CommandError('CLI_USAGE_ERROR', '请提供文章链接'));
                return;
            }
            console.error('❌ 请提供文章链接');
            console.error('   用法: alskai-notebank <url> [--output <folder>] [--json]');
            process.exitCode = 1;
            return;
        }
        // 未指定输出目录时，沿用默认配置；不存在则引导初始化
        if (!json && !outputPath && !(await (0, config_1.configExists)())) {
            console.log('🤖 首次使用，正在引导初始化...\n');
            await (0, init_1.initCommand)();
            console.log('');
        }
        try {
            const result = await (0, fetch_1.fetchCommand)(url, outputPath, { json });
            if (json) {
                (0, command_output_1.writeJsonOutput)({
                    ok: true,
                    command: 'fetch',
                    status: 'saved',
                    result,
                });
            }
        }
        catch (error) {
            const commandError = error instanceof command_error_1.CommandError
                ? error
                : new command_error_1.CommandError('ARTICLE_UNAVAILABLE', (0, command_error_1.getErrorMessage)(error));
            if (json) {
                writeCommandJsonFailure('fetch', commandError);
                return;
            }
            console.error(`\n❌ 错误: ${commandError.message}`);
            process.exitCode = 1;
        }
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
function writeCommandJsonFailure(command, error) {
    console.error(`❌ ${error.message}`);
    (0, command_output_1.writeJsonOutput)({
        ok: false,
        command,
        status: 'failed',
        error: {
            code: error.code,
            message: error.message,
        },
    });
    process.exitCode = 1;
}
main();
