#!/usr/bin/env node
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const init_1 = require("./commands/init");
const fetch_1 = require("./commands/fetch");
const import_1 = require("./commands/import");
const setup_1 = require("./commands/setup");
const doctor_1 = require("./commands/doctor");
const pack_1 = require("./commands/pack");
const pack_approve_1 = require("./commands/pack-approve");
const pack_update_1 = require("./commands/pack-update");
const pack_reject_1 = require("./commands/pack-reject");
const pack_revoke_1 = require("./commands/pack-revoke");
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
  alskai-notebank setup --agents <codex|claude|codex,claude> [--dry-run] [--json]
                                          安装或更新 Agent 集成（macOS Apple Silicon）
  alskai-notebank doctor [--json]          只读诊断环境、配置与加工包完整性
  alskai-notebank pack create --source <file> --manifest <manifest.json> [--json]
                                          创建或修订待审核加工包
  alskai-notebank pack update <pack> --manifest <manifest.json> [--json]
                                          记录 L4 用户回答与 Agent 整理稿
  alskai-notebank pack approve <pack> --items <ids> [--json]
                                          选择性发布 L2/L3/L4 候选内容
  alskai-notebank pack reject <pack> [--json]
                                          拒绝待审核加工包
  alskai-notebank pack revoke <pack> --items <ids> [--json]
                                          撤销已发布的候选内容
  alskai-notebank <url> [--output <folder>] [--json]
                                          存档文章
  alskai-notebank import <Excel文件地址> [--json]
                                          批量导入文章

兼容命令:
  wechat-notebank fetch <url> [--output <folder>] [--json]
                                          存档文章
  wechat-notebank import <Excel文件地址> [--json]
                                          批量导入文章
  wechat-notebank --help                  显示帮助

