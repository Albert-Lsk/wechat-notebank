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
exports.updatePackCommand = updatePackCommand;
const fs = __importStar(require("fs-extra"));
const gray_matter_1 = __importDefault(require("gray-matter"));
const path = __importStar(require("path"));
const command_error_1 = require("../lib/command-error");
const file_transaction_1 = require("../lib/file-transaction");
const pack_manifest_1 = require("../lib/pack-manifest");
const pack_state_1 = require("../lib/pack-state");
const pack_render_1 = require("../lib/pack-render");
const storage_1 = require("../lib/storage");
async function updatePackCommand(args, transactionHooks = {}) {
    const packFile = path.resolve(args.packFile);
    const initial = await locatePack(packFile);
    return (0, storage_1.withSourceUrlLock)(initial.vaultRoot, initial.state.manifest.sourceUrl, async () => {
        const current = await locatePack(packFile);
        if (current.state.packId !== initial.state.packId) {
            throw new command_error_1.CommandError('PACK_ALREADY_EXISTS', '加工包状态在获取锁期间发生变化');
        }
        return updatePackLocked(current, path.resolve(args.manifestFile), transactionHooks);
    });
}
async function updatePackLocked(located, manifestFile, transactionHooks) {
    const { state, stateFile, vaultRoot } = located;
    const manifest = await loadUpdatedManifest(manifestFile, state);
    assertReviewAnswersPreserved(state.manifest, manifest);
    const packContent = await loadVisiblePack(state);
    if ((0, pack_manifest_1.canonicalJson)(state.manifest) === (0, pack_manifest_1.canonicalJson)(manifest)) {
        return updateResult('reuse', state, stateFile);
    }
    if (state.outputs.some((output) => output.kind === 'L4')) {
        throw new command_error_1.CommandError('MANIFEST_INVALID', '已发布 L4 的回答或整理稿不可直接更新，请创建新 revision');
    }
    const now = new Date().toISOString();
    const nextState = {
        ...state,
        updatedAt: now,
        manifest,
    };
    const previousStateContent = (0, pack_state_1.serializePackState)(state);
    const revisionStateFile = path.join(path.dirname(stateFile), 'revisions', `${state.revision}.json`);
    const writes = [
        {
            target: state.packFile,
            content: (0, pack_render_1.updatePackReview)(packContent, manifest, now),
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
    return updateResult('update', nextState, stateFile);
}
async function loadUpdatedManifest(manifestFile, state) {
    let value;
    try {
        value = await fs.readJson(manifestFile);
    }
    catch (error) {
        throw new command_error_1.CommandError('MANIFEST_INVALID', (0, command_error_1.getErrorMessage)(error));
    }
    const manifest = (0, pack_manifest_1.validatePackManifest)(value, state.manifest.sourceFile);
    if ((0, pack_manifest_1.canonicalJson)((0, pack_manifest_1.initialManifestOf)(manifest)) !==
        (0, pack_manifest_1.canonicalJson)((0, pack_manifest_1.initialManifestOf)(state.manifest))) {
        throw new command_error_1.CommandError('MANIFEST_INVALID', '更新加工包时只能追加用户回答或调整 Agent 整理稿');
    }
    return manifest;
}
function assertReviewAnswersPreserved(current, next) {
    for (const [questionId, answer] of Object.entries(current.reviewAnswers || {})) {
        if (next.reviewAnswers?.[questionId] !== answer) {
            throw new command_error_1.CommandError('MANIFEST_INVALID', `用户原始回答不可删除或改写: ${questionId}`);
        }
    }
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
        return await (0, pack_state_1.locatePackState)(packFile);
    }
    catch (error) {
        throw new command_error_1.CommandError('PACK_ALREADY_EXISTS', (0, command_error_1.getErrorMessage)(error));
    }
}
function updateResult(action, state, stateFile) {
    return {
        action,
        packId: state.packId,
        revision: state.revision,
        status: state.status === 'approved'
            ? 'approved'
            : state.status === 'partial'
                ? 'partial'
                : 'pending',
        answeredQuestionIds: state.manifest.reviewQuestions
            .map((question) => question.id)
            .filter((questionId) => state.manifest.reviewAnswers?.[questionId] !== undefined),
        hasReviewDraft: state.manifest.reviewDraft !== undefined,
        packFile: state.packFile,
        stateFile,
    };
}
