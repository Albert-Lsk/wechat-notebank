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
exports.planSharedPublication = planSharedPublication;
const fs = __importStar(require("fs-extra"));
const gray_matter_1 = __importDefault(require("gray-matter"));
const path = __importStar(require("path"));
const command_error_1 = require("./command-error");
const pack_publication_1 = require("./pack-publication");
const pack_state_1 = require("./pack-state");
async function planSharedPublication(input) {
    const { adapter, state, vaultRoot } = input;
    const existing = await loadSharedPublication({
        stateFile: input.stateFile,
        file: input.file,
        sourceFile: state.manifest.sourceFile,
        sourceUrl: state.manifest.sourceUrl,
        adapter,
    });
    const storedStates = await loadSourcePackStates(vaultRoot, state.manifest.sourceFile, state.manifest.sourceUrl);
    const currentKey = (0, pack_state_1.packStateKey)(state);
    if (!storedStates.some((stored) => (0, pack_state_1.packStateKey)(stored.state) === currentKey)) {
        throw new command_error_1.CommandError('PACK_ALREADY_EXISTS', '找不到当前加工包的 revision 状态');
    }
    const publishedStates = storedStates.filter((stored) => stored.state.outputs.some((output) => output.kind === adapter.kind));
    const currentIndex = publicationIndex(publishedStates, adapter);
    if (existing) {
        if (JSON.stringify(existing.state.publications) !== JSON.stringify(currentIndex)) {
            throw new command_error_1.CommandError('PACK_ALREADY_EXISTS', `${adapter.label} 的贡献清单与隐藏状态不一致`);
        }
        validateFrontmatter(existing.fileContent, existing.state, adapter);
    }
    else if (publishedStates.length > 0) {
        throw new command_error_1.CommandError('PACK_ALREADY_EXISTS', `${adapter.label} 状态缺失，拒绝覆盖既有发布记录`);
    }
    const publications = publishedStates
        .filter((stored) => (0, pack_state_1.packStateKey)(stored.state) !== currentKey)
        .map((stored) => adapter.fromStoredState(stored.state, vaultRoot))
        .concat(input.currentPublication)
        .sort((left, right) => publicationOrder(left.state, right.state));
    adapter.validatePublications(publications);
    const content = adapter.render(publications, input.sourceTitle, input.sourceWikiPath, publications.map((publication) => publication.publishedAt).sort()[0], input.now);
    const output = {
        kind: adapter.kind,
        itemIds: adapter.itemIdsOf(input.currentPublication),
        file: input.file,
        sha256: (0, pack_publication_1.sha256Content)(content),
        publishedAt: input.currentPublication.publishedAt,
        updatedAt: input.now,
    };
    const nextState = {
        schemaVersion: 1,
        sourceFile: state.manifest.sourceFile,
        sourceUrl: state.manifest.sourceUrl,
        file: input.file,
        sha256: output.sha256,
        publications: publications.map((publication) => publicationIndexEntry(publication.state, adapter.kind, adapter.itemIdsOf(publication), publication.publishedAt)),
        createdAt: existing?.state.createdAt || input.now,
        updatedAt: input.now,
    };
    return {
        output,
        writes: [
            {
                target: input.file,
                content,
                expectAbsent: !existing,
                ...(existing ? { expectedContent: existing.fileContent } : {}),
            },
            {
                target: input.stateFile,
                content: serializeSharedPublicationState(nextState),
                expectAbsent: !existing,
                ...(existing ? { expectedContent: existing.stateContent } : {}),
            },
        ],
    };
}
async function loadSharedPublication(input) {
    const [stateStat, fileStat] = await Promise.all([
        lstatIfExists(input.stateFile),
        lstatIfExists(input.file),
    ]);
    if (!stateStat && !fileStat) {
        return null;
    }
    if (!stateStat || !fileStat) {
        throw new command_error_1.CommandError('PACK_ALREADY_EXISTS', `${input.adapter.label} 文件与隐藏状态不完整`);
    }
    if (stateStat.isSymbolicLink() ||
        !stateStat.isFile() ||
        fileStat.isSymbolicLink() ||
        !fileStat.isFile()) {
        throw new command_error_1.CommandError('PACK_ALREADY_EXISTS', `${input.adapter.label} 文件与隐藏状态必须是普通文件`);
    }
    let stateContent;
    let fileContent;
    try {
        [stateContent, fileContent] = await Promise.all([
            fs.readFile(input.stateFile, 'utf8'),
            fs.readFile(input.file, 'utf8'),
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
        throw new command_error_1.CommandError('PACK_ALREADY_EXISTS', `${input.adapter.label} 状态 JSON 无效: ${(0, command_error_1.getErrorMessage)(error)}`);
    }
    const state = validateSharedPublicationState(value, input);
    if ((0, pack_publication_1.sha256Content)(fileContent) !== state.sha256) {
        throw new command_error_1.CommandError('DERIVED_FILE_MODIFIED', `已发布文件被人工修改，拒绝覆盖: ${input.file}`);
    }
    return { state, stateContent, fileContent };
}
function validateSharedPublicationState(value, expected) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        throw new command_error_1.CommandError('PACK_ALREADY_EXISTS', `${expected.adapter.label} 状态必须是对象`);
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
        throw new command_error_1.CommandError('PACK_ALREADY_EXISTS', `${expected.adapter.label} 状态无效: ${expected.stateFile}`);
    }
    return {
        schemaVersion: 1,
        sourceFile: path.resolve(String(state.sourceFile)),
        sourceUrl: state.sourceUrl,
        file: path.resolve(String(state.file)),
        sha256: state.sha256,
        publications: normalizePublicationIndex(state.publications, expected.adapter),
        createdAt: state.createdAt,
        updatedAt: state.updatedAt,
    };
}
function validateFrontmatter(content, state, adapter) {
    let document;
    try {
        document = (0, gray_matter_1.default)(content);
    }
    catch (error) {
        throw new command_error_1.CommandError('PACK_ALREADY_EXISTS', `${adapter.label} Frontmatter 无效: ${(0, command_error_1.getErrorMessage)(error)}`);
    }
    if (document.data.sourceFile !== state.sourceFile ||
        document.data.sourceUrl !== state.sourceUrl ||
        JSON.stringify(normalizePublicationIndex(document.data.publications, adapter)) !==
            JSON.stringify(state.publications)) {
        throw new command_error_1.CommandError('PACK_ALREADY_EXISTS', `${adapter.label} Frontmatter 与隐藏状态不一致`);
    }
}
function normalizePublicationIndex(value, adapter) {
    if (!Array.isArray(value)) {
        throw new command_error_1.CommandError('PACK_ALREADY_EXISTS', `${adapter.label} 缺少 publications 清单`);
    }
    return value.map((entry, index) => {
        if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
            throw new command_error_1.CommandError('PACK_ALREADY_EXISTS', `${adapter.label} publications[${index}] 无效`);
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
            record.itemIds.some((item) => typeof item !== 'string' || !adapter.itemIdPattern.test(item)) ||
            typeof record.packFile !== 'string' ||
            !record.packFile ||
            typeof record.publishedAt !== 'string' ||
            !record.publishedAt) {
            throw new command_error_1.CommandError('PACK_ALREADY_EXISTS', `${adapter.label} publications[${index}] 无效`);
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
function publicationIndex(states, adapter) {
    return [...states]
        .sort((left, right) => publicationOrder(left.state, right.state))
        .map((stored) => publicationIndexEntry(stored.state, adapter.kind));
}
function publicationIndexEntry(state, kind, itemIds, publishedAt) {
    const output = state.outputs.find((candidate) => candidate.kind === kind);
    if ((!itemIds || !publishedAt) && !output) {
        throw new Error(`内部错误：加工包缺少 ${kind} 输出`);
    }
    return {
        packId: state.packId,
        revision: state.revision,
        itemIds: itemIds || output.itemIds,
        packFile: state.packFile,
        publishedAt: publishedAt || output.publishedAt,
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
function serializeSharedPublicationState(state) {
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
