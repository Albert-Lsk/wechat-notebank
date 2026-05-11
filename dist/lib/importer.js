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
async function importWorkbook(filePath, archiveRow) {
    const rows = readImportRows(filePath);
    const summary = {
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
            }
            else {
                summary.success++;
            }
        }
        catch (error) {
            summary.failure++;
            summary.failures.push({
                ...importRow,
                message: getErrorMessage(error),
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
function cellToString(value) {
    if (value === null || value === undefined) {
        return '';
    }
    return String(value).trim();
}
function isHeaderRow(values) {
    return (values[0] === '序号' &&
        /链接|文章/.test(values[1]) &&
        /文件|目标|地址|路径/.test(values[2]));
}
function isCompleteRow(values) {
    return values.every((value) => value.length > 0);
}
function getErrorMessage(error) {
    if (error instanceof Error) {
        return error.message;
    }
    return String(error);
}
