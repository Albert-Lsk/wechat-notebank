import * as XLSX from 'xlsx';

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
}

export type ArchiveRow = (row: ImportRow) => Promise<void>;

export async function importWorkbook(
  filePath: string,
  archiveRow: ArchiveRow
): Promise<ImportSummary> {
  const rows = readImportRows(filePath);
  const summary: ImportSummary = {
    success: 0,
    failure: 0,
    skipped: 0,
    failures: [],
  };

  for (const row of rows) {
    if (!isCompleteRow(row.values)) {
      summary.skipped++;
      continue;
    }

    const importRow: ImportRow = {
      sequence: row.values[0],
      url: row.values[1],
      outputPath: row.values[2],
      rowNumber: row.rowNumber,
    };

    try {
      await archiveRow(importRow);
      summary.success++;
    } catch (error) {
      summary.failure++;
      summary.failures.push({
        ...importRow,
        message: getErrorMessage(error),
      });
    }
  }

  return summary;
}

function readImportRows(filePath: string): Array<{ values: string[]; rowNumber: number }> {
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

  const rows = rawRows.map((row, index) => ({
    values: [row[0], row[1], row[2]].map(cellToString),
    rowNumber: index + 1,
  }));

  if (rows[0] && isHeaderRow(rows[0].values)) {
    return rows.slice(1);
  }

  return rows;
}

function cellToString(value: unknown): string {
  if (value === null || value === undefined) {
    return '';
  }

  return String(value).trim();
}

function isHeaderRow(values: string[]): boolean {
  return (
    values[0] === '序号' &&
    /链接|文章/.test(values[1]) &&
    /文件|目标|地址|路径/.test(values[2])
  );
}

function isCompleteRow(values: string[]): boolean {
  return values.every((value) => value.length > 0);
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return String(error);
}
