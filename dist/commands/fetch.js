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
const images_1 = require("../lib/images");
const markdown_1 = require("../lib/markdown");
const command_error_1 = require("../lib/command-error");
const fs = __importStar(require("fs-extra"));
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
    try {
        return await (0, storage_1.withSourceUrlLock)(archivePath, url, async () => {
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
    }
    catch (error) {
        if (error instanceof command_error_1.CommandError) {
            throw error;
        }
        throw new command_error_1.CommandError('TRANSACTION_FAILED', (0, command_error_1.getErrorMessage)(error));
    }
}
async function archiveArticle(url, archivePath, options = {}) {
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
    // 预留最终路径，再在同一事务中完成图片本地化和正文落盘。
    let filePath;
    let assetsDirAbsPath;
    let images = emptyImageArchiveResult();
    try {
        filePath = await (0, storage_1.reserveArticleFilePath)(archivePath, parseResult.title, meta.pubDate);
        const fileName = path.basename(filePath);
        const articleBaseName = fileName.endsWith('.md')
            ? fileName.slice(0, -'.md'.length)
            : fileName;
        const assetsDirName = `${articleBaseName}.assets`;
        assetsDirAbsPath = path.resolve(path.dirname(filePath), assetsDirName);
        let content = parseResult.content;
        if (!options.noImages) {
            const localized = await (0, images_1.localizeImages)(content, assetsDirAbsPath, assetsDirName);
            content = localized.content;
            images = {
                total: localized.total,
                downloaded: localized.downloaded,
            };
        }
        content = (0, markdown_1.convertArticleHtmlToMarkdown)(content);
        await (0, storage_1.writeArticleFile)(filePath, content, meta);
    }
    catch (error) {
        if (assetsDirAbsPath) {
            try {
                await fs.remove(assetsDirAbsPath);
            }
            catch {
                // 图片目录清理是 best-effort，不覆盖原始落盘错误。
            }
        }
        throw new command_error_1.CommandError('TRANSACTION_FAILED', (0, command_error_1.getErrorMessage)(error));
    }
    return { filePath, meta, images };
}
function emptyImageArchiveResult() {
    return { total: 0, downloaded: 0 };
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
