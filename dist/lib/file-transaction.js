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
exports.recoverInterruptedFileTransactions = recoverInterruptedFileTransactions;
const fs = __importStar(require("fs-extra"));
const path = __importStar(require("path"));
const crypto_1 = require("crypto");
const command_error_1 = require("./command-error");
const process_identity_1 = require("./process-identity");
const TRANSACTION_JOURNAL = 'journal.json';
const activeTransactionRoots = new Set();
const activeRecoveryRoots = new Set();
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
class FileTransactionRollbackConflictError extends Error {
}
async function commitFileTransaction(root, mutations, hooks = {}) {
    root = path.resolve(root);
    await recoverInterruptedFileTransactions(root);
    assertUniqueTargets(mutations);
    if (mutations.length === 0) {
        return;
    }
    const currentProcessIdentity = await requireCurrentProcessIdentity();
    const transactionRoot = path.join(root, '.alskai-notebank', 'transactions', `${process.pid}-${processIdentityHash(currentProcessIdentity)}-${(0, crypto_1.randomUUID)()}`);
    const initiallyMissingDirectories = await findInitiallyMissingDirectories(root, transactionRoot, mutations);
    const entries = [];
    let recoveryCompleted = true;
    let journal = null;
    let workspaceIdentity = null;
    let cleanupRoot = null;
    activeTransactionRoots.add(transactionRoot);
    try {
        assertInsideRoot(root, transactionRoot);
        workspaceIdentity = await createTransactionWorkspace(root, transactionRoot);
        for (const mutation of mutations) {
            assertInsideRoot(root, mutation.target);
            await assertUsableParent(root, mutation.target);
        }
        for (const [index, mutation] of mutations.entries()) {
            if (mutation.delete && mutation.expectedContent === undefined) {
                throw new Error(`删除事务目标必须提供原始内容: ${mutation.target}`);
            }
            const existed = await pathExistsWithLstat(mutation.target);
            if (mutation.delete && !existed) {
                throw new FileTransactionPreconditionError(mutation.target, `待删除的事务目标不存在: ${mutation.target}`);
            }
            if (!mutation.delete && mutation.expectAbsent && existed) {
                throw new FileTransactionPreconditionError(mutation.target, `事务目标已经存在: ${mutation.target}`);
            }
            let original = null;
            let originalIdentity = null;
            if (existed) {
                const stat = await fs.lstat(mutation.target);
                if (stat.isSymbolicLink()) {
                    throw new Error(`事务目标不能是符号链接: ${mutation.target}`);
                }
                if (!stat.isFile()) {
                    throw new Error(`事务目标不是文件: ${mutation.target}`);
                }
                original = await fs.readFile(mutation.target);
                const verifiedStat = await fs.lstat(mutation.target);
                if (!sameFileIdentity(stat, verifiedStat)) {
                    throw new FileTransactionPreconditionError(mutation.target, `事务目标在读取期间被替换: ${mutation.target}`);
                }
                originalIdentity = fileIdentity(stat);
            }
            if (mutation.expectedContent !== undefined) {
                const expected = Buffer.isBuffer(mutation.expectedContent)
                    ? mutation.expectedContent
                    : Buffer.from(mutation.expectedContent);
                if (!original || !original.equals(expected)) {
                    throw new FileTransactionPreconditionError(mutation.target, `事务目标与命令读取时的内容不一致: ${mutation.target}`);
                }
            }
            const staged = mutation.delete
                ? null
                : path.join(transactionRoot, 'staged', String(index));
            const backup = path.join(transactionRoot, 'backup', String(index));
            let stagedIdentity = null;
            if (staged && !mutation.delete) {
                await assertTransactionWorkspaceUnchanged(workspaceIdentity);
                await fs.ensureDir(path.dirname(staged));
                await fs.writeFile(staged, mutation.content);
                stagedIdentity = fileIdentity(await fs.lstat(staged));
                await assertTransactionWorkspaceUnchanged(workspaceIdentity);
            }
            const parentIdentities = await captureParentIdentities(root, mutation.target);
            entries.push({
                mutation,
                target: mutation.target,
                staged,
                backup,
                existed,
                original,
                originalIdentity,
                stagedIdentity,
                parentIdentities,
                backupMoved: false,
                stagedInstalled: false,
            });
        }
        journal = await createTransactionJournal(entries, initiallyMissingDirectories);
        await assertTransactionWorkspaceUnchanged(workspaceIdentity);
        await writeTransactionJournal(transactionRoot, journal);
        await assertTransactionWorkspaceUnchanged(workspaceIdentity);
        for (const entry of entries) {
            await fs.ensureDir(path.dirname(entry.target));
            await assertUsableParent(root, entry.target);
            entry.parentIdentities = await captureParentIdentities(root, entry.target);
        }
        journal = await createTransactionJournal(entries, initiallyMissingDirectories);
        await assertTransactionWorkspaceUnchanged(workspaceIdentity);
        await writeTransactionJournal(transactionRoot, journal);
        await assertTransactionWorkspaceUnchanged(workspaceIdentity);
        for (const [index, entry] of entries.entries()) {
            await hooks.beforeApply?.(index, entry.target);
            await assertParentIdentitiesUnchanged(entry);
            await assertUsableParent(root, entry.target);
            await assertTargetUnchanged(entry);
            if (entry.existed) {
                await assertTransactionWorkspaceUnchanged(workspaceIdentity);
                await fs.ensureDir(path.dirname(entry.backup));
                await moveTargetToBackup(entry);
                await assertTransactionWorkspaceUnchanged(workspaceIdentity);
            }
            await assertParentIdentitiesUnchanged(entry);
            await hooks.afterBackup?.(index, entry.target);
            await assertParentIdentitiesUnchanged(entry);
            if (entry.staged) {
                if (!entry.stagedIdentity || entry.mutation.delete) {
                    throw new Error(`事务写入缺少可信暂存快照: ${entry.target}`);
                }
                const stagedSha256 = sha256(Buffer.isBuffer(entry.mutation.content)
                    ? entry.mutation.content
                    : Buffer.from(entry.mutation.content));
                await assertTransactionWorkspaceUnchanged(workspaceIdentity);
                if (await verifiedFileSha256(entry.staged, entry.stagedIdentity, '事务暂存安装') !==
                    stagedSha256) {
                    throw new Error(`事务暂存快照哈希不匹配: ${entry.staged}`);
                }
                await linkFileNoClobber(entry.staged, entry.target);
                entry.stagedInstalled = true;
                await assertInstalledIdentity(entry);
                await assertParentIdentitiesUnchanged(entry);
                await assertTransactionWorkspaceUnchanged(workspaceIdentity);
                if (await verifiedFileSha256(entry.staged, entry.stagedIdentity, '事务暂存安装') !==
                    stagedSha256) {
                    throw new Error(`事务暂存快照在安装期间被修改: ${entry.staged}`);
                }
                await unlinkVerifiedFile(entry.staged, entry.stagedIdentity, stagedSha256, '事务暂存快照清理');
                await assertTransactionWorkspaceUnchanged(workspaceIdentity);
            }
        }
        for (const entry of entries) {
            if ((entry.stagedInstalled && !(await targetMatchesWrite(entry))) ||
                (entry.mutation.delete && await pathExistsWithLstat(entry.target))) {
                throw new FileTransactionPreconditionError(entry.target, `事务目标在提交完成前发生变化: ${entry.target}`);
            }
        }
        journal = { ...journal, phase: 'committed' };
        await assertTransactionWorkspaceUnchanged(workspaceIdentity);
        await writeTransactionJournal(transactionRoot, journal);
        await assertTransactionWorkspaceUnchanged(workspaceIdentity);
    }
    catch (error) {
        try {
            await restoreEntries(entries);
            if (workspaceIdentity) {
                await assertTransactionWorkspaceUnchanged(workspaceIdentity);
            }
        }
        catch (rollbackError) {
            recoveryCompleted = false;
            if (rollbackError instanceof FileTransactionRollbackConflictError && journal) {
                try {
                    journal = { ...journal, phase: 'conflicted' };
                    if (workspaceIdentity) {
                        await assertTransactionWorkspaceUnchanged(workspaceIdentity);
                    }
                    await writeTransactionJournal(transactionRoot, journal);
                    if (workspaceIdentity) {
                        await assertTransactionWorkspaceUnchanged(workspaceIdentity);
                    }
                }
                catch (journalError) {
                    throw new Error(`${(0, command_error_1.getErrorMessage)(error)}；自动恢复检测到并发修改，且无法持久化冲突状态：` +
                        `${(0, command_error_1.getErrorMessage)(journalError)}；恢复快照保留在 ${transactionRoot}`);
                }
            }
            throw new Error(`${(0, command_error_1.getErrorMessage)(error)}；自动恢复失败：${(0, command_error_1.getErrorMessage)(rollbackError)}；` +
                `恢复快照保留在 ${transactionRoot}`);
        }
        throw error;
    }
    finally {
        try {
            if (recoveryCompleted && workspaceIdentity) {
                cleanupRoot = path.join(workspaceIdentity.transactionsRoot.target, `.cleanup-complete-${process.pid}-` +
                    `${processIdentityHash(currentProcessIdentity)}-${(0, crypto_1.randomUUID)()}`);
                if (!await claimTransactionDirectory(workspaceIdentity.transactionsRoot, workspaceIdentity.transactionRoot, transactionRoot, cleanupRoot)) {
                    throw new Error(`事务快照在进入清理阶段前消失: ${transactionRoot}`);
                }
                activeTransactionRoots.delete(transactionRoot);
                activeRecoveryRoots.add(path.resolve(cleanupRoot));
                await removeClaimedTransactionDirectory(workspaceIdentity.transactionsRoot, workspaceIdentity.transactionRoot, cleanupRoot);
                await removeInitiallyMissingEmptyDirectories(initiallyMissingDirectories);
            }
        }
        finally {
            activeTransactionRoots.delete(transactionRoot);
            if (cleanupRoot) {
                activeRecoveryRoots.delete(path.resolve(cleanupRoot));
            }
        }
    }
}
async function createTransactionWorkspace(root, transactionRoot) {
    const transactionsRoot = path.dirname(transactionRoot);
    await assertUsableParent(root, transactionRoot);
    await fs.ensureDir(transactionsRoot);
    await assertUsableParent(root, transactionRoot);
    const transactionsRootStat = await fs.lstat(transactionsRoot);
    if (transactionsRootStat.isSymbolicLink() || !transactionsRootStat.isDirectory()) {
        throw new Error(`事务工作根目录不是可信目录: ${transactionsRoot}`);
    }
    const transactionsRootIdentity = {
        target: transactionsRoot,
        dev: transactionsRootStat.dev,
        ino: transactionsRootStat.ino,
    };
    await assertDirectoryIdentityUnchanged(transactionsRootIdentity, '事务工作根目录');
    await fs.mkdir(transactionRoot);
    await assertDirectoryIdentityUnchanged(transactionsRootIdentity, '事务工作根目录');
    const transactionRootStat = await fs.lstat(transactionRoot);
    if (transactionRootStat.isSymbolicLink() || !transactionRootStat.isDirectory()) {
        throw new Error(`事务工作目录不是可信目录: ${transactionRoot}`);
    }
    const transactionRootIdentity = {
        target: transactionRoot,
        dev: transactionRootStat.dev,
        ino: transactionRootStat.ino,
    };
    await assertDirectoryIdentityUnchanged(transactionRootIdentity, '事务工作目录');
    return {
        transactionsRoot: transactionsRootIdentity,
        transactionRoot: transactionRootIdentity,
    };
}
async function assertTransactionWorkspaceUnchanged(workspace) {
    await assertDirectoryIdentityUnchanged(workspace.transactionsRoot, '事务工作根目录');
    await assertDirectoryIdentityUnchanged(workspace.transactionRoot, '事务工作目录');
}
async function createTransactionJournal(entries, initiallyMissingDirectories) {
    const processIdentity = await (0, process_identity_1.getProcessIdentity)(process.pid);
    if (processIdentity.status !== 'found') {
        throw new Error(`无法读取事务进程启动身份: ${process.pid}`);
    }
    return {
        schemaVersion: 1,
        phase: 'prepared',
        owner: {
            pid: process.pid,
            processStartedAt: processIdentity.identity,
        },
        initiallyMissingDirectories,
        entries: entries.map((entry) => {
            if (!entry.mutation.delete && !entry.stagedIdentity) {
                throw new Error(`事务写入缺少暂存文件身份: ${entry.target}`);
            }
            return {
                target: entry.target,
                kind: entry.mutation.delete ? 'delete' : 'write',
                existed: entry.existed,
                originalSha256: entry.original ? sha256(entry.original) : null,
                writtenSha256: entry.mutation.delete
                    ? null
                    : sha256(Buffer.isBuffer(entry.mutation.content)
                        ? entry.mutation.content
                        : Buffer.from(entry.mutation.content)),
                writtenIdentity: entry.mutation.delete ? null : entry.stagedIdentity,
                parentIdentities: entry.parentIdentities,
            };
        }),
    };
}
async function writeTransactionJournal(transactionRoot, journal) {
    await fs.ensureDir(transactionRoot);
    const target = path.join(transactionRoot, TRANSACTION_JOURNAL);
    const temporary = path.join(transactionRoot, `${TRANSACTION_JOURNAL}.${(0, crypto_1.randomUUID)()}.tmp`);
    await fs.writeFile(temporary, `${JSON.stringify(journal, null, 2)}\n`, { flag: 'wx' });
    await fs.rename(temporary, target);
}
async function recoverInterruptedFileTransactions(root) {
    root = path.resolve(root);
    const transactionsRoot = path.join(root, '.alskai-notebank', 'transactions');
    assertInsideRoot(root, transactionsRoot);
    await assertUsableParent(root, transactionsRoot);
    let rootStat;
    try {
        rootStat = await fs.lstat(transactionsRoot);
    }
    catch (error) {
        if (error.code === 'ENOENT') {
            return;
        }
        throw error;
    }
    if (rootStat.isSymbolicLink() || !rootStat.isDirectory()) {
        throw new Error(`事务恢复目录不是可信目录: ${transactionsRoot}`);
    }
    const transactionsRootIdentity = {
        target: transactionsRoot,
        dev: rootStat.dev,
        ino: rootStat.ino,
    };
    const currentProcessIdentity = await requireCurrentProcessIdentity();
    const currentIdentityHash = processIdentityHash(currentProcessIdentity);
    const cleanupDirectories = new Set();
    await assertDirectoryIdentityUnchanged(transactionsRootIdentity, '事务恢复根目录');
    const candidates = await fs.readdir(transactionsRoot, { withFileTypes: true });
    await assertDirectoryIdentityUnchanged(transactionsRootIdentity, '事务恢复根目录');
    for (const candidate of candidates) {
        const transactionRoot = path.join(transactionsRoot, candidate.name);
        await assertDirectoryIdentityUnchanged(transactionsRootIdentity, '事务恢复根目录');
        let candidateStat;
        try {
            candidateStat = await fs.lstat(transactionRoot);
        }
        catch (error) {
            if (error.code === 'ENOENT') {
                continue;
            }
            throw error;
        }
        await assertDirectoryIdentityUnchanged(transactionsRootIdentity, '事务恢复根目录');
        if (candidate.isSymbolicLink() ||
            !candidate.isDirectory() ||
            candidateStat.isSymbolicLink() ||
            !candidateStat.isDirectory()) {
            throw new Error(`事务恢复目录包含不安全条目: ${transactionRoot}`);
        }
        const transactionIdentity = {
            target: transactionRoot,
            dev: candidateStat.dev,
            ino: candidateStat.ino,
        };
        if (candidate.name.startsWith('.cleanup-complete-')) {
            if (!isCleanupCompleteTransactionName(candidate.name)) {
                throw new Error(`已完成事务清理目录名称无效: ${transactionRoot}`);
            }
            await removeClaimedTransactionDirectory(transactionsRootIdentity, transactionIdentity, transactionRoot);
            continue;
        }
        const recoveryOwner = recoveryClaimOwner(candidate.name);
        if (candidate.name.startsWith('.recovering-')) {
            if (!recoveryOwner) {
                throw new Error(`事务恢复认领目录名称无效: ${transactionRoot}`);
            }
            if (await recoveryClaimMayBeActive(recoveryOwner, transactionRoot)) {
                continue;
            }
        }
        const journal = await readTransactionJournal(transactionRoot);
        await assertDirectoryIdentityUnchanged(transactionsRootIdentity, '事务恢复根目录');
        await assertDirectoryIdentityUnchanged(transactionIdentity, '事务快照目录');
        if (!journal) {
            if (candidate.name.startsWith('.recovering-')) {
                throw new Error(`恢复认领目录缺少事务日志，快照已保留: ${transactionRoot}`);
            }
            const directoryOwner = transactionDirectoryOwner(candidate.name);
            if (!directoryOwner) {
                throw new Error(`无事务日志的恢复目录名称无效: ${candidate.name}`);
            }
            if (await transactionDirectoryMayBeActive(directoryOwner, transactionRoot)) {
                continue;
            }
            if (directoryOwner.identityHash === null) {
                throw new Error(`检测到旧版无日志事务快照，拒绝自动清理: ${transactionRoot}`);
            }
            const cleanupRoot = path.join(transactionsRoot, `.cleanup-complete-${process.pid}-${currentIdentityHash}-${(0, crypto_1.randomUUID)()}`);
            if (!await claimTransactionDirectory(transactionsRootIdentity, transactionIdentity, transactionRoot, cleanupRoot)) {
                continue;
            }
            activeRecoveryRoots.add(path.resolve(cleanupRoot));
            try {
                await removeClaimedTransactionDirectory(transactionsRootIdentity, transactionIdentity, cleanupRoot);
            }
            finally {
                activeRecoveryRoots.delete(path.resolve(cleanupRoot));
            }
            continue;
        }
        validateTransactionJournal(root, journal);
        if (journal.phase === 'conflicted') {
            continue;
        }
        if (await journalOwnerMayBeActive(journal.owner, transactionRoot)) {
            continue;
        }
        await assertNoProtectedRecoveryArtifacts(transactionRoot);
        await validateRecoveryQuarantineDirectory(transactionRoot, journal.entries.length);
        const claimedRoot = path.join(transactionsRoot, `.recovering-${sha256(Buffer.from(candidate.name)).slice(0, 16)}-` +
            `${process.pid}-${currentIdentityHash}-${(0, crypto_1.randomUUID)()}`);
        if (!await claimTransactionDirectory(transactionsRootIdentity, transactionIdentity, transactionRoot, claimedRoot)) {
            continue;
        }
        activeRecoveryRoots.add(path.resolve(claimedRoot));
        let completedCleanupRoot = null;
        try {
            await assertDirectoryIdentityUnchanged(transactionsRootIdentity, '事务恢复根目录');
            await assertDirectoryIdentityUnchanged({ ...transactionIdentity, target: claimedRoot }, '已认领事务快照');
            await assertNoProtectedRecoveryArtifacts(claimedRoot);
            await validateRecoveryQuarantineDirectory(claimedRoot, journal.entries.length);
            const claimedJournal = {
                ...journal,
                owner: {
                    pid: process.pid,
                    processStartedAt: currentProcessIdentity,
                },
            };
            await writeTransactionJournal(claimedRoot, claimedJournal);
            if (claimedJournal.phase === 'prepared') {
                await restoreJournalEntries(root, claimedRoot, claimedJournal);
            }
            await assertNoProtectedRecoveryArtifacts(claimedRoot);
            await validateRecoveryQuarantineDirectory(claimedRoot, claimedJournal.entries.length);
            const cleanupRoot = path.join(transactionsRoot, `.cleanup-complete-${process.pid}-${currentIdentityHash}-${(0, crypto_1.randomUUID)()}`);
            if (!await claimTransactionDirectory(transactionsRootIdentity, transactionIdentity, claimedRoot, cleanupRoot)) {
                throw new Error(`已恢复事务快照在进入清理阶段前消失: ${claimedRoot}`);
            }
            completedCleanupRoot = cleanupRoot;
            activeRecoveryRoots.delete(path.resolve(claimedRoot));
            activeRecoveryRoots.add(path.resolve(cleanupRoot));
            await removeClaimedTransactionDirectory(transactionsRootIdentity, transactionIdentity, cleanupRoot);
            for (const directory of claimedJournal.initiallyMissingDirectories) {
                cleanupDirectories.add(directory);
            }
        }
        catch (error) {
            if (completedCleanupRoot) {
                throw new Error(`文件事务已经恢复，但快照清理未完成：${(0, command_error_1.getErrorMessage)(error)}；` +
                    `可续清理快照保留在 ${completedCleanupRoot}`);
            }
            let snapshotRoot = claimedRoot;
            let releaseError;
            try {
                await assertDirectoryIdentityUnchanged(transactionsRootIdentity, '事务恢复根目录');
                await assertDirectoryIdentityUnchanged({ ...transactionIdentity, target: claimedRoot }, '失败事务快照');
                await writeTransactionJournal(claimedRoot, journal);
                const pendingRoot = path.join(transactionsRoot, `.pending-${sha256(Buffer.from(candidate.name)).slice(0, 16)}-${(0, crypto_1.randomUUID)()}`);
                if (!await claimTransactionDirectory(transactionsRootIdentity, transactionIdentity, claimedRoot, pendingRoot)) {
                    throw new Error(`失败事务快照在释放认领时消失: ${claimedRoot}`);
                }
                snapshotRoot = pendingRoot;
            }
            catch (claimReleaseError) {
                releaseError = claimReleaseError;
            }
            throw new Error(`无法恢复中断的文件事务 ${claimedRoot}：${(0, command_error_1.getErrorMessage)(error)}；` +
                `恢复快照已保留在 ${snapshotRoot}` +
                (releaseError ? `；释放恢复认领失败：${(0, command_error_1.getErrorMessage)(releaseError)}` : ''));
        }
        finally {
            activeRecoveryRoots.delete(path.resolve(claimedRoot));
            if (completedCleanupRoot) {
                activeRecoveryRoots.delete(path.resolve(completedCleanupRoot));
            }
        }
    }
    await assertDirectoryIdentityUnchanged(transactionsRootIdentity, '事务恢复根目录');
    await removeInitiallyMissingEmptyDirectories([...cleanupDirectories].sort((left, right) => right.length - left.length));
}
function isCleanupCompleteTransactionName(name) {
    return /^\.cleanup-complete-\d+-[0-9a-f]{64}-[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(name);
}
async function claimTransactionDirectory(transactionsRootIdentity, transactionIdentity, source, destination) {
    await assertDirectoryIdentityUnchanged(transactionsRootIdentity, '事务恢复根目录');
    await assertDirectoryIdentityUnchanged({ ...transactionIdentity, target: source }, '待认领事务快照');
    try {
        await fs.rename(source, destination);
    }
    catch (error) {
        if (error.code === 'ENOENT') {
            return false;
        }
        throw error;
    }
    await assertDirectoryIdentityUnchanged(transactionsRootIdentity, '事务恢复根目录');
    await assertDirectoryIdentityUnchanged({ ...transactionIdentity, target: destination }, '已认领事务快照');
    return true;
}
async function removeClaimedTransactionDirectory(transactionsRootIdentity, transactionIdentity, claimedRoot) {
    await assertDirectoryIdentityUnchanged(transactionsRootIdentity, '事务恢复根目录');
    await assertDirectoryIdentityUnchanged({ ...transactionIdentity, target: claimedRoot }, '待清理事务快照');
    await fs.remove(claimedRoot);
    await assertDirectoryIdentityUnchanged(transactionsRootIdentity, '事务恢复根目录');
}
async function assertDirectoryIdentityUnchanged(identity, label) {
    let stat;
    try {
        stat = await fs.lstat(identity.target);
    }
    catch (error) {
        throw new Error(`${label}在操作期间消失: ${identity.target}（${(0, command_error_1.getErrorMessage)(error)}）`);
    }
    if (stat.isSymbolicLink() ||
        !stat.isDirectory() ||
        stat.dev !== identity.dev ||
        stat.ino !== identity.ino) {
        throw new Error(`${label}在操作期间被替换: ${identity.target}`);
    }
}
async function readTransactionJournal(transactionRoot) {
    const target = path.join(transactionRoot, TRANSACTION_JOURNAL);
    let stat;
    try {
        stat = await fs.lstat(target);
    }
    catch (error) {
        if (error.code === 'ENOENT') {
            return null;
        }
        throw error;
    }
    if (stat.isSymbolicLink() || !stat.isFile()) {
        throw new Error(`事务日志不是可信文件: ${target}`);
    }
    try {
        return JSON.parse(await fs.readFile(target, 'utf8'));
    }
    catch (error) {
        throw new Error(`事务日志无法解析: ${target}（${(0, command_error_1.getErrorMessage)(error)}）`);
    }
}
function validateTransactionJournal(root, journal) {
    if (journal.schemaVersion !== 1 ||
        (journal.phase !== 'prepared' &&
            journal.phase !== 'committed' &&
            journal.phase !== 'conflicted') ||
        !journal.owner ||
        !Number.isSafeInteger(journal.owner.pid) ||
        journal.owner.pid <= 0 ||
        typeof journal.owner.processStartedAt !== 'string' ||
        journal.owner.processStartedAt.length === 0 ||
        !Array.isArray(journal.initiallyMissingDirectories) ||
        !Array.isArray(journal.entries)) {
        throw new Error('事务日志结构无效');
    }
    const targets = new Set();
    for (const directory of journal.initiallyMissingDirectories) {
        if (typeof directory !== 'string') {
            throw new Error('事务日志包含无效目录');
        }
        assertInsideRoot(root, directory);
    }
    for (const entry of journal.entries) {
        if (!entry ||
            typeof entry.target !== 'string' ||
            (entry.kind !== 'write' && entry.kind !== 'delete') ||
            typeof entry.existed !== 'boolean' ||
            !isNullableSha256(entry.originalSha256) ||
            !isNullableSha256(entry.writtenSha256) ||
            !isNullableFileIdentity(entry.writtenIdentity) ||
            !Array.isArray(entry.parentIdentities)) {
            throw new Error('事务日志包含无效条目');
        }
        assertInsideRoot(root, entry.target);
        const resolvedTarget = path.resolve(entry.target);
        if (targets.has(resolvedTarget)) {
            throw new Error(`事务日志目标重复: ${entry.target}`);
        }
        targets.add(resolvedTarget);
        if (entry.existed !== (entry.originalSha256 !== null)) {
            throw new Error(`事务日志原始哈希与存在状态不一致: ${entry.target}`);
        }
        if ((entry.kind === 'delete') !== (entry.writtenSha256 === null)) {
            throw new Error(`事务日志写入哈希与操作类型不一致: ${entry.target}`);
        }
        if ((entry.kind === 'delete') !== (entry.writtenIdentity === null)) {
            throw new Error(`事务日志写入身份与操作类型不一致: ${entry.target}`);
        }
        for (const identity of entry.parentIdentities) {
            if (!identity ||
                typeof identity.target !== 'string' ||
                !Number.isSafeInteger(identity.dev) ||
                !Number.isSafeInteger(identity.ino)) {
                throw new Error(`事务日志包含无效父路径身份: ${entry.target}`);
            }
            assertInsideRoot(root, identity.target);
        }
    }
}
function isNullableSha256(value) {
    return value === null || (typeof value === 'string' && /^[a-f0-9]{64}$/.test(value));
}
function isNullableFileIdentity(value) {
    if (value === null) {
        return true;
    }
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        return false;
    }
    const identity = value;
    return Number.isSafeInteger(identity.dev) &&
        Number(identity.dev) >= 0 &&
        Number.isSafeInteger(identity.ino) &&
        Number(identity.ino) > 0;
}
async function assertNoProtectedRecoveryArtifacts(transactionRoot) {
    for (const directoryName of ['conflicts', 'rollback']) {
        const directory = path.join(transactionRoot, directoryName);
        let stat;
        try {
            stat = await fs.lstat(directory);
        }
        catch (error) {
            if (error.code === 'ENOENT') {
                continue;
            }
            throw error;
        }
        if (stat.isSymbolicLink() || !stat.isDirectory()) {
            throw new Error(`事务恢复证据目录不是可信目录: ${directory}`);
        }
        if ((await fs.readdir(directory)).length > 0) {
            throw new Error(`事务恢复检测到待人工处理的证据，拒绝自动清理: ${directory}`);
        }
    }
}
async function validateRecoveryQuarantineDirectory(transactionRoot, entryCount) {
    const directory = path.join(transactionRoot, 'recovery-quarantine');
    let stat;
    try {
        stat = await fs.lstat(directory);
    }
    catch (error) {
        if (error.code === 'ENOENT') {
            return;
        }
        throw error;
    }
    if (stat.isSymbolicLink() || !stat.isDirectory()) {
        throw new Error(`事务恢复隔离目录不是可信目录: ${directory}`);
    }
    for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
        if (!/^(0|[1-9]\d*)$/.test(entry.name)) {
            throw new Error(`事务恢复隔离目录包含未知条目: ${path.join(directory, entry.name)}`);
        }
        const index = Number(entry.name);
        if (!Number.isSafeInteger(index) ||
            index < 0 ||
            index >= entryCount ||
            entry.isSymbolicLink() ||
            !entry.isFile()) {
            throw new Error(`事务恢复隔离目录包含不安全条目: ${path.join(directory, entry.name)}`);
        }
    }
}
async function reconcileJournalQuarantine(root, entry, transactionRoot, index) {
    const quarantine = recoveryQuarantinePath(transactionRoot, index);
    if (!(await pathExistsWithLstat(quarantine))) {
        return;
    }
    const quarantineStat = await fs.lstat(quarantine);
    if (quarantineStat.isSymbolicLink() || !quarantineStat.isFile()) {
        throw new Error(`事务恢复隔离文件不是普通文件: ${quarantine}`);
    }
    const quarantineIdentity = fileIdentity(quarantineStat);
    const quarantineSha256 = await regularFileSha256(quarantine);
    if (!quarantineSha256) {
        throw new Error(`事务恢复隔离文件无法读取: ${quarantine}`);
    }
    if (await pathExistsWithLstat(entry.target)) {
        const targetStat = await fs.lstat(entry.target);
        if (targetStat.isSymbolicLink() || !targetStat.isFile()) {
            throw new Error(`隔离恢复目标不是普通文件: ${entry.target}`);
        }
        if (sameFileIdentity(targetStat, quarantineIdentity)) {
            await unlinkVerifiedFile(quarantine, quarantineIdentity, quarantineSha256, '重复隔离链接清理');
            return;
        }
        const targetSha256 = await regularFileSha256(entry.target);
        if (entry.writtenIdentity &&
            sameFileIdentity(quarantineStat, entry.writtenIdentity) &&
            entry.writtenSha256 === quarantineSha256 &&
            entry.originalSha256 !== null &&
            targetSha256 === entry.originalSha256) {
            await unlinkVerifiedFile(quarantine, entry.writtenIdentity, entry.writtenSha256, '已恢复事务输出清理');
            return;
        }
        throw new Error(`事务恢复隔离文件与现有目标均可能包含人工内容: ${quarantine}, ${entry.target}`);
    }
    await assertJournalParentIdentities(entry);
    await assertUsableParent(root, entry.target);
    await fs.ensureDir(path.dirname(entry.target));
    await installVerifiedHardLinkAndRetireSource(quarantine, entry.target, async () => {
        await assertJournalParentIdentities(entry);
        await assertUsableParent(root, entry.target);
    }, '事务恢复隔离文件归还', quarantineIdentity, quarantineSha256);
}
function recoveryQuarantinePath(transactionRoot, index) {
    return path.join(transactionRoot, 'recovery-quarantine', String(index));
}
async function restoreJournalEntries(root, transactionRoot, journal) {
    await validateRecoveryQuarantineDirectory(transactionRoot, journal.entries.length);
    for (let index = journal.entries.length - 1; index >= 0; index -= 1) {
        const entry = journal.entries[index];
        await assertJournalParentIdentities(entry);
        await assertUsableParent(root, entry.target);
        await reconcileJournalQuarantine(root, entry, transactionRoot, index);
        const backup = path.join(transactionRoot, 'backup', String(index));
        const backupExists = await pathExistsWithLstat(backup);
        if (!entry.existed) {
            if (backupExists) {
                throw new Error(`原本不存在的目标出现了异常备份: ${entry.target}`);
            }
            await removeInterruptedWrite(root, entry, transactionRoot, index);
            continue;
        }
        if (!entry.originalSha256) {
            throw new Error(`事务日志缺少原始哈希: ${entry.target}`);
        }
        if (!backupExists) {
            if (!(await fileMatchesSha256(entry.target, entry.originalSha256))) {
                throw new Error(`目标与原始快照均无法用于恢复: ${entry.target}`);
            }
            continue;
        }
        if (!(await fileMatchesSha256(backup, entry.originalSha256))) {
            throw new Error(`事务备份哈希不匹配: ${backup}`);
        }
        if (await pathExistsWithLstat(entry.target)) {
            const currentSha256 = await regularFileSha256(entry.target);
            if (currentSha256 === entry.originalSha256) {
                await unlinkVerifiedFile(backup, undefined, entry.originalSha256, '重复原始备份清理');
                continue;
            }
            if (!entry.writtenSha256 || currentSha256 !== entry.writtenSha256) {
                throw new Error(`目标在事务中断后被人工修改: ${entry.target}`);
            }
            const quarantine = await quarantineJournalTarget(root, entry, transactionRoot, index, entry.writtenSha256);
            await assertJournalParentIdentities(entry);
            await assertUsableParent(root, entry.target);
            await fs.ensureDir(path.dirname(entry.target));
            await installVerifiedHardLinkAndRetireSource(backup, entry.target, async () => {
                await assertJournalParentIdentities(entry);
                await assertUsableParent(root, entry.target);
            }, '事务原始备份恢复', undefined, entry.originalSha256);
            await unlinkVerifiedFile(quarantine, entry.writtenIdentity ?? undefined, entry.writtenSha256, '已恢复事务输出清理');
            continue;
        }
        await assertJournalParentIdentities(entry);
        await assertUsableParent(root, entry.target);
        await fs.ensureDir(path.dirname(entry.target));
        await installVerifiedHardLinkAndRetireSource(backup, entry.target, async () => {
            await assertJournalParentIdentities(entry);
            await assertUsableParent(root, entry.target);
        }, '事务原始备份恢复', undefined, entry.originalSha256);
    }
}
async function removeInterruptedWrite(root, entry, transactionRoot, index) {
    if (!(await pathExistsWithLstat(entry.target))) {
        return;
    }
    if (!entry.writtenSha256) {
        throw new Error(`新目标在事务中断后被人工修改: ${entry.target}`);
    }
    const quarantine = await quarantineJournalTarget(root, entry, transactionRoot, index, entry.writtenSha256);
    await unlinkVerifiedFile(quarantine, entry.writtenIdentity ?? undefined, entry.writtenSha256, '中断事务输出清理');
}
async function quarantineJournalTarget(root, entry, transactionRoot, index, expectedSha256) {
    if (!entry.writtenIdentity) {
        throw new Error(`事务日志缺少写入文件身份: ${entry.target}`);
    }
    const stat = await fs.lstat(entry.target);
    if (stat.isSymbolicLink() || !stat.isFile()) {
        throw new Error(`恢复目标不是普通文件: ${entry.target}`);
    }
    const identity = fileIdentity(stat);
    if (!sameFileIdentity(stat, entry.writtenIdentity)) {
        throw new Error(`恢复目标已被其他操作替换: ${entry.target}`);
    }
    const quarantine = recoveryQuarantinePath(transactionRoot, index);
    await fs.ensureDir(path.dirname(quarantine));
    if (await pathExistsWithLstat(quarantine)) {
        throw new Error(`事务恢复隔离文件已经存在: ${quarantine}`);
    }
    await fs.move(entry.target, quarantine);
    const quarantinedStat = await fs.lstat(quarantine);
    if (!sameFileIdentity(quarantinedStat, identity)) {
        await restoreUnexpectedMovedFile(quarantine, entry.target, quarantinedStat);
        throw new Error(`恢复期间事务目标父路径被替换: ${entry.target}`);
    }
    await assertJournalParentIdentities(entry);
    const quarantinedSha256 = await regularFileSha256(quarantine);
    if (!quarantinedSha256) {
        throw new Error(`事务恢复隔离文件无法读取: ${quarantine}`);
    }
    if (quarantinedSha256 !== expectedSha256) {
        await installVerifiedHardLinkAndRetireSource(quarantine, entry.target, async () => {
            await assertJournalParentIdentities(entry);
            await assertUsableParent(root, entry.target);
        }, '人工修改隔离文件归还', identity, quarantinedSha256);
        throw new Error(`目标在事务恢复认领时被人工修改: ${entry.target}`);
    }
    return quarantine;
}
async function assertJournalParentIdentities(entry) {
    for (const identity of entry.parentIdentities) {
        let stat;
        try {
            stat = await fs.lstat(identity.target);
        }
        catch (error) {
            throw new Error(`事务目标父路径在恢复前消失: ${identity.target}（${(0, command_error_1.getErrorMessage)(error)}）`);
        }
        if (stat.isSymbolicLink() ||
            !stat.isDirectory() ||
            stat.dev !== identity.dev ||
            stat.ino !== identity.ino) {
            throw new Error(`事务目标父路径在恢复前被替换: ${identity.target}`);
        }
    }
}
async function fileMatchesSha256(target, expected) {
    return await regularFileSha256(target) === expected;
}
async function regularFileSha256(target) {
    let stat;
    try {
        stat = await fs.lstat(target);
    }
    catch (error) {
        if (error.code === 'ENOENT') {
            return null;
        }
        throw error;
    }
    if (stat.isSymbolicLink() || !stat.isFile()) {
        return null;
    }
    return sha256(await fs.readFile(target));
}
function sha256(content) {
    return (0, crypto_1.createHash)('sha256').update(content).digest('hex');
}
async function requireCurrentProcessIdentity() {
    const identity = await (0, process_identity_1.getProcessIdentity)(process.pid);
    if (identity.status !== 'found') {
        throw new Error(`无法读取当前进程启动身份: ${process.pid}`);
    }
    return identity.identity;
}
function processIdentityHash(identity) {
    return sha256(Buffer.from(identity));
}
async function transactionDirectoryMayBeActive(owner, transactionRoot) {
    if (owner.pid === process.pid) {
        return activeTransactionRoots.has(path.resolve(transactionRoot));
    }
    const identity = await (0, process_identity_1.getProcessIdentity)(owner.pid, { fresh: true });
    if (identity.status === 'unknown') {
        return true;
    }
    if (identity.status === 'missing') {
        return false;
    }
    return owner.identityHash === null ||
        processIdentityHash(identity.identity) === owner.identityHash;
}
function transactionDirectoryOwner(name) {
    const current = name.match(/^(\d+)-([0-9a-f]{64})-[0-9a-f]{8}-[0-9a-f-]{27}$/i);
    if (current) {
        const pid = Number.parseInt(current[1], 10);
        return Number.isSafeInteger(pid) && pid > 0
            ? { pid, identityHash: current[2].toLowerCase() }
            : null;
    }
    const legacy = name.match(/^(\d+)-[0-9a-f]{8}-[0-9a-f-]{27}$/i);
    if (!legacy) {
        return null;
    }
    const pid = Number.parseInt(legacy[1], 10);
    return Number.isSafeInteger(pid) && pid > 0
        ? { pid, identityHash: null }
        : null;
}
function recoveryClaimOwner(name) {
    if (!name.startsWith('.recovering-')) {
        return null;
    }
    const current = name.match(/-(\d+)-([0-9a-f]{64})-[0-9a-f]{8}-[0-9a-f-]{27}$/i);
    if (current) {
        const pid = Number.parseInt(current[1], 10);
        return Number.isSafeInteger(pid) && pid > 0
            ? { pid, identityHash: current[2].toLowerCase() }
            : null;
    }
    const legacy = name.match(/-(\d+)-[0-9a-f]{8}-[0-9a-f-]{27}$/i);
    if (!legacy) {
        return null;
    }
    const pid = Number.parseInt(legacy[1], 10);
    return Number.isSafeInteger(pid) && pid > 0
        ? { pid, identityHash: null }
        : null;
}
async function recoveryClaimMayBeActive(owner, transactionRoot) {
    if (owner.pid === process.pid) {
        return activeRecoveryRoots.has(path.resolve(transactionRoot));
    }
    const identity = await (0, process_identity_1.getProcessIdentity)(owner.pid, { fresh: true });
    if (identity.status === 'unknown') {
        return true;
    }
    if (identity.status === 'missing') {
        return false;
    }
    return owner.identityHash === null ||
        processIdentityHash(identity.identity) === owner.identityHash;
}
async function journalOwnerMayBeActive(owner, transactionRoot) {
    if (owner.pid === process.pid) {
        const resolvedRoot = path.resolve(transactionRoot);
        return activeTransactionRoots.has(resolvedRoot) || activeRecoveryRoots.has(resolvedRoot);
    }
    const identity = await (0, process_identity_1.getProcessIdentity)(owner.pid, { fresh: true });
    if (identity.status === 'unknown') {
        return true;
    }
    return identity.status === 'found' && identity.identity === owner.processStartedAt;
}
function assertUniqueTargets(mutations) {
    const targets = new Set();
    for (const mutation of mutations) {
        const target = path.resolve(mutation.target);
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
    const rootStat = await fs.lstat(resolvedRoot);
    if (rootStat.isSymbolicLink() || !rootStat.isDirectory()) {
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
async function captureParentIdentities(root, target) {
    const resolvedRoot = path.resolve(root);
    const relativeParent = path.relative(resolvedRoot, path.dirname(path.resolve(target)));
    const candidates = [resolvedRoot];
    let current = resolvedRoot;
    for (const segment of relativeParent.split(path.sep).filter(Boolean)) {
        current = path.join(current, segment);
        candidates.push(current);
    }
    const identities = [];
    for (const candidate of candidates) {
        try {
            const stat = await fs.lstat(candidate);
            if (stat.isSymbolicLink() || !stat.isDirectory()) {
                throw new Error(`事务目标父路径不能是符号链接或非目录: ${candidate}`);
            }
            identities.push({ target: candidate, dev: stat.dev, ino: stat.ino });
        }
        catch (error) {
            if (error.code === 'ENOENT') {
                break;
            }
            throw error;
        }
    }
    return identities;
}
async function assertParentIdentitiesUnchanged(entry) {
    for (const identity of entry.parentIdentities) {
        let stat;
        try {
            stat = await fs.lstat(identity.target);
        }
        catch (error) {
            throw new FileTransactionPreconditionError(entry.target, `事务目标父路径在提交前消失: ${identity.target}（${(0, command_error_1.getErrorMessage)(error)}）`);
        }
        if (stat.isSymbolicLink() ||
            !stat.isDirectory() ||
            stat.dev !== identity.dev ||
            stat.ino !== identity.ino) {
            throw new FileTransactionPreconditionError(entry.target, `事务目标父路径在提交期间被替换: ${identity.target}`);
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
    if (!entry.originalIdentity || !sameFileIdentity(stat, entry.originalIdentity)) {
        throw new FileTransactionPreconditionError(entry.target, `事务目标在提交前被替换: ${entry.target}`);
    }
    const current = await fs.readFile(entry.target);
    if (!current.equals(entry.original)) {
        throw new FileTransactionPreconditionError(entry.target, `事务目标在替换前发生变化: ${entry.target}`);
    }
}
async function moveTargetToBackup(entry) {
    if (!entry.originalIdentity) {
        throw new Error(`事务目标缺少原始文件身份: ${entry.target}`);
    }
    await fs.move(entry.target, entry.backup);
    entry.backupMoved = true;
    const backupStat = await fs.lstat(entry.backup);
    if (!sameFileIdentity(backupStat, entry.originalIdentity)) {
        try {
            await restoreUnexpectedMovedFile(entry.backup, entry.target, backupStat);
            entry.backupMoved = false;
        }
        catch (restoreError) {
            throw new Error(`事务目标父路径在移动窗口被替换，误移动文件保留在 ${entry.backup}；` +
                `自动归还失败：${(0, command_error_1.getErrorMessage)(restoreError)}`);
        }
        throw new FileTransactionPreconditionError(entry.target, `事务目标父路径在移动窗口被替换: ${entry.target}`);
    }
    await assertBackupUnchanged(entry);
}
async function assertBackupUnchanged(entry) {
    if (!entry.original || !entry.originalIdentity) {
        throw new Error(`事务备份缺少原始快照: ${entry.target}`);
    }
    const stat = await fs.lstat(entry.backup);
    if (stat.isSymbolicLink() || !stat.isFile()) {
        throw new FileTransactionPreconditionError(entry.target, `事务目标在替换前改变类型: ${entry.target}`);
    }
    if (!sameFileIdentity(stat, entry.originalIdentity)) {
        throw new FileTransactionPreconditionError(entry.target, `事务目标在替换前被替换: ${entry.target}`);
    }
    const backup = await fs.readFile(entry.backup);
    if (!backup.equals(entry.original)) {
        throw new FileTransactionPreconditionError(entry.target, `事务目标在替换前发生变化: ${entry.target}`);
    }
}
async function assertInstalledIdentity(entry) {
    if (!entry.stagedIdentity) {
        throw new Error(`事务写入缺少暂存文件身份: ${entry.target}`);
    }
    const stat = await fs.lstat(entry.target);
    if (stat.isSymbolicLink() ||
        !stat.isFile() ||
        !sameFileIdentity(stat, entry.stagedIdentity)) {
        throw new FileTransactionPreconditionError(entry.target, `事务目标在原子安装期间被替换: ${entry.target}`);
    }
}
async function restoreUnexpectedMovedFile(movedFile, logicalTarget, movedIdentity) {
    const realParent = await fs.realpath(path.dirname(logicalTarget));
    const realParentStat = await fs.lstat(realParent);
    if (realParentStat.isSymbolicLink() || !realParentStat.isDirectory()) {
        throw new Error(`误移动文件的实际父路径不是可信目录: ${realParent}`);
    }
    const realParentIdentity = {
        target: realParent,
        dev: realParentStat.dev,
        ino: realParentStat.ino,
    };
    const actualTarget = path.join(realParent, path.basename(logicalTarget));
    if (await pathExistsWithLstat(actualTarget)) {
        throw new Error(`误移动文件的原位置已被占用: ${actualTarget}`);
    }
    await installVerifiedHardLinkAndRetireSource(movedFile, actualTarget, async () => assertDirectoryIdentityUnchanged(realParentIdentity, '误移动文件实际父路径'), '误移动文件归还', movedIdentity);
}
function fileIdentity(stat) {
    return { dev: stat.dev, ino: stat.ino };
}
function sameFileIdentity(stat, identity) {
    return stat.dev === identity.dev && stat.ino === identity.ino;
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
                const targetStat = await fs.lstat(entry.target);
                if (!entry.stagedIdentity ||
                    targetStat.isSymbolicLink() ||
                    !targetStat.isFile() ||
                    !sameFileIdentity(targetStat, entry.stagedIdentity)) {
                    throw new Error(`回滚目标已被并发替换，原文件保留在: ${entry.target}`);
                }
                await fs.move(entry.target, rollbackCopy);
                const rollbackStat = await fs.lstat(rollbackCopy);
                if (!sameFileIdentity(rollbackStat, entry.stagedIdentity)) {
                    await restoreUnexpectedMovedFile(rollbackCopy, entry.target, rollbackStat);
                    throw new Error(`回滚期间事务目标父路径被替换: ${entry.target}`);
                }
                if (await fileMatchesWrite(rollbackCopy, entry)) {
                    if (!entry.stagedIdentity || entry.mutation.delete) {
                        throw new Error(`回滚事务输出缺少可信身份: ${entry.target}`);
                    }
                    const written = Buffer.isBuffer(entry.mutation.content)
                        ? entry.mutation.content
                        : Buffer.from(entry.mutation.content);
                    await unlinkVerifiedFile(rollbackCopy, entry.stagedIdentity, sha256(written), '回滚事务输出清理');
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
            await assertParentIdentitiesUnchanged(entry);
            const lateConflict = await preserveLateTarget(entry);
            if (lateConflict) {
                conflicts.push(lateConflict);
            }
        }
        if (entry.backupMoved) {
            await fs.ensureDir(path.dirname(entry.target));
            try {
                await installVerifiedHardLinkAndRetireSource(entry.backup, entry.target, async () => assertParentIdentitiesUnchanged(entry), '事务回滚备份恢复', entry.originalIdentity ?? undefined, entry.original ? sha256(entry.original) : undefined);
            }
            catch (error) {
                if (!(error instanceof FileTransactionPreconditionError)) {
                    throw error;
                }
                const restoreConflict = await preserveLateTarget(entry, 'restore');
                if (restoreConflict) {
                    conflicts.push(restoreConflict);
                }
                await installVerifiedHardLinkAndRetireSource(entry.backup, entry.target, async () => assertParentIdentitiesUnchanged(entry), '事务回滚备份恢复', entry.originalIdentity ?? undefined, entry.original ? sha256(entry.original) : undefined);
            }
            entry.backupMoved = false;
        }
    }
    if (conflicts.length > 0) {
        throw new FileTransactionRollbackConflictError(`回滚检测到并发修改，冲突副本保留在: ${conflicts.join(', ')}`);
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
    if (entry.mutation.delete) {
        return false;
    }
    const written = Buffer.isBuffer(entry.mutation.content)
        ? entry.mutation.content
        : Buffer.from(entry.mutation.content);
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
async function installVerifiedHardLinkAndRetireSource(source, target, verifyParent, label, expectedSourceIdentity, expectedSourceSha256) {
    try {
        await verifyParent();
    }
    catch (error) {
        throw new Error(`${label}前父路径验证失败：${(0, command_error_1.getErrorMessage)(error)}；源快照已保留在 ${source}`);
    }
    const sourceStat = await fs.lstat(source);
    if (sourceStat.isSymbolicLink() || !sourceStat.isFile()) {
        throw new Error(`${label}源快照不是普通文件: ${source}`);
    }
    const sourceIdentity = fileIdentity(sourceStat);
    if (expectedSourceIdentity && !sameFileIdentity(sourceStat, expectedSourceIdentity)) {
        throw new Error(`${label}源快照已被替换: ${source}`);
    }
    const sourceSha256 = await verifiedFileSha256(source, sourceIdentity, label);
    const trustedSourceSha256 = expectedSourceSha256 ?? sourceSha256;
    if (sourceSha256 !== trustedSourceSha256) {
        throw new Error(`${label}源快照哈希不匹配: ${source}`);
    }
    await linkFileNoClobber(source, target);
    try {
        await assertHardLinkIdentity(target, sourceIdentity, label);
        await verifyParent();
        await assertHardLinkIdentity(target, sourceIdentity, label);
        const currentSourceSha256 = await verifiedFileSha256(source, sourceIdentity, label);
        if (currentSourceSha256 !== trustedSourceSha256) {
            throw new Error(`${label}源快照在验证期间被修改: ${source}`);
        }
    }
    catch (error) {
        let cleanupError;
        try {
            await unlinkInstalledHardLinkIfOwned(target, sourceIdentity);
        }
        catch (installedLinkCleanupError) {
            cleanupError = installedLinkCleanupError;
        }
        throw new Error(`${label}未通过安装后验证：${(0, command_error_1.getErrorMessage)(error)}；源快照已保留在 ${source}` +
            (cleanupError ? `；无法安全移除未确认链接：${(0, command_error_1.getErrorMessage)(cleanupError)}` : ''));
    }
    await fs.unlink(source);
}
async function verifiedFileSha256(target, expectedIdentity, label) {
    const before = await fs.lstat(target);
    if (before.isSymbolicLink() ||
        !before.isFile() ||
        !sameFileIdentity(before, expectedIdentity)) {
        throw new Error(`${label}文件身份不可信: ${target}`);
    }
    const content = await fs.readFile(target);
    const after = await fs.lstat(target);
    if (after.isSymbolicLink() ||
        !after.isFile() ||
        !sameFileIdentity(after, expectedIdentity)) {
        throw new Error(`${label}文件在读取期间被替换: ${target}`);
    }
    return sha256(content);
}
async function unlinkVerifiedFile(target, expectedIdentity, expectedSha256, label) {
    const stat = await fs.lstat(target);
    if (stat.isSymbolicLink() || !stat.isFile()) {
        throw new Error(`${label}目标不是普通文件: ${target}`);
    }
    const identity = fileIdentity(stat);
    if (expectedIdentity && !sameFileIdentity(stat, expectedIdentity)) {
        throw new Error(`${label}目标已被替换: ${target}`);
    }
    if (await verifiedFileSha256(target, identity, label) !== expectedSha256) {
        throw new Error(`${label}目标哈希不匹配: ${target}`);
    }
    await fs.unlink(target);
}
async function assertHardLinkIdentity(target, sourceIdentity, label) {
    const targetStat = await fs.lstat(target);
    if (targetStat.isSymbolicLink() ||
        !targetStat.isFile() ||
        !sameFileIdentity(targetStat, sourceIdentity)) {
        throw new Error(`${label}目标未链接到可信源快照: ${target}`);
    }
}
async function unlinkInstalledHardLinkIfOwned(target, sourceIdentity) {
    let stat;
    try {
        stat = await fs.lstat(target);
    }
    catch (error) {
        if (error.code === 'ENOENT') {
            return;
        }
        throw error;
    }
    if (stat.isSymbolicLink() ||
        !stat.isFile() ||
        !sameFileIdentity(stat, sourceIdentity)) {
        throw new Error(`未确认链接已被替换，拒绝移除: ${target}`);
    }
    await fs.unlink(target);
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
async function findInitiallyMissingDirectories(root, transactionRoot, mutations) {
    const starts = [
        path.dirname(transactionRoot),
        ...mutations.map((mutation) => path.dirname(mutation.target)),
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
