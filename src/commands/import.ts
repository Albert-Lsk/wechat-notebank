import { archiveArticle } from './fetch';
import { ImportItemResult, importWorkbook } from '../lib/importer';
import { findArticleBySourceUrl, withSourceUrlLock } from '../lib/storage';
import { readConfig } from '../lib/config';
import { CommandError, getErrorMessage } from '../lib/command-error';
import { resolveArchivePath } from './fetch';
import * as path from 'path';

export interface ImportCommandOptions {
  json?: boolean;
}

export interface ImportCommandResult {
  sourceFile: string;
  processingGoal: string | null;
  autoProcess: boolean;
  summary: {
    success: number;
    failure: number;
    skipped: number;
  };
  items: ImportItemResult[];
}

export async function importCommand(
  filePath: string,
  options: ImportCommandOptions = {}
): Promise<ImportCommandResult> {
  const log = options.json ? console.error : console.log;
  let config;
  try {
    config = await readConfig();
  } catch (error) {
    throw new CommandError('CONFIG_INVALID', getErrorMessage(error));
  }

  log(`📚 正在导入 Excel: ${filePath}`);

  let summary;
  try {
    summary = await importWorkbook(filePath, async (row) => {
      let archivePath: string;
      try {
        archivePath = resolveArchivePath(config, row.outputPath || undefined);
      } catch (error) {
        return {
          status: 'failed',
          error: {
            code: 'CONFIG_INVALID',
            message: getErrorMessage(error),
          },
        };
      }

      try {
        return await withSourceUrlLock(archivePath, row.url, async () => {
          const existingFile = await findArticleBySourceUrl(archivePath, row.url);
          if (existingFile) {
            log(`⏭️  [第 ${row.rowNumber} 行] 已存在，跳过: ${row.url}`);
            return {
              status: 'skipped' as const,
              archiveRoot: archivePath,
              savedFile: existingFile,
              reason: 'SOURCE_URL_EXISTS',
            };
          }

          log(`📥 [第 ${row.rowNumber} 行] 正在获取文章: ${row.url}`);
          const result = await archiveArticle(row.url, archivePath);
          log(`✅ [第 ${row.rowNumber} 行] 已保存: ${result.filePath}`);
          return {
            status: 'archived' as const,
            archiveRoot: archivePath,
            savedFile: result.filePath,
          };
        });
      } catch (error) {
        const commandError = error instanceof CommandError
          ? error
          : new CommandError('TRANSACTION_FAILED', getErrorMessage(error));
        log(`❌ [第 ${row.rowNumber} 行] ${commandError.message}`);
        return {
          status: 'failed',
          archiveRoot: archivePath,
          error: {
            code: commandError.code,
            message: commandError.message,
          },
        };
      }
    }, { collectItems: true });
  } catch (error) {
    throw new CommandError('TRANSACTION_FAILED', getErrorMessage(error));
  }

  log('导入完成');
  log(`✅ 成功: ${summary.success}`);
  log(`❌ 失败: ${summary.failure}`);
  log(`⏭️  跳过: ${summary.skipped}`);

  if (summary.failures.length > 0 && !options.json) {
    console.log('失败详情:');
    for (const failure of summary.failures) {
      console.log(
        `❌ [第 ${failure.rowNumber} 行] 序号: ${failure.sequence}, 链接: ${failure.url}, 输出: ${failure.outputPath}, 原因: ${failure.message}`
      );
    }
  }

  const result: ImportCommandResult = {
    sourceFile: path.resolve(filePath),
    processingGoal: config?.processingGoal ?? null,
    autoProcess: config?.autoProcess ?? false,
    summary: {
      success: summary.success,
      failure: summary.failure,
      skipped: summary.skipped,
    },
    items: summary.items || [],
  };

  if (summary.failure > 0 && !options.json) {
    throw new CommandError(
      'TRANSACTION_FAILED',
      `批量导入完成，但有 ${summary.failure} 行失败`
    );
  }

  return result;
}
