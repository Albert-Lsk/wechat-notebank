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
exports.validatePackState = validatePackState;
exports.locatePackState = locatePackState;
exports.serializePackState = serializePackState;
exports.listSourcePackStates = listSourcePackStates;
exports.packStateKey = packStateKey;
const fs = __importStar(require("fs-extra"));
const path = __importStar(require("path"));
const pack_manifest_1 = require("./pack-manifest");
const pack_paths_1 = require("./pack-paths");
function validatePackState(value, options) {
    const state = requireRecord(value, '加工包状态');
    const manifestValue = requireRecord(state.manifest, '加工包 Manifest');
    if (typeof manifestValue.sourceFile !== 'string' || !manifestValue.sourceFile) {
        throw new Error('加工包 Manifest sourceFile 无效');
    }
    const sourceFile = path.resolve(manifestValue.sourceFile);
    assertInsideVault(options.vaultRoot, sourceFile, '加工包原文');
    if (options.expectedSourceFile &&
        sourceFile !== path.resolve(options.expectedSourceFile)) {
        throw new Error('加工包原文路径与当前操作不一致');
    }
    const manifest = (0, pack_manifest_1.validateInitialManifest)(state.manifest, sourceFile);
    const expectedPackId = (0, pack_manifest_1.computePackId)(manifest.sourceUrl, manifest.processingGoal);
    if (typeof state.packId !== 'string' ||
        !/^[a-f0-9]{64}$/.test(state.packId) ||
        state.packId !== expectedPackId ||
        (options.expectedPackId && state.packId !== options.expectedPackId)) {
        throw new Error('加工包状态的 packId 无效');
    }
    if (!Number.isInteger(state.revision) || Number(state.revision) < 1) {
        throw new Error('加工包状态的 revision 无效');
    }
    const revision = Number(state.revision);
    if (!isPackStatus(state.status)) {
        throw new Error('加工包状态值无效');
    }
    if (options.allowedStatuses && !options.allowedStatuses.includes(state.status)) {
        throw new Error(`加工包当前状态不可执行此操作: ${state.status}`);
    }
    if (typeof state.packFile !== 'string' || !state.packFile) {
        throw new Error('加工包状态的 packFile 无效');
    }
    const packFile = path.resolve(state.packFile);
    const derivedPackFile = (0, pack_paths_1.packFilePath)(options.vaultRoot, sourceFile, state.packId, revision);
    if (packFile !== derivedPackFile ||
        (options.expectedPackFile && packFile !== path.resolve(options.expectedPackFile))) {
        throw new Error('加工包状态的 packFile 与 packId/revision 不匹配');
    }
    if (typeof state.createdAt !== 'string' || !state.createdAt) {
        throw new Error('加工包状态的 createdAt 无效');
    }
    const candidateIds = [
        ...manifest.atomicNotes.map((item) => item.id),
        ...manifest.materials.map((item) => item.id),
    ];
    const approvedItems = validateApprovedItems(state.approvedItems, candidateIds);
    const outputs = validateOutputs(state.outputs, options.vaultRoot, sourceFile, manifest.sourceUrl, state.packId, revision, approvedItems);
    if (state.status === 'pending' && (approvedItems.length > 0 || outputs.length > 0)) {
        throw new Error('pending 加工包不能包含已发布内容');
    }
    const allL2L3Approved = candidateIds.every((item) => approvedItems.includes(item));
    if (state.status === 'approved' && !allL2L3Approved) {
        throw new Error('approved 加工包仍有未审批的 L2/L3 候选');
    }
    if (state.status === 'partial' &&
        allL2L3Approved &&
        manifest.reviewQuestions.length === 0) {
        throw new Error('没有待处理候选的加工包不能保持 partial');
    }
    return {
        packId: state.packId,
        revision,
        status: state.status,
        packFile,
        createdAt: state.createdAt,
        ...(typeof state.updatedAt === 'string' ? { updatedAt: state.updatedAt } : {}),
        ...(typeof state.supersededAt === 'string'
            ? { supersededAt: state.supersededAt }
            : {}),
        manifest,
        approvedItems,
        outputs,
    };
}
async function locatePackState(packFileInput) {
    const packFile = path.resolve(packFileInput);
    const inbox = path.dirname(packFile);
    if (path.basename(inbox) !== 'Inbox') {
        throw new Error('待审核加工包必须位于知识库 Inbox');
    }
    const packStat = await fs.lstat(packFile);
    if (packStat.isSymbolicLink() || !packStat.isFile()) {
        throw new Error('待审核加工包必须是普通文件');
    }
    const vaultRoot = path.dirname(inbox);
    const packsRoot = path.join(vaultRoot, '.alskai-notebank', 'packs');
    const entries = await fs.readdir(packsRoot);
    for (const entry of entries.sort()) {
        const packDirectory = path.join(packsRoot, entry);
        const directoryStat = await fs.lstat(packDirectory);
        if (directoryStat.isSymbolicLink() || !directoryStat.isDirectory()) {
            continue;
        }
        const stateFile = path.join(packDirectory, 'state.json');
        if (!(await fs.pathExists(stateFile))) {
            continue;
        }
        const stateStat = await fs.lstat(stateFile);
        if (stateStat.isSymbolicLink() || !stateStat.isFile()) {
            continue;
        }
        let raw;
        try {
            const value = await fs.readJson(stateFile);
            if (!value || typeof value !== 'object' || Array.isArray(value)) {
                continue;
            }
            raw = value;
        }
        catch {
            continue;
        }
        if (path.resolve(String(raw.packFile || '')) !== packFile) {
            continue;
        }
        return {
            vaultRoot,
            stateFile,
            state: validatePackState(raw, {
                vaultRoot,
                expectedPackId: entry,
                expectedPackFile: packFile,
                allowedStatuses: ['pending', 'partial', 'approved'],
            }),
        };
    }
    throw new Error('找不到加工包的隐藏状态');
}
function serializePackState(value) {
    const normalized = {
        packId: value.packId,
        revision: value.revision,
        status: value.status,
        packFile: value.packFile,
        createdAt: value.createdAt,
        ...(value.updatedAt ? { updatedAt: value.updatedAt } : {}),
        ...(value.supersededAt ? { supersededAt: value.supersededAt } : {}),
        manifest: value.manifest,
        approvedItems: value.approvedItems,
        outputs: value.outputs,
    };
    return `${JSON.stringify(normalized, null, 2)}\n`;
}
async function listSourcePackStates(vaultRootInput, sourceFileInput, sourceUrl) {
    const vaultRoot = path.resolve(vaultRootInput);
    const sourceFile = path.resolve(sourceFileInput);
    const packsRoot = path.join(vaultRoot, '.alskai-notebank', 'packs');
    if (!(await fs.pathExists(packsRoot))) {
        return [];
    }
    const groups = new Map();
    for (const entry of (await fs.readdir(packsRoot)).sort()) {
        const packDirectory = path.join(packsRoot, entry);
        const directoryStat = await fs.lstat(packDirectory);
        if (directoryStat.isSymbolicLink() || !directoryStat.isDirectory()) {
            continue;
        }
        const stateFiles = await packStateFiles(packDirectory);
        for (const stateFile of stateFiles) {
            let raw;
            try {
                const value = await fs.readJson(stateFile);
                if (!value || typeof value !== 'object' || Array.isArray(value)) {
                    continue;
                }
                raw = value;
            }
            catch {
                continue;
            }
            const rawManifest = raw.manifest;
            if (!rawManifest ||
                typeof rawManifest !== 'object' ||
                Array.isArray(rawManifest) ||
                path.resolve(String(rawManifest.sourceFile || '')) !==
                    sourceFile) {
                continue;
            }
            if (rawManifest.sourceUrl !== sourceUrl) {
                throw new Error(`同一原文路径存在不同 sourceUrl 的加工包状态: ${stateFile}`);
            }
            const state = validatePackState(raw, {
                vaultRoot,
                expectedPackId: entry,
                expectedSourceFile: sourceFile,
            });
            const key = packStateKey(state);
            const existing = groups.get(key);
            if (existing) {
                if (serializePackState(existing.state) !== serializePackState(state)) {
                    throw new Error(`加工包当前状态与 revision 快照不一致: ${state.packId} r${state.revision}`);
                }
                existing.stateFiles.push(stateFile);
            }
            else {
                groups.set(key, { state, stateFiles: [stateFile] });
            }
        }
    }
    return [...groups.values()]
        .map((stored) => ({ ...stored, stateFiles: stored.stateFiles.sort() }))
        .sort((left, right) => packStateKey(left.state).localeCompare(packStateKey(right.state)));
}
function packStateKey(state) {
    return `${state.packId}:${state.revision}`;
}
async function packStateFiles(packDirectory) {
    const candidates = [path.join(packDirectory, 'state.json')];
    const revisionsDirectory = path.join(packDirectory, 'revisions');
    if (await fs.pathExists(revisionsDirectory)) {
        const revisionsStat = await fs.lstat(revisionsDirectory);
        if (!revisionsStat.isSymbolicLink() && revisionsStat.isDirectory()) {
            for (const entry of (await fs.readdir(revisionsDirectory)).sort()) {
                if (/^\d+\.json$/.test(entry)) {
                    candidates.push(path.join(revisionsDirectory, entry));
                }
            }
        }
    }
    const stateFiles = [];
    for (const candidate of candidates) {
        if (!(await fs.pathExists(candidate))) {
            continue;
        }
        const stat = await fs.lstat(candidate);
        if (!stat.isSymbolicLink() && stat.isFile()) {
            stateFiles.push(candidate);
        }
    }
    return stateFiles;
}
function validateApprovedItems(value, candidateIds) {
    if (value === undefined) {
        return [];
    }
    if (!Array.isArray(value) || value.some((item) => typeof item !== 'string')) {
        throw new Error('加工包 approvedItems 无效');
    }
    const selected = new Set(value);
    const normalized = candidateIds.filter((item) => selected.has(item));
    if (selected.size !== value.length || normalized.length !== value.length) {
        throw new Error('加工包 approvedItems 包含重复或未知候选');
    }
    if (normalized.some((item, index) => item !== value[index])) {
        throw new Error('加工包 approvedItems 顺序无效');
    }
    return normalized;
}
function validateOutputs(value, vaultRoot, sourceFile, sourceUrl, packId, revision, approvedItems) {
    if (value === undefined) {
        if (approvedItems.length > 0) {
            throw new Error('加工包缺少已发布输出记录');
        }
        return [];
    }
    if (!Array.isArray(value)) {
        throw new Error('加工包 outputs 无效');
    }
    const outputs = value.map((entry, index) => validateOutput(entry, index, vaultRoot, sourceFile, sourceUrl, packId, revision));
    const outputItems = outputs.flatMap((output) => output.itemIds);
    if (new Set(outputItems).size !== outputItems.length ||
        outputItems.length !== approvedItems.length ||
        approvedItems.some((item) => !outputItems.includes(item))) {
        throw new Error('加工包 outputs 与 approvedItems 不一致');
    }
    if (outputs.filter((output) => output.kind === 'L3').length > 1) {
        throw new Error('同一加工包只能有一个 L3 输出');
    }
    return outputs;
}
function validateOutput(value, index, vaultRoot, sourceFile, sourceUrl, packId, revision) {
    const output = requireRecord(value, `outputs[${index}]`);
    const allowedFields = new Set([
        'kind',
        'itemIds',
        'file',
        'sha256',
        'publishedAt',
        'updatedAt',
    ]);
    const unknownFields = Object.keys(output).filter((field) => !allowedFields.has(field));
    if (unknownFields.length > 0) {
        throw new Error(`outputs[${index}] 包含未知字段: ${unknownFields.join(', ')}`);
    }
    if (output.kind !== 'L2' && output.kind !== 'L3') {
        throw new Error(`outputs[${index}].kind 无效`);
    }
    if (!Array.isArray(output.itemIds) ||
        output.itemIds.length === 0 ||
        output.itemIds.some((item) => typeof item !== 'string')) {
        throw new Error(`outputs[${index}].itemIds 无效`);
    }
    const itemIds = [...output.itemIds];
    if (output.kind === 'L2' && (itemIds.length !== 1 || !/^L2-\d{2}$/.test(itemIds[0]))) {
        throw new Error(`outputs[${index}] 的 L2 itemIds 无效`);
    }
    if (output.kind === 'L3' && itemIds.some((item) => !/^L3-\d{2}$/.test(item))) {
        throw new Error(`outputs[${index}] 的 L3 itemIds 无效`);
    }
    if (typeof output.file !== 'string' || !output.file) {
        throw new Error(`outputs[${index}].file 无效`);
    }
    const file = path.resolve(output.file);
    const expectedFile = output.kind === 'L2'
        ? (0, pack_paths_1.atomicNoteFilePath)(vaultRoot, sourceFile, packId, revision, itemIds[0])
        : (0, pack_paths_1.materialsFilePath)(vaultRoot, sourceFile, sourceUrl);
    if (file !== expectedFile) {
        throw new Error(`outputs[${index}].file 与输出类型不匹配`);
    }
    if (typeof output.sha256 !== 'string' || !/^[a-f0-9]{64}$/.test(output.sha256)) {
        throw new Error(`outputs[${index}].sha256 无效`);
    }
    if (typeof output.publishedAt !== 'string' || !output.publishedAt) {
        throw new Error(`outputs[${index}].publishedAt 无效`);
    }
    if (typeof output.updatedAt !== 'string' || !output.updatedAt) {
        throw new Error(`outputs[${index}].updatedAt 无效`);
    }
    return {
        kind: output.kind,
        itemIds,
        file,
        sha256: output.sha256,
        publishedAt: output.publishedAt,
        updatedAt: output.updatedAt,
    };
}
function isPackStatus(value) {
    return [
        'pending',
        'partial',
        'approved',
        'rejected',
        'revoked',
        'superseded',
    ].includes(String(value));
}
function assertInsideVault(vaultRoot, target, label) {
    const relative = path.relative(path.resolve(vaultRoot), path.resolve(target));
    if (relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
        throw new Error(`${label}超出知识库`);
    }
}
function requireRecord(value, label) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        throw new Error(`${label}必须是对象`);
    }
    return value;
}
