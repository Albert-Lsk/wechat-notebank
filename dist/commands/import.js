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
exports.importCommand = importCommand;
const fetch_1 = require("./fetch");
const importer_1 = require("../lib/importer");
const storage_1 = require("../lib/storage");
const config_1 = require("../lib/config");
const command_error_1 = require("../lib/command-error");
const fetch_2 = require("./fetch");
const path = __importStar(require("path"));
async function importCommand(filePath, options = {}) {
    const log = options.json ? console.error : console.log;
    let config;
    try {
        config = await (0, config_1.readConfig)();
    }
    catch (error) {
        throw new command_error_1.CommandError('CONFIG_INVALID', (0, command_error_1.getErrorMessage)(error));
    }
    log(`📚 正在导入 Excel: ${filePath}`);
    let summary;
    try {
        summary = await (0, importer_1.importWorkbook)(filePath, async (row) => {
            let archivePath;
            try {
                archivePath = (0, fetch_2.resolveArchivePath)(config, row.outputPath || undefined);
            }
            catch (error) {
                return {
                    status: 'failed',
                    error: {
                        code: 'CONFIG_INVALID',
                        message: (0, command_error_1.getErrorMessage)(error),
                    },
                };
            }
            try {
                return await (0, storage_1.withSourceUrlLock)(archivePath, row.url, async () => {
                    const existingFile = await (0, storage_1.findArticleBySourceUrl)(archivePath, row.url);
                    if (existingFile) {
                        log(`⏭️  [第 ${row.rowNumber} 行] 已存在，跳过: ${row.url}`);
                        return {
                            status: 'skipped',
                            archiveRoot: archivePath,
                            savedFile: existingFile,
                            reason: 'SOURCE_URL_EXISTS',
                        };
                    }
                    log(`📥 [第 ${row.rowNumber} 行] 正在获取文章: ${row.url}`);
                    const result = await (0, fetch_1.archiveArticle)(row.url, archivePath);
                    log(`✅ [第 ${row.rowNumber} 行] 已保存: ${result.filePath}`);
                    return {
                        status: 'archived',
                        archiveRoot: archivePath,
                        savedFile: result.filePath,
                    };
                });
            }
            catch (error) {
                const commandError = error instanceof command_error_1.CommandError
                    ? error
                    : new command_error_1.CommandError('TRANSACTION_FAILED', (0, command_error_1.getErrorMessage)(error));
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
    }
    catch (error) {
        throw new command_error_1.CommandError('TRANSACTION_FAILED', (0, command_error_1.getErrorMessage)(error));
    }
    log('导入完成');
    log(`✅ 成功: ${summary.success}`);
    log(`❌ 失败: ${summary.failure}`);
    log(`⏭️  跳过: ${summary.skipped}`);
    if (summary.failures.length > 0 && !options.json) {
        console.log('失败详情:');
        for (const failure of summary.failures) {
            console.log(`❌ [第 ${failure.rowNumber} 行] 序号: ${failure.sequence}, 链接: ${failure.url}, 输出: ${failure.outputPath}, 原因: ${failure.message}`);
        }
    }
    const result = {
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
        throw new command_error_1.CommandError('TRANSACTION_FAILED', `批量导入完成，但有 ${summary.failure} 行失败`);
    }
    return result;
}
