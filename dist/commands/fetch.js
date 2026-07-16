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
exports.fetchCommand = fetchCommand;
exports.archiveArticle = archiveArticle;
exports.resolveArchivePath = resolveArchivePath;
const parser_1 = require("../lib/parser");
const storage_1 = require("../lib/storage");
const config_1 = require("../lib/config");
const command_error_1 = require("../lib/command-error");
const os = __importStar(require("os"));
const path = __importStar(require("path"));
async function fetchCommand(url, outputPath, options = {}) {
    // 检查配置
    let config;
    let archivePath;
    try {
        config = await (0, config_1.readConfig)();
        archivePath = resolveArchivePath(config, outputPath);
    }
    catch (error) {
        throw new command_error_1.CommandError('CONFIG_INVALID', (0, command_error_1.getErrorMessage)(error));
    }
    const log = options.json ? console.error : console.log;
    const existingFile = await (0, storage_1.findArticleBySourceUrl)(archivePath, url);
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
}
async function archiveArticle(url, archivePath) {
    // 获取 HTML
    let html;
    try {
        html = await (0, parser_1.fetchArticleHtml)(url);
    }
    catch (error) {
        throw new command_error_1.CommandError('ARTICLE_UNAVAILABLE', (0, command_error_1.getErrorMessage)(error));
    }
    // 解析文章
    let parseResult;
    try {
        parseResult = (0, parser_1.parseWechatArticle)(html, url);
    }
    catch (error) {
        throw new command_error_1.CommandError('ARTICLE_PARSE_FAILED', (0, command_error_1.getErrorMessage)(error));
    }
    // 构建元数据
    const meta = (0, parser_1.buildMeta)(parseResult, url);
    // 保存文件
    let filePath;
    try {
        filePath = await (0, storage_1.saveArticle)(archivePath, parseResult.title, parseResult.content, meta);
    }
    catch (error) {
        throw new command_error_1.CommandError('TRANSACTION_FAILED', (0, command_error_1.getErrorMessage)(error));
    }
    return { filePath, meta };
}
function resolveArchivePath(config, outputPath) {
    if (outputPath) {
        return expandHomePath(outputPath);
    }
    if (!config) {
        throw new Error('未找到配置文件，请先运行 wechat-notebank init，或使用 --output <folder> 指定保存目录');
    }
    return expandHomePath(config.archivePath);
}
function expandHomePath(archivePath) {
    if (archivePath === '~') {
        return os.homedir();
    }
    if (/^~[\\/]/.test(archivePath)) {
        return path.join(os.homedir(), archivePath.slice(2));
    }
    return archivePath;
}
