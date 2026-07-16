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
exports.FileTransactionPreconditionError = exports.FileTransactionConflictError = void 0;
exports.commitFileTransaction = commitFileTransaction;
const fs = __importStar(require("fs-extra"));
const path = __importStar(require("path"));
const crypto_1 = require("crypto");
const command_error_1 = require("./command-error");
class FileTransactionConflictError extends Error {
    constructor() {
        super(...arguments);
        this.code = 'TRANSACTION_TARGET_CONFLICT';
    }
}
exports.FileTransactionConflictError = FileTransactionConflictError;
class FileTransactionPreconditionError extends FileTransactionConflictError {
    constructor(target, message) {
        super(message);
        this.target = target;
    }
}
exports.FileTransactionPreconditionError = FileTransactionPreconditionError;
async function commitFileTransaction(root, writes, hooks = {}) {
    assertUniqueTargets(writes);
    const transactionRoot = path.join(root, '.alskai-notebank', 'transactions', `${process.pid}-${(0, crypto_1.randomUUID)()}`);
    const initiallyMissingDirectories = await findInitiallyMissingDirectories(root, transactionRoot, writes);
    const entries = [];
    let recoveryCompleted = true;
    try {
        assertInsideRoot(root, transactionRoot);
        await assertUsableParent(root, transactionRoot);
        for (const write of writes) {
            assertInsideRoot(root, write.target);
            await assertUsableParent(root, write.target);
        }
        for (const [index, write] of writes.entries()) {
            const existed = await pathExistsWithLstat(write.target);
            if (write.expectAbsent && existed) {
                throw new FileTransactionPreconditionError(write.target, `事务目标已经存在: ${write.target}`);
            }
            let original = null;
            if (existed) {
                const stat = await fs.lstat(write.target);
                if (stat.isSymbolicLink()) {
                    throw new Error(`事务目标不能是符号链接: ${write.target}`);
                }
                if (!stat.isFile()) {
                    throw new Error(`事务目标不是文件: ${write.target}`);
                }
                original = await fs.readFile(write.target);
            }
            if (write.expectedContent !== undefined) {
                const expected = Buffer.isBuffer(write.expectedContent)
                    ? write.expectedContent
                    : Buffer.from(write.expectedContent);
                if (!original || !original.equals(expected)) {
                    throw new FileTransactionPreconditionError(write.target, `事务目标与命令读取时的内容不一致: ${write.target}`);
                }
            }
            const staged = path.join(transactionRoot, 'staged', String(index));
            const backup = path.join(transactionRoot, 'backup', String(index));
            await fs.ensureDir(path.dirname(staged));
            await fs.writeFile(staged, write.content);
            entries.push({
                ...write,
                staged,
                backup,
                existed,
                original,
                backupMoved: false,
                stagedInstalled: false,
            });
        }
        for (const [index, entry] of entries.entries()) {
            await assertTargetUnchanged(entry);
            await hooks.beforeApply?.(index, entry.target);
            await fs.ensureDir(path.dirname(entry.target));
            if (entry.existed) {
                await fs.ensureDir(path.dirname(entry.backup));
                await fs.move(entry.target, entry.backup);
                entry.backupMoved = true;
                await assertBackupUnchanged(entry);
            }
            await hooks.afterBackup?.(index, entry.target);
            await linkFileNoClobber(entry.staged, entry.target);
            entry.stagedInstalled = true;
            await fs.remove(entry.staged);
        }
        for (const entry of entries) {
            if (entry.stagedInstalled && !(await targetMatchesWrite(entry))) {
                throw new FileTransactionPreconditionError(entry.target, `事务目标在提交完成前发生变化: ${entry.target}`);
            }
        }
    }
    catch (error) {
        try {
            await restoreEntries(entries);
        }
        catch (rollbackError) {
            recoveryCompleted = false;
            throw new Error(`${(0, command_error_1.getErrorMessage)(error)}；自动恢复失败：${(0, command_error_1.getErrorMessage)(rollbackError)}；` +
                `恢复快照保留在 ${transactionRoot}`);
        }
        throw error;
    }
    finally {
        if (recoveryCompleted) {
            try {
                await fs.remove(transactionRoot);
                await removeInitiallyMissingEmptyDirectories(initiallyMissingDirectories);
            }
            catch {
                // 提交已经完成；清理残留快照不应把成功操作伪装成事务失败。
            }
        }
    }
}
function assertUniqueTargets(writes) {
    const targets = new Set();
    for (const write of writes) {
        const target = path.resolve(write.target);
        if (targets.has(target)) {
            throw new Error(`事务目标重复: ${target}`);
        }
        targets.add(target);
    }
}
function assertInsideRoot(root, target) {
    const relative = path.relative(path.resolve(root), path.resolve(target));
    if (relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
        throw new Error(`事务目标超出知识库: ${target}`);
    }
}
async function assertUsableParent(root, target) {
    const resolvedRoot = path.resolve(root);
    const rootStat = await fs.stat(resolvedRoot);
    if (!rootStat.isDirectory()) {
        throw new Error(`事务根路径不是目录: ${resolvedRoot}`);
    }
    const relativeParent = path.relative(resolvedRoot, path.dirname(path.resolve(target)));
    let candidate = resolvedRoot;
    for (const segment of relativeParent.split(path.sep).filter(Boolean)) {
        candidate = path.join(candidate, segment);
        try {
            const stat = await fs.lstat(candidate);
            if (stat.isSymbolicLink()) {
                throw new Error(`事务目标父路径不能是符号链接: ${candidate}`);
            }
            if (!stat.isDirectory()) {
                throw new Error(`事务目标父路径不是目录: ${candidate}`);
            }
        }
        catch (error) {
            if (error.code === 'ENOENT') {
                return;
            }
            throw error;
        }
    }
}
async function assertTargetUnchanged(entry) {
    const exists = await pathExistsWithLstat(entry.target);
    if (!entry.existed) {
        if (exists) {
            throw new FileTransactionPreconditionError(entry.target, `事务目标在提交前被创建: ${entry.target}`);
        }
        return;
    }
    if (!exists || !entry.original) {
        throw new FileTransactionPreconditionError(entry.target, `事务目标在提交前消失: ${entry.target}`);
    }
    const stat = await fs.lstat(entry.target);
    if (stat.isSymbolicLink() || !stat.isFile()) {
        throw new FileTransactionPreconditionError(entry.target, `事务目标在提交前改变类型: ${entry.target}`);
    }
    const current = await fs.readFile(entry.target);
    if (!current.equals(entry.original)) {
        throw new FileTransactionPreconditionError(entry.target, `事务目标在提交前发生变化: ${entry.target}`);
    }
}
async function assertBackupUnchanged(entry) {
    if (!entry.original) {
        throw new Error(`事务备份缺少原始快照: ${entry.target}`);
    }
    const stat = await fs.lstat(entry.backup);
    if (stat.isSymbolicLink() || !stat.isFile()) {
        throw new FileTransactionPreconditionError(entry.target, `事务目标在替换前改变类型: ${entry.target}`);
    }
    const backup = await fs.readFile(entry.backup);
    if (!backup.equals(entry.original)) {
        throw new FileTransactionPreconditionError(entry.target, `事务目标在替换前发生变化: ${entry.target}`);
    }
}
async function pathExistsWithLstat(target) {
    try {
        await fs.lstat(target);
        return true;
    }
    catch (error) {
        if (error.code === 'ENOENT') {
            return false;
        }
        throw error;
    }
}
async function restoreEntries(entries) {
    const conflicts = [];
    for (const entry of [...entries].reverse()) {
        const targetWasVacated = entry.stagedInstalled || entry.backupMoved;
        if (entry.stagedInstalled) {
            if (await pathExistsWithLstat(entry.target)) {
                const rollbackCopy = rollbackCopyPath(entry);
                await fs.ensureDir(path.dirname(rollbackCopy));
                await fs.move(entry.target, rollbackCopy);
                if (await fileMatchesWrite(rollbackCopy, entry)) {
                    await fs.remove(rollbackCopy);
                }
                else {
                    const conflict = rollbackConflictPath(entry);
                    await fs.ensureDir(path.dirname(conflict));
                    await fs.move(rollbackCopy, conflict);
                    conflicts.push(conflict);
                }
            }
            entry.stagedInstalled = false;
        }
        if (targetWasVacated) {
            const lateConflict = await preserveLateTarget(entry);
            if (lateConflict) {
                conflicts.push(lateConflict);
            }
        }
        if (entry.backupMoved) {
            await fs.ensureDir(path.dirname(entry.target));
            try {
                await linkFileNoClobber(entry.backup, entry.target);
            }
            catch (error) {
                if (!(error instanceof FileTransactionPreconditionError)) {
                    throw error;
                }
                const restoreConflict = await preserveLateTarget(entry, 'restore');
                if (restoreConflict) {
                    conflicts.push(restoreConflict);
                }
                await linkFileNoClobber(entry.backup, entry.target);
            }
            await fs.remove(entry.backup);
            entry.backupMoved = false;
        }
    }
    if (conflicts.length > 0) {
        throw new Error(`回滚检测到并发修改，冲突副本保留在: ${conflicts.join(', ')}`);
    }
}
async function targetMatchesWrite(entry) {
    if (!(await pathExistsWithLstat(entry.target))) {
        return false;
    }
    return fileMatchesWrite(entry.target, entry);
}
async function fileMatchesWrite(target, entry) {
    const stat = await fs.lstat(target);
    if (stat.isSymbolicLink() || !stat.isFile()) {
        return false;
    }
    const current = await fs.readFile(target);
    const written = Buffer.isBuffer(entry.content)
        ? entry.content
        : Buffer.from(entry.content);
    return current.equals(written);
}
async function preserveLateTarget(entry, suffix = 'late') {
    if (!(await pathExistsWithLstat(entry.target))) {
        return null;
    }
    const preferred = `${rollbackConflictPath(entry)}-${suffix}`;
    const conflict = await pathExistsWithLstat(preferred)
        ? `${preferred}-${(0, crypto_1.randomUUID)()}`
        : preferred;
    await fs.ensureDir(path.dirname(conflict));
    await fs.move(entry.target, conflict);
    return conflict;
}
async function linkFileNoClobber(source, target) {
    try {
        await fs.link(source, target);
    }
    catch (error) {
        if (error.code === 'EEXIST') {
            throw new FileTransactionPreconditionError(target, `事务目标在原子安装前已存在: ${target}`);
        }
        throw error;
    }
}
function rollbackCopyPath(entry) {
    const transactionRoot = path.dirname(path.dirname(entry.backup));
    return path.join(transactionRoot, 'rollback', path.basename(entry.backup));
}
function rollbackConflictPath(entry) {
    const transactionRoot = path.dirname(path.dirname(entry.backup));
    return path.join(transactionRoot, 'conflicts', path.basename(entry.backup));
}
async function findInitiallyMissingDirectories(root, transactionRoot, writes) {
    const starts = [
        path.dirname(transactionRoot),
        ...writes.map((write) => path.dirname(write.target)),
    ];
    const candidates = new Set();
    for (const start of starts) {
        let current = start;
        while (current.startsWith(`${root}${path.sep}`)) {
            candidates.add(current);
            current = path.dirname(current);
        }
    }
    const missing = [];
    for (const candidate of candidates) {
        if (!(await fs.pathExists(candidate))) {
            missing.push(candidate);
        }
    }
    return missing.sort((left, right) => right.length - left.length);
}
async function removeInitiallyMissingEmptyDirectories(directories) {
    for (const directory of directories) {
        try {
            await fs.rmdir(directory);
        }
        catch (error) {
            const code = error.code;
            if (code !== 'ENOENT' && code !== 'ENOTEMPTY' && code !== 'EEXIST') {
                throw error;
            }
        }
    }
}
