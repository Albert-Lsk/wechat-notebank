import { fetchArticleHtml, parseWechatArticle, buildMeta } from '../lib/parser';
import {
  findArticleBySourceUrl,
  reserveArticleFilePath,
  withSourceUrlLock,
  writeArticleFile,
} from '../lib/storage';
import { readConfig } from '../lib/config';
import { localizeImages } from '../lib/images';
import { convertArticleHtmlToMarkdown } from '../lib/markdown';
import { ArticleMeta, ParseResult, WechatNotebankConfig } from '../types';
import { CommandError, getErrorMessage } from '../lib/command-error';
import * as fs from 'fs-extra';
import * as os from 'os';
import * as path from 'path';

export interface ImageArchiveResult {
  total: number;
  downloaded: number;
}

export interface ArchiveArticleResult {
  filePath: string;
  meta: ArticleMeta;
  images: ImageArchiveResult;
}

export interface FetchCommandResult {
  action: 'archive';
  sourceUrl: string;
  savedFile: string;
  archiveRoot: string;
  processingGoal: string | null;
  autoProcess: boolean;
  images: ImageArchiveResult;
  reason?: 'SOURCE_URL_EXISTS';
}

export interface FetchCommandOptions {
  json?: boolean;
  noImages?: boolean;
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
          images: emptyImageArchiveResult(),
          reason: 'SOURCE_URL_EXISTS',
        };
      }

      log(`📥 正在获取文章: ${url}`);

      const { filePath, meta, images } = await archiveArticle(url, archivePath, {
        noImages: options.noImages,
      });

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
        images,
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
  archivePath: string,
  options: { noImages?: boolean } = {}
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

  // 预留最终路径，再在同一事务中完成图片本地化和正文落盘。
  let filePath: string;
  let assetsDirAbsPath: string | undefined;
  let images = emptyImageArchiveResult();
  try {
    filePath = await reserveArticleFilePath(archivePath, parseResult.title, meta.pubDate);

    const fileName = path.basename(filePath);
    const articleBaseName = fileName.endsWith('.md')
      ? fileName.slice(0, -'.md'.length)
      : fileName;
    const assetsDirName = `${articleBaseName}.assets`;
    assetsDirAbsPath = path.resolve(path.dirname(filePath), assetsDirName);

    let content = parseResult.content;
    if (!options.noImages) {
      const localized = await localizeImages(content, assetsDirAbsPath, assetsDirName);
      content = localized.content;
      images = {
        total: localized.total,
        downloaded: localized.downloaded,
      };
    }

    content = convertArticleHtmlToMarkdown(content);

    await writeArticleFile(filePath, content, meta);
  } catch (error) {
    if (assetsDirAbsPath) {
      try {
        await fs.remove(assetsDirAbsPath);
      } catch {
        // 图片目录清理是 best-effort，不覆盖原始落盘错误。
      }
    }
    throw new CommandError('TRANSACTION_FAILED', getErrorMessage(error));
  }

  return { filePath, meta, images };
}

function emptyImageArchiveResult(): ImageArchiveResult {
  return { total: 0, downloaded: 0 };
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
