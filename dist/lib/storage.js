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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.FOLDER_L4 = exports.FOLDER_L3 = exports.FOLDER_L2 = exports.FOLDER_L1 = void 0;
exports.ensureDirectories = ensureDirectories;
exports.generateFilename = generateFilename;
exports.saveArticle = saveArticle;
exports.articleExistsBySourceUrl = articleExistsBySourceUrl;
exports.findArticleBySourceUrl = findArticleBySourceUrl;
exports.withSourceUrlLock = withSourceUrlLock;
exports.getL1Path = getL1Path;
const fs = __importStar(require("fs-extra"));
const fs_1 = require("fs");
const crypto_1 = require("crypto");
const path = __importStar(require("path"));
const gray_matter_1 = __importDefault(require("gray-matter"));
const MAX_FILENAME_BYTES = 240;
const SOURCE_LOCK_RETRY_MS = 25;
const SOURCE_LOCK_TIMEOUT_MS = 60000;
const ABANDONED_LOCK_AGE_MS = 5 * 60000;
exports.FOLDER_L1 = 'L1_原文'; // 公众号文章原文
exports.FOLDER_L2 = 'L2_原子卡片'; // 文章的原子想法卡片
exports.FOLDER_L3 = 'L3_引用素材'; // 可以直接引用的素材
exports.FOLDER_L4 = 'L4_阅读复盘'; // 保留出处，记录自己的理解
async function ensureDirectories(basePath) {
    const dirs = [
        basePath,
        path.join(basePath, exports.FOLDER_L1, 'WeChat'),
        path.join(basePath, exports.FOLDER_L2),
        path.join(basePath, exports.FOLDER_L3),
        path.join(basePath, exports.FOLDER_L4),
    ];
    for (const dir of dirs) {
        await fs.ensureDir(dir);
    }
}
function generateFilename(title, pubDate) {
    const datePrefix = /^\d{4}-\d{2}-\d{2}$/.test(pubDate)
        ? pubDate
        : new Date().toISOString().split('T')[0];
    const safeTitle = title
        .replace(/[^\u4e00-\u9fa5a-zA-Z0-9]/g, '');
    const filenamePrefix = `${datePrefix}-`;
    const filenameExt = '.md';
    const titleByteLimit = MAX_FILENAME_BYTES - Buffer.byteLength(filenamePrefix + filenameExt);
    const safeTitleForFilename = truncateUtf8(safeTitle || 'untitled', titleByteLimit);
    return `${filenamePrefix}${safeTitleForFilename}.md`;
}
function truncateUtf8(value, maxBytes) {
    let result = '';
    for (const char of Array.from(value)) {
        if (Buffer.byteLength(result + char) > maxBytes) {
            break;
        }
        result += char;
    }
    return result;
}
async function saveArticle(archivePath, title, content, meta) {
    await fs.ensureDir(archivePath);
    const filename = generateFilename(title, meta.pubDate);
    const filePath = await getAvailableFilePath(archivePath, filename);
    const fileContent = gray_matter_1.default.stringify(content, meta);
    await fs.writeFile(filePath, fileContent, 'utf-8');
    return filePath;
}
async function articleExistsBySourceUrl(archivePath, sourceUrl) {
    return (await findArticleBySourceUrl(archivePath, sourceUrl)) !== null;
}
async function findArticleBySourceUrl(archivePath, sourceUrl) {
    if (!(await fs.pathExists(archivePath))) {
        return null;
    }
    const entries = await fs.readdir(archivePath);
    for (const entry of entries) {
        if (path.extname(entry).toLowerCase() !== '.md') {
            continue;
        }
        const filePath = path.join(archivePath, entry);
        const stat = await fs.stat(filePath);
        if (!stat.isFile()) {
            continue;
        }
        const fileContent = await fs.readFile(filePath, 'utf-8');
        const parsed = (0, gray_matter_1.default)(fileContent);
        if (parsed.data?.sourceUrl === sourceUrl) {
            return filePath;
        }
    }
    return null;
}
async function withSourceUrlLock(archivePath, sourceUrl, action) {
    const lockDirectory = path.join(archivePath, '.alskai-notebank-locks');
    const lockName = (0, crypto_1.createHash)('sha256').update(sourceUrl).digest('hex');
    const lockPath = path.join(lockDirectory, `${lockName}.lock`);
    await fs.ensureDir(lockDirectory);
    const startedAt = Date.now();
    let lockHandle;
    while (!lockHandle) {
        try {
            lockHandle = await fs_1.promises.open(lockPath, 'wx');
            await lockHandle.writeFile(String(process.pid), 'utf8');
        }
        catch (error) {
            if (!hasErrorCode(error, 'EEXIST')) {
                throw error;
            }
            if (await removeAbandonedLock(lockPath)) {
                continue;
            }
            if (Date.now() - startedAt >= SOURCE_LOCK_TIMEOUT_MS) {
                throw new Error(`等待来源归档锁超时: ${sourceUrl}`);
            }
            await delay(SOURCE_LOCK_RETRY_MS);
        }
    }
    try {
        return await action();
    }
    finally {
        await lockHandle.close();
        await fs.remove(lockPath);
    }
}
async function removeAbandonedLock(lockPath) {
    try {
        const [ownerText, stat] = await Promise.all([
            fs_1.promises.readFile(lockPath, 'utf8'),
            fs_1.promises.stat(lockPath),
        ]);
        const ownerPid = Number(ownerText);
        const ownerIsGone = Number.isInteger(ownerPid) && ownerPid > 0
            ? !isProcessAlive(ownerPid)
            : Date.now() - stat.mtimeMs >= ABANDONED_LOCK_AGE_MS;
        if (!ownerIsGone) {
            return false;
        }
        await fs.remove(lockPath);
        return true;
    }
    catch (error) {
        if (hasErrorCode(error, 'ENOENT')) {
            return true;
        }
        return false;
    }
}
function isProcessAlive(pid) {
    try {
        process.kill(pid, 0);
        return true;
    }
    catch (error) {
        return !hasErrorCode(error, 'ESRCH');
    }
}
function hasErrorCode(error, code) {
    return Boolean(error &&
        typeof error === 'object' &&
        'code' in error &&
        error.code === code);
}
function delay(milliseconds) {
    return new Promise((resolve) => setTimeout(resolve, milliseconds));
}
async function getAvailableFilePath(archivePath, filename) {
    const parsed = path.parse(filename);
    let filePath = path.join(archivePath, filename);
    let counter = 2;
    while (await fs.pathExists(filePath)) {
        filePath = path.join(archivePath, `${parsed.name}-${counter}${parsed.ext}`);
        counter++;
    }
    return filePath;
}
function getL1Path(basePath) {
    return path.join(basePath, exports.FOLDER_L1, 'WeChat');
}
