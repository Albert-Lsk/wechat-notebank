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
const crypto_1 = require("crypto");
const path = __importStar(require("path"));
const gray_matter_1 = __importDefault(require("gray-matter"));
const process_identity_1 = require("./process-identity");
const MAX_FILENAME_BYTES = 240;
const SOURCE_LOCK_RETRY_MS = 25;
const SOURCE_LOCK_TIMEOUT_MS = 60000;
const INVALID_OWNER_STALE_MS = 45000;
const SOURCE_LOCK_OWNER_FILE = 'owner.json';
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
    await ensureSafeLockDirectory(archivePath, lockDirectory);
    const currentProcessIdentity = await (0, process_identity_1.getProcessIdentity)(process.pid);
    if (currentProcessIdentity.status !== 'found') {
        throw new Error(`无法读取进程启动身份: ${process.pid}`);
    }
    const owner = {
        pid: process.pid,
        token: (0, crypto_1.randomUUID)(),
        processStartedAt: currentProcessIdentity.identity,
    };
    const candidatePath = `${lockPath}.candidate-${owner.token}`;
    try {
        await fs.ensureDir(candidatePath);
        await fs.writeJson(path.join(candidatePath, SOURCE_LOCK_OWNER_FILE), owner);
    }
    catch (error) {
        await fs.remove(candidatePath);
        throw error;
    }
    const startedAt = Date.now();
    let acquired = false;
    try {
        while (!acquired) {
            try {
                await fs.rename(candidatePath, lockPath);
                acquired = true;
            }
            catch (error) {
                if (!isLockConflict(error)) {
                    throw error;
                }
                if (await quarantineAbandonedLock(lockPath)) {
                    continue;
                }
                if (Date.now() - startedAt >= SOURCE_LOCK_TIMEOUT_MS) {
                    throw new Error(`等待来源归档锁超时: ${sourceUrl}`);
                }
                await delay(SOURCE_LOCK_RETRY_MS);
            }
        }
    }
    finally {
        if (!acquired) {
            await fs.remove(candidatePath);
        }
    }
    try {
        return await action();
    }
    finally {
        try {
            await releaseOwnedLock(lockPath, owner);
        }
        catch {
            // action 的结果不应因锁清理残留被伪装成失败。
        }
        try {
            await removeEmptyLockDirectory(lockDirectory);
        }
        catch {
            // 保留残留锁目录，下一次调用仍可安全复用或诊断。
        }
    }
}
async function ensureSafeLockDirectory(archivePath, lockDirectory) {
    await fs.ensureDir(archivePath);
    if (await fs.pathExists(lockDirectory)) {
        const stat = await fs.lstat(lockDirectory);
        if (stat.isSymbolicLink() || !stat.isDirectory()) {
            throw new Error(`来源归档锁目录无效: ${lockDirectory}`);
        }
        return;
    }
    await fs.ensureDir(lockDirectory);
    const stat = await fs.lstat(lockDirectory);
    if (stat.isSymbolicLink() || !stat.isDirectory()) {
        throw new Error(`来源归档锁目录无效: ${lockDirectory}`);
    }
}
async function removeEmptyLockDirectory(lockDirectory) {
    try {
        await fs.rmdir(lockDirectory);
    }
    catch (error) {
        const code = error.code;
        if (code !== 'ENOENT' && code !== 'ENOTEMPTY' && code !== 'EEXIST') {
            throw error;
        }
    }
}
async function quarantineAbandonedLock(lockPath) {
    const inspection = await inspectSourceLock(lockPath);
    if (!inspection) {
        return true;
    }
    const { owner, stat } = inspection;
    if (owner) {
        const currentProcessIdentity = await (0, process_identity_1.getProcessIdentity)(owner.pid);
        if (currentProcessIdentity.status === 'unknown') {
            return false;
        }
        if (currentProcessIdentity.status === 'found' &&
            currentProcessIdentity.identity === owner.processStartedAt) {
            return false;
        }
    }
    else if (Date.now() - stat.mtimeMs < INVALID_OWNER_STALE_MS) {
        return false;
    }
    const lockIdentity = owner?.token || (0, crypto_1.createHash)('sha256')
        .update(`${stat.dev}:${stat.ino}:${stat.birthtimeMs}`)
        .digest('hex');
    const quarantinePath = `${lockPath}.stale-${lockIdentity}`;
    try {
        await fs.rename(lockPath, quarantinePath);
        return true;
    }
    catch (error) {
        if (hasErrorCode(error, 'ENOENT')) {
            return true;
        }
        if (isLockConflict(error)) {
            return false;
        }
        throw error;
    }
}
async function inspectSourceLock(lockPath) {
    try {
        const stat = await fs.stat(lockPath);
        const owner = await readSourceLockOwner(lockPath);
        return { owner, stat };
    }
    catch (error) {
        if (hasErrorCode(error, 'ENOENT')) {
            return null;
        }
        throw error;
    }
}
async function releaseOwnedLock(lockPath, expectedOwner) {
    const currentOwner = await readSourceLockOwner(lockPath);
    if (!currentOwner || currentOwner.token !== expectedOwner.token) {
        return;
    }
    const releasedPath = `${lockPath}.released-${expectedOwner.token}`;
    try {
        await fs.rename(lockPath, releasedPath);
    }
    catch (error) {
        if (hasErrorCode(error, 'ENOENT')) {
            return;
        }
        throw error;
    }
    await fs.remove(releasedPath);
}
async function readSourceLockOwner(lockPath) {
    try {
        const data = await fs.readJson(path.join(lockPath, SOURCE_LOCK_OWNER_FILE));
        if (!isSourceLockOwner(data)) {
            return null;
        }
        return data;
    }
    catch (error) {
        if (hasErrorCode(error, 'ENOENT') || hasErrorCode(error, 'ENOTDIR')) {
            return null;
        }
        if (error instanceof SyntaxError) {
            return null;
        }
        throw error;
    }
}
function isSourceLockOwner(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        return false;
    }
    const owner = value;
    return (Number.isInteger(owner.pid) &&
        owner.pid > 0 &&
        typeof owner.token === 'string' &&
        owner.token.length > 0 &&
        typeof owner.processStartedAt === 'string' &&
        owner.processStartedAt.length > 0);
}
function hasErrorCode(error, code) {
    return Boolean(error &&
        typeof error === 'object' &&
        'code' in error &&
        error.code === code);
}
function isLockConflict(error) {
    return (hasErrorCode(error, 'EEXIST') ||
        hasErrorCode(error, 'ENOTEMPTY') ||
        hasErrorCode(error, 'ENOTDIR'));
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
