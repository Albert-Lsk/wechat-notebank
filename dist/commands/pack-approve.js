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
exports.approvePackCommand = approvePackCommand;
const fs = __importStar(require("fs-extra"));
const gray_matter_1 = __importDefault(require("gray-matter"));
const path = __importStar(require("path"));
const command_error_1 = require("../lib/command-error");
const file_transaction_1 = require("../lib/file-transaction");
const pack_publication_1 = require("../lib/pack-publication");
const pack_paths_1 = require("../lib/pack-paths");
const pack_state_1 = require("../lib/pack-state");
const pack_render_1 = require("../lib/pack-render");
const shared_materials_1 = require("../lib/shared-materials");
const shared_reflections_1 = require("../lib/shared-reflections");
const storage_1 = require("../lib/storage");
const pack_recovery_1 = require("../lib/pack-recovery");
async function approvePackCommand(args, transactionHooks = {}) {
    const packFile = path.resolve(args.packFile);
    await (0, pack_recovery_1.recoverPackTransactionsForFile)(packFile);
    const initial = await locatePack(packFile);
    return (0, storage_1.withSourceUrlLock)(initial.vaultRoot, initial.state.manifest.sourceUrl, async () => {
        await (0, pack_recovery_1.recoverPackTransactions)(initial.vaultRoot);
        const current = await locatePack(packFile);
        if (current.state.packId !== initial.state.packId) {
            throw new command_error_1.CommandError('PACK_ALREADY_EXISTS', '加工包状态在获取锁期间发生变化');
        }
        return approvePackLocked(current, args.items, transactionHooks);
    });
}
async function approvePackLocked(located, requestedItems, transactionHooks) {
    const { state, stateFile, vaultRoot } = located;
    const candidates = candidateIds(state);
    for (const item of requestedItems) {
        if (!candidates.includes(item)) {
            throw new command_error_1.CommandError('MANIFEST_INVALID', `加工包中不存在可审批候选: ${item}`);
        }
    }
    assertL4ApprovalReady(requestedItems, state);
    const approvedSet = new Set([...state.approvedItems, ...requestedItems]);
    const approvedItems = candidates.filter((item) => approvedSet.has(item));
    if (requestedItems.every((item) => state.approvedItems.includes(item))) {
        return approvalResult('reuse', state, stateFile);
    }
    const sourceFile = state.manifest.sourceFile;
    const { sourceContent, packContent, sourceDocument } = await loadApprovalDocuments(state);
    if (sourceDocument.data.sourceUrl !== state.manifest.sourceUrl) {
        throw new command_error_1.CommandError('MANIFEST_INVALID', '加工包 sourceUrl 与原文不一致');
    }
    const sourceBody = (0, pack_render_1.withoutDerivedRegion)(sourceDocument.content);
    const sourceTitle = typeof sourceDocument.data.title === 'string'
        ? sourceDocument.data.title
        : path.basename(sourceFile, path.extname(sourceFile));
    const sourceWikiPath = (0, pack_paths_1.toWikiPath)(vaultRoot, sourceFile);
    const packWikiPath = (0, pack_paths_1.toWikiPath)(vaultRoot, state.packFile);
    const now = new Date().toISOString();
    const outputs = [...state.outputs];
    const writes = [];
    for (const note of state.manifest.atomicNotes.filter((candidate) => requestedItems.includes(candidate.id) &&
        !state.approvedItems.includes(candidate.id))) {
        const file = (0, pack_paths_1.atomicNoteFilePath)(vaultRoot, sourceFile, state.packId, state.revision, note.id);
        const content = (0, pack_publication_1.renderAtomicNote)(note, state, sourceTitle, sourceWikiPath, packWikiPath, now);
        writes.push({ target: file, content, expectAbsent: true });
        outputs.push({
            kind: 'L2',
            itemIds: [note.id],
            file,
            sha256: (0, pack_publication_1.sha256Content)(content),
            publishedAt: now,
            updatedAt: now,
        });
    }
    if (addsNewL3(requestedItems, state)) {
        await appendL3Write({
            state,
            vaultRoot,
            sourceTitle,
            sourceWikiPath,
            sourceBody,
            approvedSet,
            outputs,
            writes,
            now,
        });
    }
    if (addsNewL4(requestedItems, state)) {
        const plan = await (0, shared_reflections_1.planSharedReflectionPublication)({
            state,
            vaultRoot,
            sourceTitle,
            sourceWikiPath,
            now,
        });
        writes.push(...plan.writes);
        outputs.push(plan.output);
    }
    sortOutputs(outputs, candidates);
    const status = candidates.every((item) => approvedSet.has(item))
        ? 'approved'
        : 'partial';
    const publicationLinks = (0, pack_publication_1.renderPublicationLinks)(vaultRoot, outputs, state);
    let sourceWithLinks = sourceContent;
    for (const link of publicationLinks) {
        sourceWithLinks = (0, pack_render_1.upsertDerivedLink)(sourceWithLinks, link.source);
    }
    const nextPackContent = (0, pack_render_1.updatePackPublication)(packContent, status, approvedItems, publicationLinks.map((link) => link.pack), now);
    const nextState = {
        ...state,
        status,
        updatedAt: now,
        approvedItems,
        outputs,
    };
    const revisionStateFile = path.join(path.dirname(stateFile), 'revisions', `${state.revision}.json`);
    const previousStateContent = (0, pack_state_1.serializePackState)(state);
    writes.push({
        target: state.packFile,
        content: nextPackContent,
        expectedContent: packContent,
    });
    writes.push({
        target: sourceFile,
        content: sourceWithLinks,
        expectedContent: sourceContent,
    });
    writes.push({
        target: revisionStateFile,
        content: (0, pack_state_1.serializePackState)(nextState),
        expectedContent: previousStateContent,
    });
    writes.push({
        target: stateFile,
        content: (0, pack_state_1.serializePackState)(nextState),
        expectedContent: previousStateContent,
    });
    await commitApproval(vaultRoot, writes, transactionHooks, new Set(outputs.filter((output) => output.kind !== 'L2').map((output) => output.file)));
    return approvalResult('publish', nextState, stateFile);
}
async function loadApprovalDocuments(state) {
    let sourceContent;
    try {
        sourceContent = await fs.readFile(state.manifest.sourceFile, 'utf8');
    }
    catch (error) {
        throw new command_error_1.CommandError('MANIFEST_INVALID', `无法读取加工包原文: ${(0, command_error_1.getErrorMessage)(error)}`);
    }
    let packContent;
    try {
        packContent = await fs.readFile(state.packFile, 'utf8');
    }
    catch (error) {
        throw new command_error_1.CommandError('PACK_ALREADY_EXISTS', `无法读取可见加工包: ${(0, command_error_1.getErrorMessage)(error)}`);
    }
    let sourceDocument;
    try {
        sourceDocument = (0, gray_matter_1.default)(sourceContent);
    }
    catch (error) {
        throw new command_error_1.CommandError('MANIFEST_INVALID', `原文 Frontmatter 无效: ${(0, command_error_1.getErrorMessage)(error)}`);
    }
    try {
        const packDocument = (0, gray_matter_1.default)(packContent);
        if (packDocument.data.packId !== state.packId ||
            packDocument.data.revision !== state.revision ||
            packDocument.data.sourceFile !== state.manifest.sourceFile ||
            packDocument.data.sourceUrl !== state.manifest.sourceUrl) {
            throw new Error('可见加工包身份字段与隐藏状态不一致');
        }
    }
    catch (error) {
        throw new command_error_1.CommandError('PACK_ALREADY_EXISTS', `可见加工包 Frontmatter 无效: ${(0, command_error_1.getErrorMessage)(error)}`);
    }
    return { sourceContent, packContent, sourceDocument };
}
async function appendL3Write(input) {
    const plan = await (0, shared_materials_1.planSharedMaterialsPublication)({
        vaultRoot: input.vaultRoot,
        state: input.state,
        sourceTitle: input.sourceTitle,
        sourceWikiPath: input.sourceWikiPath,
        sourceBody: input.sourceBody,
        approvedItems: input.approvedSet,
        now: input.now,
    });
    const existingIndex = input.outputs.findIndex((output) => output.kind === 'L3');
    input.writes.push(...plan.writes);
    if (existingIndex >= 0) {
        input.outputs[existingIndex] = plan.output;
    }
    else {
        input.outputs.push(plan.output);
    }
}
async function locatePack(packFile) {
    try {
        return await (0, pack_state_1.locatePackState)(packFile);
    }
    catch (error) {
        throw new command_error_1.CommandError('PACK_ALREADY_EXISTS', (0, command_error_1.getErrorMessage)(error));
    }
}
async function commitApproval(vaultRoot, writes, hooks, protectedDerivedFiles) {
    try {
        await (0, file_transaction_1.commitFileTransaction)(vaultRoot, writes, hooks);
    }
    catch (error) {
        if (error instanceof file_transaction_1.FileTransactionPreconditionError &&
            protectedDerivedFiles.has(path.resolve(error.target))) {
            throw new command_error_1.CommandError('DERIVED_FILE_MODIFIED', `已发布文件被人工修改，拒绝覆盖: ${error.target}`);
        }
        if (error instanceof file_transaction_1.FileTransactionConflictError) {
            throw new command_error_1.CommandError('PACK_ALREADY_EXISTS', (0, command_error_1.getErrorMessage)(error));
        }
        throw new command_error_1.CommandError('TRANSACTION_FAILED', (0, command_error_1.getErrorMessage)(error));
    }
}
function candidateIds(state) {
    return [
        ...state.manifest.atomicNotes.map((item) => item.id),
        ...state.manifest.materials.map((item) => item.id),
        ...state.manifest.reviewQuestions.map((item) => item.id),
    ];
}
function addsNewL3(requestedItems, state) {
    return requestedItems.some((item) => item.startsWith('L3-') && !state.approvedItems.includes(item));
}
function addsNewL4(requestedItems, state) {
    return requestedItems.some((item) => item.startsWith('L4-Q') && !state.approvedItems.includes(item));
}
function assertL4ApprovalReady(requestedItems, state) {
    const requestedL4 = requestedItems.filter((item) => item.startsWith('L4-Q'));
    if (requestedL4.length === 0) {
        return;
    }
    const questionIds = state.manifest.reviewQuestions.map((question) => question.id);
    if (questionIds.some((questionId) => !state.approvedItems.includes(questionId) && !requestedL4.includes(questionId))) {
        throw new command_error_1.CommandError('MANIFEST_INVALID', 'L4 必须一次审批当前加工包的全部复盘问题');
    }
    const answers = state.manifest.reviewAnswers;
    if (!answers ||
        questionIds.some((questionId) => answers[questionId] === undefined) ||
        !state.manifest.reviewDraft) {
        throw new command_error_1.CommandError('MANIFEST_INVALID', 'L4 发布需要所有问题的用户原始回答与 Agent 整理稿');
    }
}
function sortOutputs(outputs, candidates) {
    const order = new Map(candidates.map((item, index) => [item, index]));
    outputs.sort((left, right) => {
        const leftIndex = Math.min(...left.itemIds.map((item) => order.get(item) ?? Infinity));
        const rightIndex = Math.min(...right.itemIds.map((item) => order.get(item) ?? Infinity));
        return leftIndex - rightIndex;
    });
}
function approvalResult(action, state, stateFile) {
    return {
        action,
        packId: state.packId,
        revision: state.revision,
        status: state.status === 'approved' ? 'approved' : 'partial',
        approvedItems: state.approvedItems,
        publishedFiles: state.outputs.map((output) => output.file),
        packFile: state.packFile,
        stateFile,
    };
}
