#!/usr/bin/env node

import { initCommand } from './commands/init';
import { fetchCommand } from './commands/fetch';
import { importCommand } from './commands/import';
import { configExists } from './lib/config';
import { parseFetchArgs, parseImportArgs } from './lib/cli';

async function main() {
  const args = process.argv.slice(2);
  const command = args[0];

  // 帮助信息
  if (command === '--help' || command === '-h' || !command) {
    console.log(`
wechat-notebank - 微信公众号文章存档工具 🏦

使用方法:
  wechat-notebank init                    初始化知识库
  wechat-notebank fetch <url> [--output <folder>]
                                          存档文章
  wechat-notebank import <Excel文件地址>   批量导入文章
  wechat-notebank --help                  显示帮助

示例:
  wechat-notebank init
  wechat-notebank fetch https://mp.weixin.qq.com/s/xxx
  wechat-notebank fetch https://mp.weixin.qq.com/s/xxx --output ~/WeChatArticles
  wechat-notebank import ./articles.xlsx

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
    let fetchArgs;
    try {
      fetchArgs = parseFetchArgs(args.slice(1));
    } catch (error) {
      console.error(`❌ ${error instanceof Error ? error.message : '参数错误'}`);
      console.error('   用法: wechat-notebank fetch <url> [--output <folder>]');
      process.exit(1);
    }

    const { url, outputPath } = fetchArgs;
    if (!url) {
      console.error('❌ 请提供文章链接');
      console.error('   用法: wechat-notebank fetch <url> [--output <folder>]');
      process.exit(1);
    }

    // 未指定输出目录时，沿用默认配置；不存在则引导初始化
    if (!outputPath && !(await configExists())) {
      console.log('🤖 首次使用，正在引导初始化...\n');
      await initCommand();
      console.log('');
    }

    await fetchCommand(url, outputPath);
    return;
  }

  // import 命令
  if (command === 'import') {
    let importArgs;
    try {
      importArgs = parseImportArgs(args.slice(1));
    } catch (error) {
      console.error(`❌ ${error instanceof Error ? error.message : '参数错误'}`);
      console.error('   用法: wechat-notebank import <Excel文件地址>');
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
  console.error('   使用 wechat-notebank --help 查看帮助');
  process.exit(1);
}

main();
