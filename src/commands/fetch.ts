import { fetchArticleHtml, parseWechatArticle, buildMeta } from '../lib/parser';
import { findArticleBySourceUrl, saveArticle, withSourceUrlLock } from '../lib/storage';
import { readConfig } from '../lib/config';
import { ArticleMeta, ParseResult, WechatNotebankConfig } from '../types';
import { CommandError, getErrorMessage } from '../lib/command-error';
import * as os from 'os';
import * as path from 'path';

export interface ArchiveArticleResult {
  filePath: string;
  meta: ArticleMeta;
}

export interface FetchCommandResult {
  action: 'archive';
  sourceUrl: string;
  savedFile: string;
  archiveRoot: string;
  processingGoal: string | null;
  autoProcess: boolean;
  reason?: 'SOURCE_URL_EXISTS';
}

export interface FetchCommandOptions {
  json?: boolean;
}

export async function fetchCommand(
  url: string,
  outputPath?: string,
  options: FetchCommandOptions = {}
): Promise<FetchCommandResult> {
  // 检查配置
  let config: WechatNotebankConfig | null;
  let archivePath: string;
  try {
    config = await readConfig();
    archivePath = resolveArchivePath(config, outputPath);
  } catch (error) {
    throw new CommandError('CONFIG_INVALID', getErrorMessage(error));
  }
  const log = options.json ? console.error : console.log;

  try {
    return await withSourceUrlLock(archivePath, url, async () => {
      const existingFile = await findArticleBySourceUrl(archivePath, url);
      if (existingFile) {
        log(`⏭️  已存在，跳过: ${url}`);
        return {
          action: 'archive',
          sourceUrl: url,
          savedFile: existingFile,
          archiveRoot: archivePath,
          processingGoal: config?.processingGoal ?? null,
          autoProcess: config?.autoProcess ?? false,
          reason: 'SOURCE_URL_EXISTS',
        };
      }

      log(`📥 正在获取文章: ${url}`);

      const { filePath, meta } = await archiveArticle(url, archivePath);

      if (!options.json) {
        console.log(`\n✅ 文章已保存！`);
        console.log(`📄 文件: ${filePath}`);
        console.log(`📌 标题: ${meta.title}`);
        console.log(`👤 作者: ${meta.author}`);
        console.log(`📅 发布: ${meta.pubDate}`);
        console.log(`🏷️  来源: ${meta.wechatName}`);
      }

      return {
        action: 'archive',
        sourceUrl: url,
        savedFile: filePath,
        archiveRoot: archivePath,
        processingGoal: config?.processingGoal ?? null,
        autoProcess: config?.autoProcess ?? false,
      };
    });
  } catch (error) {
    if (error instanceof CommandError) {
      throw error;
    }
    throw new CommandError('TRANSACTION_FAILED', getErrorMessage(error));
  }
}

export async function archiveArticle(
  url: string,
  archivePath: string
): Promise<ArchiveArticleResult> {
  // 获取 HTML
  let html: string;
  try {
    html = await fetchArticleHtml(url);
  } catch (error) {
    throw new CommandError('ARTICLE_UNAVAILABLE', getErrorMessage(error));
  }

  // 解析文章
  let parseResult: ParseResult;
  try {
    parseResult = parseWechatArticle(html, url);
  } catch (error) {
    throw new CommandError('ARTICLE_PARSE_FAILED', getErrorMessage(error));
  }

  // 构建元数据
  const meta = buildMeta(parseResult, url);

  // 保存文件
  let filePath: string;
  try {
    filePath = await saveArticle(
      archivePath,
      parseResult.title,
      parseResult.content,
      meta
    );
  } catch (error) {
    throw new CommandError('TRANSACTION_FAILED', getErrorMessage(error));
  }

  return { filePath, meta };
}

export function resolveArchivePath(
  config: Pick<WechatNotebankConfig, 'archivePath'> | null,
  outputPath?: string
): string {
  if (outputPath) {
    return expandHomePath(outputPath);
  }

  if (!config) {
    throw new Error('未找到配置文件，请先运行 wechat-notebank init，或使用 --output <folder> 指定保存目录');
  }

  return expandHomePath(config.archivePath);
}

function expandHomePath(archivePath: string): string {
  if (archivePath === '~') {
    return os.homedir();
  }

  if (/^~[\\/]/.test(archivePath)) {
    return path.join(os.homedir(), archivePath.slice(2));
  }

  return archivePath;
}
