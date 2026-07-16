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
exports.createPackCommand = createPackCommand;
const fs = __importStar(require("fs-extra"));
const path = __importStar(require("path"));
const gray_matter_1 = __importDefault(require("gray-matter"));
const command_error_1 = require("../lib/command-error");
const storage_1 = require("../lib/storage");
const file_transaction_1 = require("../lib/file-transaction");
const pack_manifest_1 = require("../lib/pack-manifest");
const pack_render_1 = require("../lib/pack-render");
async function createPackCommand(args, transactionHooks = {}) {
    const sourceFile = path.resolve(args.sourceFile);
    const manifestFile = path.resolve(args.manifestFile);
    let sourceContent;
    let manifestValue;
    try {
        [sourceContent, manifestValue] = await Promise.all([
            fs.readFile(sourceFile, 'utf8'),
            fs.readJson(manifestFile),
        ]);
    }
    catch (error) {
        throw new command_error_1.CommandError('MANIFEST_INVALID', (0, command_error_1.getErrorMessage)(error));
    }
    const manifest = (0, pack_manifest_1.validateInitialManifest)(manifestValue, sourceFile);
    let sourceDocument;
    try {
        sourceDocument = (0, gray_matter_1.default)(sourceContent);
    }
    catch (error) {
        throw new command_error_1.CommandError('MANIFEST_INVALID', `原文 Frontmatter 无效: ${(0, command_error_1.getErrorMessage)(error)}`);
    }
    const sourceData = sourceDocument.data;
    if (sourceData.sourceUrl !== manifest.sourceUrl) {
        throw new command_error_1.CommandError('MANIFEST_INVALID', 'Manifest sourceUrl 与原文不一致');
    }
    (0, pack_manifest_1.validateQuotes)(manifest.materials, sourceDocument.content);
    const processingGoal = (0, pack_manifest_1.normalizeProcessingGoal)(manifest.processingGoal);
    manifest.processingGoal = processingGoal;
    const packId = (0, pack_manifest_1.computePackId)(manifest.sourceUrl, processingGoal);
    const vaultRoot = findVaultRoot(sourceFile);
    const sourceStem = path.basename(sourceFile, path.extname(sourceFile));
    const stateFile = path.join(vaultRoot, '.alskai-notebank', 'packs', packId, 'state.json');
    let existing = null;
    if (await fs.pathExists(stateFile)) {
        try {
            existing = validateCurrentPackState(await fs.readJson(stateFile), packId, sourceFile, vaultRoot);
        }
        catch (error) {
            throw new command_error_1.CommandError('PACK_ALREADY_EXISTS', (0, command_error_1.getErrorMessage)(error));
        }
        if ((0, pack_manifest_1.canonicalJson)(existing.manifest) === (0, pack_manifest_1.canonicalJson)(manifest)) {
            if (!(await fs.pathExists(existing.packFile))) {
                throw new command_error_1.CommandError('PACK_ALREADY_EXISTS', '加工包状态存在，但可见文件缺失');
            }
            return {
                action: 'reuse',
                packId,
                revision: existing.revision,
                status: existing.status === 'superseded' ? 'pending' : existing.status,
                sourceFile,
                sourceUrl: manifest.sourceUrl,
                processingGoal,
                packFile: existing.packFile,
                stateFile,
            };
        }
    }
    const sourceWikiPath = toWikiPath(vaultRoot, sourceFile);
    const revision = existing ? existing.revision + 1 : 1;
    const packFile = path.join(vaultRoot, 'Inbox', `${sourceStem}-${packId.slice(0, 12)}-r${revision}.md`);
    const packWikiPath = toWikiPath(vaultRoot, packFile);
    const createdAt = new Date().toISOString();
    const packContent = (0, pack_render_1.renderPack)({
        packId,
        revision,
        sourceFile,
        sourceUrl: manifest.sourceUrl,
        processingGoal,
        sourceTitle: typeof sourceData.title === 'string' ? sourceData.title : sourceStem,
        sourceWikiPath,
        createdAt,
        manifest,
    });
    const sourceWithLink = (0, pack_render_1.upsertDerivedLink)(sourceContent, `- 待审核加工包：[[${packWikiPath}|待审核加工包 r${revision}]]`);
    const state = {
        packId,
        revision,
        status: 'pending',
        packFile,
        createdAt,
        manifest,
    };
    const revisionStateFile = path.join(path.dirname(stateFile), 'revisions', `${revision}.json`);
    const writes = [];
    try {
        if (existing) {
            const superseded = {
                ...existing,
                status: 'superseded',
                supersededAt: createdAt,
            };
            const previousRevisionFile = path.join(path.dirname(stateFile), 'revisions', `${existing.revision}.json`);
            const previousPackContent = await fs.readFile(existing.packFile, 'utf8');
            writes.push({
                target: existing.packFile,
                content: (0, pack_render_1.setPackStatus)(previousPackContent, createdAt),
            });
            writes.push({
                target: previousRevisionFile,
                content: serializeJson(superseded),
            });
        }
        writes.push({ target: packFile, content: packContent });
        writes.push({ target: revisionStateFile, content: serializeJson(state) });
        writes.push({ target: stateFile, content: serializeJson(state) });
        writes.push({ target: sourceFile, content: sourceWithLink });
        await (0, file_transaction_1.commitFileTransaction)(vaultRoot, writes, transactionHooks);
    }
    catch (error) {
        throw new command_error_1.CommandError('TRANSACTION_FAILED', (0, command_error_1.getErrorMessage)(error));
    }
    return {
        action: existing ? 'revise' : 'create',
        packId,
        revision,
        status: 'pending',
        sourceFile,
        sourceUrl: manifest.sourceUrl,
        processingGoal,
        packFile,
        stateFile,
    };
}
function serializeJson(value) {
    return `${JSON.stringify(value, null, 2)}\n`;
}
function validateCurrentPackState(value, packId, sourceFile, vaultRoot) {
    const state = (0, pack_manifest_1.requireObject)(value, '加工包状态');
    if (state.packId !== packId) {
        throw new Error('加工包状态的 packId 不匹配');
    }
    if (!Number.isInteger(state.revision) || Number(state.revision) < 1) {
        throw new Error('加工包状态的 revision 无效');
    }
    if (state.status !== 'pending') {
        throw new Error('当前加工包状态必须是 pending');
    }
    if (typeof state.packFile !== 'string' || !state.packFile) {
        throw new Error('加工包状态的 packFile 无效');
    }
    const packFile = path.resolve(state.packFile);
    const relativePackFile = path.relative(vaultRoot, packFile);
    if (relativePackFile.startsWith('..') || path.isAbsolute(relativePackFile)) {
        throw new Error('加工包状态的 packFile 超出知识库');
    }
    if (typeof state.createdAt !== 'string' || !state.createdAt) {
        throw new Error('加工包状态的 createdAt 无效');
    }
    const stateManifest = (0, pack_manifest_1.validateInitialManifest)(state.manifest, sourceFile);
    return {
        packId,
        revision: Number(state.revision),
        status: 'pending',
        packFile,
        createdAt: state.createdAt,
        manifest: stateManifest,
    };
}
function findVaultRoot(sourceFile) {
    const parsed = path.parse(sourceFile);
    const segments = sourceFile.slice(parsed.root.length).split(path.sep);
    const l1Index = segments.lastIndexOf(storage_1.FOLDER_L1);
    if (l1Index < 0) {
        return path.dirname(sourceFile);
    }
    return path.join(parsed.root, ...segments.slice(0, l1Index));
}
function toWikiPath(vaultRoot, filePath) {
    return path.relative(vaultRoot, filePath)
        .replace(/\.md$/i, '')
        .split(path.sep)
        .join('/');
}
