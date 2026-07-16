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
exports.planSharedMaterialsPublication = planSharedMaterialsPublication;
const fs = __importStar(require("fs-extra"));
const gray_matter_1 = __importDefault(require("gray-matter"));
const path = __importStar(require("path"));
const command_error_1 = require("./command-error");
const pack_manifest_1 = require("./pack-manifest");
const pack_paths_1 = require("./pack-paths");
const pack_publication_1 = require("./pack-publication");
const pack_state_1 = require("./pack-state");
async function planSharedMaterialsPublication(input) {
    const { state, vaultRoot } = input;
    const file = (0, pack_paths_1.materialsFilePath)(vaultRoot, state.manifest.sourceFile, state.manifest.sourceUrl);
    const stateFile = (0, pack_paths_1.materialsStateFilePath)(vaultRoot, state.manifest.sourceUrl);
    const existing = await loadSharedMaterials(stateFile, file, state.manifest.sourceFile, state.manifest.sourceUrl);
    const storedStates = await loadSourcePackStates(vaultRoot, state.manifest.sourceFile, state.manifest.sourceUrl);
    const currentKey = (0, pack_state_1.packStateKey)(state);
    if (!storedStates.some((stored) => (0, pack_state_1.packStateKey)(stored.state) === currentKey)) {
        throw new command_error_1.CommandError('PACK_ALREADY_EXISTS', '找不到当前加工包的 revision 状态');
    }
    const publishedStates = storedStates.filter((stored) => stored.state.outputs.some((output) => output.kind === 'L3'));
    const currentIndex = publicationIndex(publishedStates);
    if (existing) {
        if (JSON.stringify(existing.state.publications) !== JSON.stringify(currentIndex)) {
            throw new command_error_1.CommandError('PACK_ALREADY_EXISTS', '共享 L3 的贡献清单与隐藏状态不一致');
        }
        validateMaterialFrontmatter(existing.fileContent, existing.state);
    }
    else if (publishedStates.length > 0) {
        throw new command_error_1.CommandError('PACK_ALREADY_EXISTS', '共享 L3 状态缺失，拒绝覆盖既有发布记录');
    }
    const existingOutput = state.outputs.find((output) => output.kind === 'L3');
    const materials = state.manifest.materials.filter((material) => input.approvedItems.has(material.id));
    const output = {
        kind: 'L3',
        itemIds: materials.map((material) => material.id),
        file,
        sha256: '',
        publishedAt: existingOutput?.publishedAt || input.now,
        updatedAt: input.now,
    };
    const publications = publishedStates
        .filter((stored) => (0, pack_state_1.packStateKey)(stored.state) !== currentKey)
        .map((stored) => materialPublication(stored.state, vaultRoot))
        .concat({
        state,
        materials,
        packWikiPath: (0, pack_paths_1.toWikiPath)(vaultRoot, state.packFile),
        publishedAt: output.publishedAt,
    })
        .sort((left, right) => publicationOrder(left.state, right.state));
    (0, pack_manifest_1.validateQuotes)(publications.flatMap((publication) => publication.materials), input.sourceBody);
    const content = (0, pack_publication_1.renderMaterials)(publications, input.sourceTitle, input.sourceWikiPath, publications.map((publication) => publication.publishedAt).sort()[0], input.now);
    output.sha256 = (0, pack_publication_1.sha256Content)(content);
    const nextState = {
        schemaVersion: 1,
        sourceFile: state.manifest.sourceFile,
        sourceUrl: state.manifest.sourceUrl,
        file,
        sha256: output.sha256,
        publications: publications.map((publication) => publicationIndexEntry(publication.state, publication.materials.map((material) => material.id), publication.publishedAt)),
        createdAt: existing?.state.createdAt || input.now,
        updatedAt: input.now,
    };
    return {
        output,
        writes: [
            {
                target: file,
                content,
                expectAbsent: !existing,
                ...(existing ? { expectedContent: existing.fileContent } : {}),
            },
            {
                target: stateFile,
                content: serializeSharedMaterialsState(nextState),
                expectAbsent: !existing,
                ...(existing ? { expectedContent: existing.stateContent } : {}),
            },
        ],
    };
}
async function loadSharedMaterials(stateFile, file, sourceFile, sourceUrl) {
    const [stateStat, fileStat] = await Promise.all([
        lstatIfExists(stateFile),
        lstatIfExists(file),
    ]);
    if (!stateStat && !fileStat) {
        return null;
    }
    if (!stateStat || !fileStat) {
        throw new command_error_1.CommandError('PACK_ALREADY_EXISTS', '共享 L3 文件与隐藏状态不完整');
    }
    if (stateStat.isSymbolicLink() ||
        !stateStat.isFile() ||
        fileStat.isSymbolicLink() ||
        !fileStat.isFile()) {
        throw new command_error_1.CommandError('PACK_ALREADY_EXISTS', '共享 L3 文件与隐藏状态必须是普通文件');
    }
    let stateContent;
    let fileContent;
    try {
        [stateContent, fileContent] = await Promise.all([
            fs.readFile(stateFile, 'utf8'),
            fs.readFile(file, 'utf8'),
        ]);
    }
    catch (error) {
        throw new command_error_1.CommandError('PACK_ALREADY_EXISTS', (0, command_error_1.getErrorMessage)(error));
    }
    let value;
    try {
        value = JSON.parse(stateContent);
    }
    catch (error) {
        throw new command_error_1.CommandError('PACK_ALREADY_EXISTS', `共享 L3 状态 JSON 无效: ${(0, command_error_1.getErrorMessage)(error)}`);
    }
    const state = validateSharedMaterialsState(value, {
        stateFile,
        file,
        sourceFile,
        sourceUrl,
    });
    if ((0, pack_publication_1.sha256Content)(fileContent) !== state.sha256) {
        throw new command_error_1.CommandError('DERIVED_FILE_MODIFIED', `已发布文件被人工修改，拒绝覆盖: ${file}`);
    }
    return { state, stateContent, fileContent };
}
function validateSharedMaterialsState(value, expected) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        throw new command_error_1.CommandError('PACK_ALREADY_EXISTS', '共享 L3 状态必须是对象');
    }
    const state = value;
    const fields = [
        'schemaVersion',
        'sourceFile',
        'sourceUrl',
        'file',
        'sha256',
        'publications',
        'createdAt',
        'updatedAt',
    ];
    if (Object.keys(state).length !== fields.length ||
        fields.some((field) => !Object.prototype.hasOwnProperty.call(state, field)) ||
        state.schemaVersion !== 1 ||
        path.resolve(String(state.sourceFile || '')) !== path.resolve(expected.sourceFile) ||
        state.sourceUrl !== expected.sourceUrl ||
        path.resolve(String(state.file || '')) !== path.resolve(expected.file) ||
        typeof state.sha256 !== 'string' ||
        !/^[a-f0-9]{64}$/.test(state.sha256) ||
        typeof state.createdAt !== 'string' ||
        !state.createdAt ||
        typeof state.updatedAt !== 'string' ||
        !state.updatedAt) {
        throw new command_error_1.CommandError('PACK_ALREADY_EXISTS', `共享 L3 状态无效: ${expected.stateFile}`);
    }
    return {
        schemaVersion: 1,
        sourceFile: path.resolve(String(state.sourceFile)),
        sourceUrl: state.sourceUrl,
        file: path.resolve(String(state.file)),
        sha256: state.sha256,
        publications: normalizePublicationIndex(state.publications),
        createdAt: state.createdAt,
        updatedAt: state.updatedAt,
    };
}
function validateMaterialFrontmatter(content, state) {
    let document;
    try {
        document = (0, gray_matter_1.default)(content);
    }
    catch (error) {
        throw new command_error_1.CommandError('PACK_ALREADY_EXISTS', `共享 L3 Frontmatter 无效: ${(0, command_error_1.getErrorMessage)(error)}`);
    }
    if (document.data.sourceFile !== state.sourceFile ||
        document.data.sourceUrl !== state.sourceUrl ||
        JSON.stringify(normalizePublicationIndex(document.data.publications)) !==
            JSON.stringify(state.publications)) {
        throw new command_error_1.CommandError('PACK_ALREADY_EXISTS', '共享 L3 Frontmatter 与隐藏状态不一致');
    }
}
function normalizePublicationIndex(value) {
    if (!Array.isArray(value)) {
        throw new command_error_1.CommandError('PACK_ALREADY_EXISTS', '共享 L3 缺少 publications 清单');
    }
    return value.map((entry, index) => {
        if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
            throw new command_error_1.CommandError('PACK_ALREADY_EXISTS', `共享 L3 publications[${index}] 无效`);
        }
        const record = entry;
        const fields = ['packId', 'revision', 'itemIds', 'packFile', 'publishedAt'];
        if (Object.keys(record).length !== fields.length ||
            fields.some((field) => !Object.prototype.hasOwnProperty.call(record, field)) ||
            typeof record.packId !== 'string' ||
            !/^[a-f0-9]{64}$/.test(record.packId) ||
            !Number.isInteger(record.revision) ||
            Number(record.revision) < 1 ||
            !Array.isArray(record.itemIds) ||
            record.itemIds.length === 0 ||
            record.itemIds.some((item) => typeof item !== 'string' || !/^L3-\d{2}$/.test(item)) ||
            typeof record.packFile !== 'string' ||
            !record.packFile ||
            typeof record.publishedAt !== 'string' ||
            !record.publishedAt) {
            throw new command_error_1.CommandError('PACK_ALREADY_EXISTS', `共享 L3 publications[${index}] 无效`);
        }
        return {
            packId: record.packId,
            revision: Number(record.revision),
            itemIds: [...record.itemIds],
            packFile: path.resolve(record.packFile),
            publishedAt: record.publishedAt,
        };
    });
}
function publicationIndex(states) {
    return [...states]
        .sort((left, right) => publicationOrder(left.state, right.state))
        .map((stored) => publicationIndexEntry(stored.state));
}
function publicationIndexEntry(state, itemIds, publishedAt) {
    const output = state.outputs.find((candidate) => candidate.kind === 'L3');
    if ((!itemIds || !publishedAt) && !output) {
        throw new Error('内部错误：加工包缺少 L3 输出');
    }
    return {
        packId: state.packId,
        revision: state.revision,
        itemIds: itemIds || output.itemIds,
        packFile: state.packFile,
        publishedAt: publishedAt || output.publishedAt,
    };
}
function materialPublication(state, vaultRoot) {
    const output = state.outputs.find((candidate) => candidate.kind === 'L3');
    if (!output) {
        throw new Error('内部错误：加工包缺少 L3 输出');
    }
    const selected = new Set(output.itemIds);
    return {
        state,
        materials: state.manifest.materials.filter((material) => selected.has(material.id)),
        packWikiPath: (0, pack_paths_1.toWikiPath)(vaultRoot, state.packFile),
        publishedAt: output.publishedAt,
    };
}
function publicationOrder(left, right) {
    return left.createdAt.localeCompare(right.createdAt) ||
        (0, pack_state_1.packStateKey)(left).localeCompare((0, pack_state_1.packStateKey)(right));
}
async function loadSourcePackStates(vaultRoot, sourceFile, sourceUrl) {
    try {
        return await (0, pack_state_1.listSourcePackStates)(vaultRoot, sourceFile, sourceUrl);
    }
    catch (error) {
        throw new command_error_1.CommandError('PACK_ALREADY_EXISTS', (0, command_error_1.getErrorMessage)(error));
    }
}
function serializeSharedMaterialsState(state) {
    return `${JSON.stringify(state, null, 2)}\n`;
}
async function lstatIfExists(target) {
    try {
        return await fs.lstat(target);
    }
    catch (error) {
        if (error.code === 'ENOENT') {
            return null;
        }
        throw new command_error_1.CommandError('PACK_ALREADY_EXISTS', (0, command_error_1.getErrorMessage)(error));
    }
}