示例:
  alskai-notebank https://mp.weixin.qq.com/s/xxx -o ~/WeChatArticles
  alskai-notebank setup --agents codex --dry-run --json
  alskai-notebank doctor --json
  alskai-notebank pack create --source ./原文.md --manifest ./manifest.json --json
  alskai-notebank pack update ./Inbox/待审核加工包.md --manifest ./manifest.json --json
  alskai-notebank pack approve ./Inbox/待审核加工包.md --items L2-01,L3-02 --json
  alskai-notebank pack reject ./Inbox/待审核加工包.md --json
  alskai-notebank pack revoke ./Inbox/待审核加工包.md --items L2-01 --json
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
    if (command === 'setup') {
        const jsonRequested = (0, cli_1.isJsonOutputRequested)(args);
        try {
            const setupArgs = (0, cli_1.parseSetupArgs)(args);
            const result = await (0, setup_1.setupCommand)(setupArgs);
            if (setupArgs.json) {
                const unchanged = result.actions.every((action) => action.status === 'unchanged');
                (0, command_output_1.writeJsonOutput)({
                    ok: true,
                    command: 'setup',
                    status: unchanged ? 'unchanged' : setupArgs.dryRun ? 'planned' : 'installed',
                    result,
                });
            }
            else {
                for (const action of result.actions) {
                    const label = action.status === 'planned'
                        ? '预演'
                        : action.status === 'unchanged'
                            ? '无需更新'
                            : action.status === 'updated'
                                ? '已更新'
                                : '已安装';
                    console.log(`${label}: ${action.agent} -> ${action.target}`);
                }
                if (result.restartRequired) {
                    const agentNames = result.agents.map((agent) => agent === 'codex' ? 'Codex' : 'Claude Code');
                    console.log(`请重启 ${agentNames.join(' 和 ')} 以重新发现 Skill。`);
                }
            }
        }
        catch (error) {
            const commandError = error instanceof command_error_1.CommandError
                ? error
                : new command_error_1.CommandError('CLI_USAGE_ERROR', (0, command_error_1.getErrorMessage)(error));
            if (jsonRequested) {
                writeCommandJsonFailure('setup', commandError);
                return;
            }
            console.error(`❌ ${commandError.message}`);
            process.exitCode = 1;
        }
        return;
    }
    if (command === 'doctor') {
        const jsonRequested = (0, cli_1.isJsonOutputRequested)(args);
        try {
            const doctorArgs = (0, cli_1.parseDoctorArgs)(args);
            const result = await (0, doctor_1.doctorCommand)();
            if (doctorArgs.json) {
                (0, command_output_1.writeJsonOutput)({
                    ok: result.status !== 'failed',
                    command: 'doctor',
                    status: result.status,
                    result: {
                        version: result.version,
                        checks: result.checks,
                    },
                    ...(result.error ? { error: result.error } : {}),
                });
            }
            else {
                for (const check of result.checks) {
                    console.log(`${check.status}: ${check.id} - ${check.message}`);
                }
            }
            if (result.status === 'failed') {
                process.exitCode = 1;
            }
        }
        catch (error) {
            const commandError = error instanceof command_error_1.CommandError
                ? error
                : new command_error_1.CommandError('CLI_USAGE_ERROR', (0, command_error_1.getErrorMessage)(error));
            if (jsonRequested) {
                writeCommandJsonFailure('doctor', commandError);
                return;
            }
            console.error(`❌ ${commandError.message}`);
            process.exitCode = 1;
        }
        return;
    }
    if (command === 'pack') {
        const jsonRequested = (0, cli_1.isJsonOutputRequested)(args);
        const operation = args[0];
        const commandName = operation === 'approve'
            ? 'pack.approve'
            : operation === 'update'
                ? 'pack.update'
                : operation === 'reject'
                    ? 'pack.reject'
                    : operation === 'revoke'
                        ? 'pack.revoke'
                        : 'pack.create';
        try {
            if (operation === 'approve') {
                const packArgs = (0, cli_1.parsePackApproveArgs)(args);
                const result = await (0, pack_approve_1.approvePackCommand)(packArgs);
                if (packArgs.json) {
                    (0, command_output_1.writeJsonOutput)({
                        ok: true,
                        command: 'pack.approve',
                        status: result.action === 'reuse' ? 'unchanged' : result.status,
                        result,
                    });
                }
                else {
                    console.log(`✅ 已发布加工包内容: ${result.publishedFiles.join(', ')}`);
                }
                return;
            }
            if (operation === 'update') {
                const packArgs = (0, cli_1.parsePackUpdateArgs)(args);
                const result = await (0, pack_update_1.updatePackCommand)(packArgs);
                if (packArgs.json) {
                    (0, command_output_1.writeJsonOutput)({
                        ok: true,
                        command: 'pack.update',
                        status: result.action === 'reuse' ? 'unchanged' : 'updated',
                        result,
                    });
                }
                else {
                    console.log(`✅ 加工包审核回答已更新: ${result.packFile}`);
                }
                return;
            }
            if (operation === 'reject') {
                const packArgs = (0, cli_1.parsePackRejectArgs)(args);
                const result = await (0, pack_reject_1.rejectPackCommand)(packArgs);
                if (packArgs.json) {
                    (0, command_output_1.writeJsonOutput)({
                        ok: true,
                        command: 'pack.reject',
                        status: result.action === 'reuse' ? 'unchanged' : 'rejected',
                        result,
                    });
                }
                else {
                    console.log(`✅ 加工包已拒绝: ${result.packFile}`);
                }
                return;
            }
            if (operation === 'revoke') {
                const packArgs = (0, cli_1.parsePackRevokeArgs)(args);
                const result = await (0, pack_revoke_1.revokePackCommand)(packArgs);
                if (packArgs.json) {
                    (0, command_output_1.writeJsonOutput)({
                        ok: true,
                        command: 'pack.revoke',
                        status: result.action === 'reuse' ? 'unchanged' : 'revoked',
                        result,
                    });
                }
                else {
                    console.log(`✅ 已撤销加工包候选: ${result.revokedItems.join(', ')}`);
                }
                return;
            }
            const packArgs = (0, cli_1.parsePackCreateArgs)(args);
            const result = await (0, pack_1.createPackCommand)(packArgs);
            if (packArgs.json) {
                (0, command_output_1.writeJsonOutput)({
                    ok: true,
                    command: 'pack.create',
                    status: result.action === 'reuse'
                        ? 'unchanged'
                        : result.action === 'revise'
                            ? 'revised'
                            : 'created',
                    result,
                });
            }
            else {
                console.log(`✅ 待审核加工包已创建: ${result.packFile}`);
            }
        }
        catch (error) {
            const commandError = error instanceof command_error_1.CommandError
                ? error
                : new command_error_1.CommandError('CLI_USAGE_ERROR', (0, command_error_1.getErrorMessage)(error));
            if (jsonRequested) {
                writeCommandJsonFailure(commandName, commandError);
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
                    status: result.reason === 'SOURCE_URL_EXISTS' ? 'skipped' : 'saved',
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
        const jsonRequested = (0, cli_1.isJsonOutputRequested)(args);
        let importArgs;
        try {
            importArgs = (0, cli_1.parseImportArgs)(args);
        }
        catch (error) {
            const commandError = new command_error_1.CommandError('CLI_USAGE_ERROR', (0, command_error_1.getErrorMessage)(error));
            if (jsonRequested) {
                writeCommandJsonFailure('import', commandError);
                return;
            }
            console.error(`❌ ${commandError.message}`);
            console.error('   用法: alskai-notebank import <Excel文件地址> [--json]');
            process.exitCode = 1;
            return;
        }
        try {
            const result = await (0, import_1.importCommand)(importArgs.filePath, { json: importArgs.json });
            if (importArgs.json) {
                if (result.summary.failure > 0) {
                    const message = `批量导入完成，但有 ${result.summary.failure} 行失败`;
                    (0, command_output_1.writeJsonOutput)({
                        ok: false,
                        command: 'import',
                        status: 'partial',
                        result,
                        error: {
                            code: 'TRANSACTION_FAILED',
                            message,
                        },
                    });
                    process.exitCode = 1;
                }
                else {
                    (0, command_output_1.writeJsonOutput)({
                        ok: true,
                        command: 'import',
                        status: 'completed',
                        result,
                    });
                }
            }
        }
        catch (error) {
            const commandError = error instanceof command_error_1.CommandError
                ? error
                : new command_error_1.CommandError('TRANSACTION_FAILED', (0, command_error_1.getErrorMessage)(error));
            if (importArgs.json) {
                writeCommandJsonFailure('import', commandError);
                return;
            }
            console.error(`\n❌ 导入失败: ${commandError.message}`);
            process.exitCode = 1;
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
