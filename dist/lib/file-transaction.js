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
exports.commitFileTransaction = commitFileTransaction;
const fs = __importStar(require("fs-extra"));
const path = __importStar(require("path"));
const crypto_1 = require("crypto");
const command_error_1 = require("./command-error");
async function commitFileTransaction(root, writes, hooks = {}) {
    assertUniqueTargets(writes);
    const transactionRoot = path.join(root, '.alskai-notebank', 'transactions', `${process.pid}-${(0, crypto_1.randomUUID)()}`);
    const initiallyMissingDirectories = await findInitiallyMissingDirectories(root, transactionRoot, writes);
    const entries = [];
    let recoveryCompleted = true;
    try {
        for (const [index, write] of writes.entries()) {
            assertInsideRoot(root, write.target);
            await assertUsableParent(write.target);
            const existed = await fs.pathExists(write.target);
            let original = null;
            if (existed) {
                const stat = await fs.stat(write.target);
                if (!stat.isFile()) {
                    throw new Error(`事务目标不是文件: ${write.target}`);
                }
                original = await fs.readFile(write.target);
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
                commitStarted: false,
            });
        }
        for (const [index, entry] of entries.entries()) {
            await assertTargetUnchanged(entry);
            await hooks.beforeApply?.(index, entry.target);
            await fs.ensureDir(path.dirname(entry.target));
            entry.commitStarted = true;
            if (entry.existed) {
                await fs.ensureDir(path.dirname(entry.backup));
                await fs.move(entry.target, entry.backup);
            }
            await fs.move(entry.staged, entry.target);
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
            await fs.remove(transactionRoot);
            await removeInitiallyMissingEmptyDirectories(initiallyMissingDirectories);
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
async function assertUsableParent(target) {
    let candidate = path.dirname(target);
    while (!(await fs.pathExists(candidate))) {
        const parent = path.dirname(candidate);
        if (parent === candidate) {
            throw new Error(`无法解析事务目标父目录: ${target}`);
        }
        candidate = parent;
    }
    if (!(await fs.stat(candidate)).isDirectory()) {
        throw new Error(`事务目标父路径不是目录: ${candidate}`);
    }
}
async function assertTargetUnchanged(entry) {
    const exists = await fs.pathExists(entry.target);
    if (!entry.existed) {
        if (exists) {
            throw new Error(`事务目标在提交前被创建: ${entry.target}`);
        }
        return;
    }
    if (!exists || !entry.original) {
        throw new Error(`事务目标在提交前消失: ${entry.target}`);
    }
    const current = await fs.readFile(entry.target);
    if (!current.equals(entry.original)) {
        throw new Error(`事务目标在提交前发生变化: ${entry.target}`);
    }
}
async function restoreEntries(entries) {
    for (const entry of [...entries].reverse()) {
        if (!entry.commitStarted) {
            continue;
        }
        await fs.remove(entry.target);
        if (entry.existed && await fs.pathExists(entry.backup)) {
            await fs.ensureDir(path.dirname(entry.target));
            await fs.move(entry.backup, entry.target);
        }
    }
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
