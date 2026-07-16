import * as XLSX from 'xlsx';
import { CommandError, CommandErrorCode, getErrorMessage } from './command-error';

export interface ImportRow {
  sequence: string;
  url: string;
  outputPath: string;
  rowNumber: number;
}

export interface ImportFailure extends ImportRow {
  message: string;
}

export interface ImportSummary {
  success: number;
  failure: number;
  skipped: number;
  failures: ImportFailure[];
  items?: ImportItemResult[];
}

export interface ArchiveRowResult {
  status?: 'archived' | 'skipped' | 'failed';
  message?: string;
  archiveRoot?: string;
  savedFile?: string;
  reason?: string;
  error?: ImportItemError;
}

export interface ImportItemError {
  code: CommandErrorCode;
  message: string;
}

export interface ImportItemResult {
  rowNumber: number;
  sequence: string;
  sourceUrl: string;
  status: 'saved' | 'skipped' | 'failed';
  archiveRoot?: string;
  savedFile?: string;
  reason?: string;
  error?: ImportItemError;
}

export interface ImportWorkbookOptions {
  collectItems?: boolean;
}

export type ArchiveRow = (row: ImportRow) => Promise<void | ArchiveRowResult>;

interface RawImportRow {
  values: string[];
  rowNumber: number;
}

interface ImportColumnLayout {
  sequenceIndex: number | null;
  urlIndex: number;
  outputPathIndex: number;
}

export async function importWorkbook(
  filePath: string,
  archiveRow: ArchiveRow,
  options: ImportWorkbookOptions = {}
): Promise<ImportSummary> {
  const rows = readImportRows(filePath);
  const summary: ImportSummary = {
    success: 0,
    failure: 0,
    skipped: 0,
    failures: [],
  };
  if (options.collectItems) {
    summary.items = [];
  }

  for (const row of rows) {
    if (!isCompleteRow(row.values)) {
      summary.skipped++;
      summary.items?.push({
        rowNumber: row.rowNumber,
        sequence: row.values[0],
        sourceUrl: row.values[1],
        status: 'skipped',
        reason: 'INCOMPLETE_ROW',
      });
      continue;
    }

    const importRow: ImportRow = {
      sequence: row.values[0],
      url: row.values[1],
      outputPath: row.values[2],
      rowNumber: row.rowNumber,
    };

    try {
      const result = await archiveRow(importRow);
      if (result?.status === 'skipped') {
        summary.skipped++;
        summary.items?.push(toItemResult(importRow, 'skipped', result));
      } else if (result?.status === 'failed') {
        const error = result.error || {
          code: 'TRANSACTION_FAILED',
          message: result.message || '归档失败',
        };
        summary.failure++;
        summary.failures.push({
          ...importRow,
          message: error.message,
        });
        summary.items?.push(toItemResult(importRow, 'failed', {
          ...result,
          error,
        }));
      } else {
        summary.success++;
        summary.items?.push(toItemResult(importRow, 'saved', result || undefined));
      }
    } catch (error) {
      const itemError = toImportItemError(error);
      summary.failure++;
      summary.failures.push({
        ...importRow,
        message: itemError.message,
      });
      summary.items?.push({
        rowNumber: importRow.rowNumber,
        sequence: importRow.sequence,
        sourceUrl: importRow.url,
        status: 'failed',
        error: itemError,
      });
    }
  }

  return summary;
}

function readImportRows(filePath: string): RawImportRow[] {
  const workbook = XLSX.readFile(filePath);
  const firstSheetName = workbook.SheetNames[0];
  if (!firstSheetName) {
    return [];
  }

  const worksheet = workbook.Sheets[firstSheetName];
  const rawRows = XLSX.utils.sheet_to_json<unknown[]>(worksheet, {
    header: 1,
    defval: '',
    raw: false,
    blankrows: false,
  });

  const rows: RawImportRow[] = rawRows.map((row, index) => ({
    values: [row[0], row[1], row[2]].map(cellToString),
    rowNumber: index + 1,
  }));

  const layout = detectColumnLayout(rows[0]?.values || []);
  const dataRows = rows[0] && isHeaderRow(rows[0].values)
    ? rows.slice(1)
    : rows;

  return dataRows.map((row) => normalizeImportRow(row, layout));
}

function cellToString(value: unknown): string {
  if (value === null || value === undefined) {
    return '';
  }

  return String(value).trim();
}

function detectColumnLayout(values: string[]): ImportColumnLayout {
  if (isUrlOutputHeaderRow(values) || looksLikeWechatArticleUrl(values[0])) {
    return {
      sequenceIndex: null,
      urlIndex: 0,
      outputPathIndex: 1,
    };
  }

  return {
    sequenceIndex: 0,
    urlIndex: 1,
    outputPathIndex: 2,
  };
}

function normalizeImportRow(row: RawImportRow, layout: ImportColumnLayout): RawImportRow {
  return {
    rowNumber: row.rowNumber,
    values: [
      layout.sequenceIndex === null ? '' : row.values[layout.sequenceIndex],
      row.values[layout.urlIndex],
      row.values[layout.outputPathIndex],
    ],
  };
}

function isHeaderRow(values: string[]): boolean {
  return isLegacyHeaderRow(values) || isUrlOutputHeaderRow(values);
}

function isLegacyHeaderRow(values: string[]): boolean {
  return (
    values[0] === '序号' &&
    /链接|文章/.test(values[1]) &&
    /文件|目标|地址|路径/.test(values[2])
  );
}

function isUrlOutputHeaderRow(values: string[]): boolean {
  return (
    /链接|文章/.test(values[0]) &&
    /文件|目标|地址|路径/.test(values[1])
  );
}

function looksLikeWechatArticleUrl(value: string): boolean {
  return /^https?:\/\/mp\.weixin\.qq\.com\/s\//.test(value);
}

function isCompleteRow(values: string[]): boolean {
  return values[1].length > 0;
}

function toItemResult(
  row: ImportRow,
  status: ImportItemResult['status'],
  result?: ArchiveRowResult
): ImportItemResult {
  return {
    rowNumber: row.rowNumber,
    sequence: row.sequence,
    sourceUrl: row.url,
    status,
    ...(result?.archiveRoot ? { archiveRoot: result.archiveRoot } : {}),
    ...(result?.savedFile ? { savedFile: result.savedFile } : {}),
    ...(result?.reason ? { reason: result.reason } : {}),
    ...(result?.error ? { error: result.error } : {}),
  };
}

function toImportItemError(error: unknown): ImportItemError {
  if (error instanceof CommandError) {
    return {
      code: error.code,
      message: error.message,
    };
  }

  return {
    code: 'TRANSACTION_FAILED',
    message: getErrorMessage(error),
  };
}
