"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.importWorkbook = importWorkbook;
const XLSX = __importStar(require("xlsx"));
const command_error_1 = require("./command-error");
async function importWorkbook(filePath, archiveRow, options = {}) {
    const rows = readImportRows(filePath);
    const summary = {
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
        const importRow = {
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
            }
            else if (result?.status === 'failed') {
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
            }
            else {
                summary.success++;
                summary.items?.push(toItemResult(importRow, 'saved', result || undefined));
            }
        }
        catch (error) {
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
function readImportRows(filePath) {
    const workbook = XLSX.readFile(filePath);
    const firstSheetName = workbook.SheetNames[0];
    if (!firstSheetName) {
        return [];
    }
    const worksheet = workbook.Sheets[firstSheetName];
    const rawRows = XLSX.utils.sheet_to_json(worksheet, {
        header: 1,
        defval: '',
        raw: false,
        blankrows: true,
    });
    const rows = rawRows
        .map((row, index) => ({
        values: [row[0], row[1], row[2]].map(cellToString),
        rowNumber: index + 1,
    }))
        .filter((row) => row.values.some((value) => value.length > 0));
    const layout = detectColumnLayout(rows[0]?.values || []);
    const dataRows = rows[0] && isHeaderRow(rows[0].values)
        ? rows.slice(1)
        : rows;
    return dataRows.map((row) => normalizeImportRow(row, layout));
}
function cellToString(value) {
    if (value === null || value === undefined) {
        return '';
    }
    return String(value).trim();
}
function detectColumnLayout(values) {
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
function normalizeImportRow(row, layout) {
    return {
        rowNumber: row.rowNumber,
        values: [
            layout.sequenceIndex === null ? '' : row.values[layout.sequenceIndex],
            row.values[layout.urlIndex],
            row.values[layout.outputPathIndex],
        ],
    };
}
function isHeaderRow(values) {
    return isLegacyHeaderRow(values) || isUrlOutputHeaderRow(values);
}
function isLegacyHeaderRow(values) {
    return (values[0] === '序号' &&
        /链接|文章/.test(values[1]) &&
        /文件|目标|地址|路径/.test(values[2]));
}
function isUrlOutputHeaderRow(values) {
    return (/链接|文章/.test(values[0]) &&
        /文件|目标|地址|路径/.test(values[1]));
}
function looksLikeWechatArticleUrl(value) {
    return /^https?:\/\/mp\.weixin\.qq\.com\/s\//.test(value);
}
function isCompleteRow(values) {
    return values[1].length > 0;
}
function toItemResult(row, status, result) {
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
function toImportItemError(error) {
    if (error instanceof command_error_1.CommandError) {
        return {
            code: error.code,
            message: error.message,
        };
    }
    return {
        code: 'TRANSACTION_FAILED',
        message: (0, command_error_1.getErrorMessage)(error),
    };
}
