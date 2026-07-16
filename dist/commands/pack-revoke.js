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
exports.revokePackCommand = revokePackCommand;
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
async function revokePackCommand(args, transactionHooks = {}) {
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
        return revokePackLocked(current, args.items, transactionHooks);
    });
}
async function revokePackLocked(located, requestedItems, transactionHooks) {
    const { state, stateFile, vaultRoot } = located;
    const candidates = candidateIds(state);
    for (const item of requestedItems) {
        if (!candidates.includes(item)) {
            throw new command_error_1.CommandError('MANIFEST_INVALID', `加工包中不存在可撤销候选: ${item}`);
        }
        if (!state.approvedItems.includes(item) && !state.revokedItems.includes(item)) {
            throw new command_error_1.CommandError('MANIFEST_INVALID', `候选从未发布，不能撤销: ${item}`);
        }
    }
    const activeItems = requestedItems.filter((item) => state.approvedItems.includes(item));
    if (activeItems.length === 0) {
        return revokeResult('reuse', state, stateFile, []);
    }
    const { sourceContent, packContent } = await loadDocuments(state);
    await assertManagedLinksCurrent(vaultRoot, state, sourceContent, packContent);
    assertL4RetractionIsComplete(activeItems, state);
    const removedL2Outputs = state.outputs.filter((output) => output.kind === 'L2' && activeItems.includes(output.itemIds[0]));
    const mutations = [];
    const protectedFiles = new Set();
    const removedFiles = new Set(removedL2Outputs.map((output) => output.file));
    for (const output of removedL2Outputs) {
        const content = await loadGeneratedFile(output);
        protectedFiles.add(path.resolve(output.file));
        mutations.push({ target: output.file, delete: true, expectedContent: content });
    }
    const activeSet = new Set(activeItems);
    const approvedItems = state.approvedItems.filter((item) => !activeSet.has(item));
    const revokedSet = new Set([...state.revokedItems, ...activeItems]);
    const revokedItems = candidates.filter((item) => revokedSet.has(item));
    const outputs = state.outputs.filter((output) => output.kind !== 'L2' ||
        !output.itemIds.some((item) => activeSet.has(item)));
    const now = new Date().toISOString();
    const sourceDocument = (0, gray_matter_1.default)(sourceContent);
    const sourceTitle = typeof sourceDocument.data.title === 'string'
        ? sourceDocument.data.title
        : path.basename(state.manifest.sourceFile, path.extname(state.manifest.sourceFile));
    const sourceWikiPath = (0, pack_paths_1.toWikiPath)(vaultRoot, state.manifest.sourceFile);
    const sourceBody = (0, pack_render_1.withoutDerivedRegion)(sourceDocument.content);
    const l3OutputIndex = outputs.findIndex((output) => output.kind === 'L3');
    if (activeItems.some((item) => item.startsWith('L3-'))) {
        if (l3OutputIndex < 0) {
            throw new command_error_1.CommandError('MANIFEST_INVALID', '加工包缺少待撤销的 L3 输出');
        }
        const l3Output = outputs[l3OutputIndex];
        const remainingItems = new Set(l3Output.itemIds.filter((item) => !activeSet.has(item)));
        const plan = await (0, shared_materials_1.planSharedMaterialsRetraction)({
            vaultRoot,
            state,
            sourceTitle,
            sourceWikiPath,
            sourceBody,
            remainingItems,
            now,
        });
        mutations.push(...plan.mutations);
        protectedFiles.add(path.resolve(l3Output.file));
        if (plan.sharedFileRemoved) {
            removedFiles.add(l3Output.file);
        }
        if (plan.output) {
            outputs[l3OutputIndex] = plan.output;
        }
        else {
            outputs.splice(l3OutputIndex, 1);
        }
    }
    const l4OutputIndex = outputs.findIndex((output) => output.kind === 'L4');
    if (activeItems.some((item) => item.startsWith('L4-Q'))) {
        if (l4OutputIndex < 0) {
            throw new command_error_1.CommandError('MANIFEST_INVALID', '加工包缺少待撤销的 L4 输出');
        }
        const l4Output = outputs[l4OutputIndex];
        const plan = await (0, shared_reflections_1.planSharedReflectionRetraction)({
            vaultRoot,
            state,
            sourceTitle,
            sourceWikiPath,
            now,
        });
        mutations.push(...plan.mutations);
        protectedFiles.add(path.resolve(l4Output.file));
        if (plan.sharedFileRemoved) {
            removedFiles.add(l4Output.file);
        }
        outputs.splice(l4OutputIndex, 1);
    }
    assertOutputsCoverApprovedItems(outputs, approvedItems);
    const nextState = {
        ...state,
        status: 'revoked',
        approvedItems,
        revokedItems,
        outputs,
        revokedAt: state.revokedAt || now,
        updatedAt: now,
    };
    const remainingLinks = (0, pack_publication_1.renderPublicationLinks)(vaultRoot, outputs, nextState);
    let nextSourceContent = sourceContent;
    const removedSourceOutputs = state.outputs.filter((oldOutput) => {
        if (oldOutput.kind === 'L2') {
            return activeSet.has(oldOutput.itemIds[0]);
        }
        return removedFiles.has(oldOutput.file);
    });
    for (const link of (0, pack_publication_1.renderPublicationLinks)(vaultRoot, removedSourceOutputs, state)) {
        nextSourceContent = (0, pack_render_1.removeDerivedLink)(nextSourceContent, link.source);
    }
    const nextPackContent = (0, pack_render_1.revokePackPublication)(packContent, approvedItems, revokedItems, remainingLinks.map((link) => link.pack), nextState.revokedAt, now);
    const previousStateContent = (0, pack_state_1.serializePackState)(state);
    const nextStateContent = (0, pack_state_1.serializePackState)(nextState);
    const isCurrentRevision = path.basename(stateFile) === 'state.json';
    const revisionStateFile = isCurrentRevision
        ? path.join(path.dirname(stateFile), 'revisions', `${state.revision}.json`)
        : stateFile;
    mutations.push({
        target: state.manifest.sourceFile,
        content: nextSourceContent,
        expectedContent: sourceContent,
    }, {
        target: state.packFile,
        content: nextPackContent,
        expectedContent: packContent,
    }, {
        target: revisionStateFile,
        content: nextStateContent,
        expectedContent: previousStateContent,
    });
    if (isCurrentRevision) {
        mutations.push({
            target: stateFile,
            content: nextStateContent,
            expectedContent: previousStateContent,
        });
    }
    await commitRevoke(vaultRoot, mutations, transactionHooks, protectedFiles);
    return revokeResult('revoke', nextState, stateFile, [...removedFiles]);
}
async function loadDocuments(state) {
    let sourceContent;
    let packContent;
    try {
        [sourceContent, packContent] = await Promise.all([
            fs.readFile(state.manifest.sourceFile, 'utf8'),
            fs.readFile(state.packFile, 'utf8'),
        ]);
    }
    catch (error) {
        throw new command_error_1.CommandError('PACK_ALREADY_EXISTS', (0, command_error_1.getErrorMessage)(error));
    }
    try {
        const sourceDocument = (0, gray_matter_1.default)(sourceContent);
        const packDocument = (0, gray_matter_1.default)(packContent);
        if (sourceDocument.data.sourceUrl !== state.manifest.sourceUrl) {
            throw new Error('加工包 sourceUrl 与原文不一致');
        }
        if (packDocument.data.packId !== state.packId ||
            packDocument.data.revision !== state.revision ||
            packDocument.data.sourceFile !== state.manifest.sourceFile ||
            packDocument.data.sourceUrl !== state.manifest.sourceUrl) {
            throw new Error('可见加工包身份字段与隐藏状态不一致');
        }
    }
    catch (error) {
        throw new command_error_1.CommandError('PACK_ALREADY_EXISTS', (0, command_error_1.getErrorMessage)(error));
    }
    return { sourceContent, packContent };
}
async function loadGeneratedFile(output) {
    try {
        const stat = await fs.lstat(output.file);
        if (stat.isSymbolicLink() || !stat.isFile()) {
            throw new Error('生成文件不是普通文件');
        }
        const content = await fs.readFile(output.file, 'utf8');
        if ((0, pack_publication_1.sha256Content)(content) !== output.sha256) {
            throw new Error('生成文件哈希与发布记录不一致');
        }
        return content;
    }
    catch (error) {
        throw new command_error_1.CommandError('DERIVED_FILE_MODIFIED', `已发布文件缺失或被人工修改，拒绝删除: ${output.file}（${(0, command_error_1.getErrorMessage)(error)}）`);
    }
}
async function locatePack(packFile) {
    try {
        return await (0, pack_state_1.locatePackState)(packFile, [
            'partial',
            'approved',
            'rejected',
            'revoked',
            'superseded',
        ], true);
    }
    catch (error) {
        throw new command_error_1.CommandError('PACK_ALREADY_EXISTS', (0, command_error_1.getErrorMessage)(error));
    }
}
async function commitRevoke(vaultRoot, mutations, hooks, protectedFiles) {
    try {
        await (0, file_transaction_1.commitFileTransaction)(vaultRoot, mutations, hooks);
    }
    catch (error) {
        if (error instanceof file_transaction_1.FileTransactionPreconditionError &&
            protectedFiles.has(path.resolve(error.target))) {
            throw new command_error_1.CommandError('DERIVED_FILE_MODIFIED', `已发布文件被人工修改，拒绝删除: ${error.target}`);
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
function assertL4RetractionIsComplete(activeItems, state) {
    const selected = activeItems.filter((item) => item.startsWith('L4-Q'));
    if (selected.length === 0) {
        return;
    }
    const output = state.outputs.find((candidate) => candidate.kind === 'L4');
    if (!output ||
        output.itemIds.some((item) => !selected.includes(item)) ||
        selected.some((item) => !output.itemIds.includes(item))) {
        throw new command_error_1.CommandError('MANIFEST_INVALID', 'L4 必须一次撤销当前加工包的全部复盘问题');
    }
}
function assertOutputsCoverApprovedItems(outputs, approvedItems) {
    const outputItems = outputs.flatMap((output) => output.itemIds);
    if (outputItems.length !== approvedItems.length ||
        approvedItems.some((item) => !outputItems.includes(item))) {
        throw new command_error_1.CommandError('MANIFEST_INVALID', '加工包输出与待撤销候选不一致');
    }
}
async function assertManagedLinksCurrent(vaultRoot, state, sourceContent, packContent) {
    try {
        const storedStates = await (0, pack_state_1.listSourcePackStates)(vaultRoot, state.manifest.sourceFile, state.manifest.sourceUrl);
        const expectedSourceLinks = new Set();
        for (const stored of storedStates) {
            const storedState = stored.state;
            expectedSourceLinks.add(`- 待审核加工包：[[${(0, pack_paths_1.toWikiPath)(vaultRoot, storedState.packFile)}` +
                `|待审核加工包 r${storedState.revision}]]`);
            for (const link of (0, pack_publication_1.renderPublicationLinks)(vaultRoot, storedState.outputs, storedState)) {
                expectedSourceLinks.add(link.source);
            }
        }
        if (!(0, pack_render_1.derivedRegionMatches)(sourceContent, [...expectedSourceLinks])) {
            throw new Error('原文衍生内容受控区域与隐藏状态不一致');
        }
        const packLinks = (0, pack_publication_1.renderPublicationLinks)(vaultRoot, state.outputs, state)
            .map((link) => link.pack);
        if (!(0, pack_render_1.publishedRegionMatches)(packContent, packLinks)) {
            throw new Error('加工包已发布内容受控区域与隐藏状态不一致');
        }
    }
    catch (error) {
        throw new command_error_1.CommandError('PACK_ALREADY_EXISTS', `受控双链存在人工漂移，请先运行 doctor: ${(0, command_error_1.getErrorMessage)(error)}`);
    }
}
function revokeResult(action, state, stateFile, removedFiles) {
    return {
        action,
        packId: state.packId,
        revision: state.revision,
        status: 'revoked',
        approvedItems: state.approvedItems,
        revokedItems: state.revokedItems,
        removedFiles,
        publishedFiles: state.outputs.map((output) => output.file),
        packFile: state.packFile,
        stateFile,
    };
}
