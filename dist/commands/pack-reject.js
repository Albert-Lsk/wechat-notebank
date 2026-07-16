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
exports.rejectPackCommand = rejectPackCommand;
const fs = __importStar(require("fs-extra"));
const gray_matter_1 = __importDefault(require("gray-matter"));
const path = __importStar(require("path"));
const command_error_1 = require("../lib/command-error");
const file_transaction_1 = require("../lib/file-transaction");
const pack_state_1 = require("../lib/pack-state");
const pack_render_1 = require("../lib/pack-render");
const storage_1 = require("../lib/storage");
const pack_recovery_1 = require("../lib/pack-recovery");
async function rejectPackCommand(args, transactionHooks = {}) {
    const packFile = path.resolve(args.packFile);
    await (0, pack_recovery_1.recoverPackTransactionsForFile)(packFile);
    const initial = await locatePack(packFile);
    return (0, storage_1.withSourceUrlLock)(initial.vaultRoot, initial.state.manifest.sourceUrl, async () => {
        await (0, pack_recovery_1.recoverPackTransactions)(initial.vaultRoot);
        const current = await locatePack(packFile);
        if (current.state.packId !== initial.state.packId ||
            current.state.revision !== initial.state.revision) {
            throw new command_error_1.CommandError('PACK_ALREADY_EXISTS', '加工包状态在获取锁期间发生变化');
        }
        if (current.state.status === 'rejected') {
            return rejectResult('reuse', current.state, current.stateFile);
        }
        return rejectPackLocked(current, transactionHooks);
    });
}
async function rejectPackLocked(located, transactionHooks) {
    const { state, stateFile, vaultRoot } = located;
    const packContent = await loadVisiblePack(state);
    const now = new Date().toISOString();
    const nextState = {
        ...state,
        status: 'rejected',
        updatedAt: now,
        rejectedAt: now,
    };
    const previousStateContent = (0, pack_state_1.serializePackState)(state);
    const revisionStateFile = path.join(path.dirname(stateFile), 'revisions', `${state.revision}.json`);
    const writes = [
        {
            target: state.packFile,
            content: (0, pack_render_1.rejectPack)(packContent, now),
            expectedContent: packContent,
        },
        {
            target: revisionStateFile,
            content: (0, pack_state_1.serializePackState)(nextState),
            expectedContent: previousStateContent,
        },
        {
            target: stateFile,
            content: (0, pack_state_1.serializePackState)(nextState),
            expectedContent: previousStateContent,
        },
    ];
    try {
        await (0, file_transaction_1.commitFileTransaction)(vaultRoot, writes, transactionHooks);
    }
    catch (error) {
        if (error instanceof file_transaction_1.FileTransactionConflictError) {
            throw new command_error_1.CommandError('PACK_ALREADY_EXISTS', (0, command_error_1.getErrorMessage)(error));
        }
        throw new command_error_1.CommandError('TRANSACTION_FAILED', (0, command_error_1.getErrorMessage)(error));
    }
    return rejectResult('reject', nextState, stateFile);
}
async function loadVisiblePack(state) {
    let content;
    try {
        content = await fs.readFile(state.packFile, 'utf8');
    }
    catch (error) {
        throw new command_error_1.CommandError('PACK_ALREADY_EXISTS', `无法读取可见加工包: ${(0, command_error_1.getErrorMessage)(error)}`);
    }
    try {
        const document = (0, gray_matter_1.default)(content);
        if (document.data.packId !== state.packId ||
            document.data.revision !== state.revision ||
            document.data.sourceFile !== state.manifest.sourceFile ||
            document.data.sourceUrl !== state.manifest.sourceUrl) {
            throw new Error('可见加工包身份字段与隐藏状态不一致');
        }
    }
    catch (error) {
        throw new command_error_1.CommandError('PACK_ALREADY_EXISTS', `可见加工包 Frontmatter 无效: ${(0, command_error_1.getErrorMessage)(error)}`);
    }
    return content;
}
async function locatePack(packFile) {
    try {
        return await (0, pack_state_1.locatePackState)(packFile, ['pending', 'partial', 'rejected']);
    }
    catch (error) {
        throw new command_error_1.CommandError('PACK_ALREADY_EXISTS', (0, command_error_1.getErrorMessage)(error));
    }
}
function rejectResult(action, state, stateFile) {
    return {
        action,
        packId: state.packId,
        revision: state.revision,
        status: 'rejected',
        approvedItems: state.approvedItems,
        publishedFiles: state.outputs.map((output) => output.file),
        packFile: state.packFile,
        stateFile,
    };
}
