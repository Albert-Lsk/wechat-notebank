#!/usr/bin/env node

import { initCommand } from './commands/init';
import { fetchCommand } from './commands/fetch';
import { importCommand } from './commands/import';
import { setupCommand } from './commands/setup';
import { doctorCommand } from './commands/doctor';
import { createPackCommand } from './commands/pack';
import { approvePackCommand } from './commands/pack-approve';
import { updatePackCommand } from './commands/pack-update';
import { configExists } from './lib/config';
import {
  isJsonOutputRequested,
  normalizeCliArgs,
  parseFetchArgs,
  parseDoctorArgs,
  parseInitArgs,
  parseImportArgs,
  parsePackCreateArgs,
  parsePackApproveArgs,
  parsePackUpdateArgs,
  parseSetupArgs,
} from './lib/cli';
import { writeJsonOutput } from './lib/command-output';
import { CommandError, getErrorMessage } from './lib/command-error';

async function main() {
  const normalized = normalizeCliArgs(process.argv.slice(2));
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
  alskai-notebank doctor [--json]          只读诊断环境、CLI、Skill 与配置
  alskai-notebank pack create --source <file> --manifest <manifest.json> [--json]
                                          创建或修订待审核加工包
  alskai-notebank pack update <pack> --manifest <manifest.json> [--json]
                                          记录 L4 用户回答与 Agent 整理稿
  alskai-notebank pack approve <pack> --items <ids> [--json]
                                          选择性发布 L2/L3/L4 候选内容
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
  alskai-notebank import ./articles.xlsx
  wechat-notebank fetch https://mp.weixin.qq.com/s/xxx

首次使用会自动引导初始化设置。
    `);
    return;
  }

  // 初始化命令
  if (command === 'init') {
    const jsonRequested = isJsonOutputRequested(args);
    let initArgs;
    try {
      initArgs = parseInitArgs(args);
    } catch (error) {
      const commandError = new CommandError('CLI_USAGE_ERROR', getErrorMessage(error));
      if (jsonRequested) {
        writeCommandJsonFailure('init', commandError);
        return;
      }
      console.error(`❌ ${commandError.message}`);
      process.exitCode = 1;
      return;
    }

    try {
      const result = await initCommand(initArgs);
      if (initArgs.json && result) {
        writeJsonOutput({
          ok: true,
          command: 'init',
          status: 'configured',
          result,
        });
      } else if (result) {
        console.log('✅ 配置已保存');
        console.log(`📍 范围: ${result.scope}`);
        console.log(`📄 配置: ${result.configFile}`);
        console.log(`📁 归档: ${result.archivePath}`);
      }
    } catch (error) {
      const commandError = error instanceof CommandError
        ? error
        : new CommandError('CONFIG_INVALID', getErrorMessage(error));
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
    const jsonRequested = isJsonOutputRequested(args);
    try {
      const setupArgs = parseSetupArgs(args);
      const result = await setupCommand(setupArgs);
      if (setupArgs.json) {
        const unchanged = result.actions.every((action) => action.status === 'unchanged');
        writeJsonOutput({
          ok: true,
          command: 'setup',
          status: unchanged ? 'unchanged' : setupArgs.dryRun ? 'planned' : 'installed',
          result,
        });
      } else {
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
          const agentNames = result.agents.map(
            (agent) => agent === 'codex' ? 'Codex' : 'Claude Code'
          );
          console.log(`请重启 ${agentNames.join(' 和 ')} 以重新发现 Skill。`);
        }
      }
    } catch (error) {
      const commandError = error instanceof CommandError
        ? error
        : new CommandError('CLI_USAGE_ERROR', getErrorMessage(error));
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
    const jsonRequested = isJsonOutputRequested(args);
    try {
      const doctorArgs = parseDoctorArgs(args);
      const result = await doctorCommand();
      if (doctorArgs.json) {
        writeJsonOutput({
          ok: result.status !== 'failed',
          command: 'doctor',
          status: result.status,
          result: {
            version: result.version,
            checks: result.checks,
          },
          ...(result.error ? { error: result.error } : {}),
        });
      } else {
        for (const check of result.checks) {
          console.log(`${check.status}: ${check.id} - ${check.message}`);
        }
      }
      if (result.status === 'failed') {
        process.exitCode = 1;
      }
    } catch (error) {
      const commandError = error instanceof CommandError
        ? error
        : new CommandError('CLI_USAGE_ERROR', getErrorMessage(error));
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
    const jsonRequested = isJsonOutputRequested(args);
    const operation = args[0];
    const commandName = operation === 'approve'
      ? 'pack.approve'
      : operation === 'update'
        ? 'pack.update'
        : 'pack.create';
    try {
      if (operation === 'approve') {
        const packArgs = parsePackApproveArgs(args);
        const result = await approvePackCommand(packArgs);
        if (packArgs.json) {
          writeJsonOutput({
            ok: true,
            command: 'pack.approve',
            status: result.action === 'reuse' ? 'unchanged' : result.status,
            result,
          });
        } else {
          console.log(`✅ 已发布加工包内容: ${result.publishedFiles.join(', ')}`);
        }
        return;
      }
      if (operation === 'update') {
        const packArgs = parsePackUpdateArgs(args);
        const result = await updatePackCommand(packArgs);
        if (packArgs.json) {
          writeJsonOutput({
            ok: true,
            command: 'pack.update',
            status: result.action === 'reuse' ? 'unchanged' : 'updated',
            result,
          });
        } else {
          console.log(`✅ 加工包审核回答已更新: ${result.packFile}`);
        }
        return;
      }
      const packArgs = parsePackCreateArgs(args);
      const result = await createPackCommand(packArgs);
      if (packArgs.json) {
        writeJsonOutput({
          ok: true,
          command: 'pack.create',
          status: result.action === 'reuse'
            ? 'unchanged'
            : result.action === 'revise'
              ? 'revised'
              : 'created',
          result,
        });
      } else {
        console.log(`✅ 待审核加工包已创建: ${result.packFile}`);
      }
    } catch (error) {
      const commandError = error instanceof CommandError
        ? error
        : new CommandError('CLI_USAGE_ERROR', getErrorMessage(error));
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
    const jsonRequested = isJsonOutputRequested(args);
    let fetchArgs;
    try {
      fetchArgs = parseFetchArgs(args);
    } catch (error) {
      const message = error instanceof Error ? error.message : '参数错误';
      if (jsonRequested) {
        writeCommandJsonFailure('fetch', new CommandError('CLI_USAGE_ERROR', message));
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
        writeCommandJsonFailure('fetch', new CommandError('CLI_USAGE_ERROR', '请提供文章链接'));
        return;
      }

      console.error('❌ 请提供文章链接');
      console.error('   用法: alskai-notebank <url> [--output <folder>] [--json]');
      process.exitCode = 1;
      return;
    }

    // 未指定输出目录时，沿用默认配置；不存在则引导初始化
    if (!json && !outputPath && !(await configExists())) {
      console.log('🤖 首次使用，正在引导初始化...\n');
      await initCommand();
      console.log('');
    }

    try {
      const result = await fetchCommand(url, outputPath, { json });
      if (json) {
        writeJsonOutput({
          ok: true,
          command: 'fetch',
          status: result.reason === 'SOURCE_URL_EXISTS' ? 'skipped' : 'saved',
          result,
        });
      }
    } catch (error) {
      const commandError = error instanceof CommandError
        ? error
        : new CommandError('ARTICLE_UNAVAILABLE', getErrorMessage(error));

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
    const jsonRequested = isJsonOutputRequested(args);
    let importArgs;
    try {
      importArgs = parseImportArgs(args);
    } catch (error) {
      const commandError = new CommandError('CLI_USAGE_ERROR', getErrorMessage(error));
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
      const result = await importCommand(importArgs.filePath, { json: importArgs.json });
      if (importArgs.json) {
        if (result.summary.failure > 0) {
          const message = `批量导入完成，但有 ${result.summary.failure} 行失败`;
          writeJsonOutput({
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
        } else {
          writeJsonOutput({
            ok: true,
            command: 'import',
            status: 'completed',
            result,
          });
        }
      }
    } catch (error) {
      const commandError = error instanceof CommandError
        ? error
        : new CommandError('TRANSACTION_FAILED', getErrorMessage(error));
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

function writeCommandJsonFailure(command: string, error: CommandError): void {
  console.error(`❌ ${error.message}`);
  writeJsonOutput({
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
