#!/usr/bin/env node

import { initCommand } from './commands/init';
import { fetchCommand } from './commands/fetch';
import { importCommand } from './commands/import';
import { configExists } from './lib/config';
import {
  isJsonOutputRequested,
  normalizeCliArgs,
  parseFetchArgs,
  parseImportArgs,
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
    await initCommand();
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
        writeFetchJsonFailure(new CommandError('CLI_USAGE_ERROR', message));
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
        writeFetchJsonFailure(new CommandError('CLI_USAGE_ERROR', '请提供文章链接'));
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
          status: 'saved',
          result,
        });
      }
    } catch (error) {
      const commandError = error instanceof CommandError
        ? error
        : new CommandError('ARTICLE_UNAVAILABLE', getErrorMessage(error));

      if (json) {
        writeFetchJsonFailure(commandError);
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
      importArgs = parseImportArgs(args);
    } catch (error) {
      console.error(`❌ ${error instanceof Error ? error.message : '参数错误'}`);
      console.error('   用法: alskai-notebank import <Excel文件地址>');
      process.exit(1);
    }

    try {
      await importCommand(importArgs.filePath);
    } catch (error) {
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

function writeFetchJsonFailure(error: CommandError): void {
  console.error(`❌ ${error.message}`);
  writeJsonOutput({
    ok: false,
    command: 'fetch',
    status: 'failed',
    error: {
      code: error.code,
      message: error.message,
    },
  });
  process.exitCode = 1;
}

main();
