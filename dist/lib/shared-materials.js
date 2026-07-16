"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.planSharedMaterialsPublication = planSharedMaterialsPublication;
exports.planSharedMaterialsRetraction = planSharedMaterialsRetraction;
const pack_manifest_1 = require("./pack-manifest");
const pack_paths_1 = require("./pack-paths");
const pack_publication_1 = require("./pack-publication");
const shared_publication_1 = require("./shared-publication");
async function planSharedMaterialsPublication(input) {
    const { state, vaultRoot } = input;
    const existingOutput = state.outputs.find((output) => output.kind === 'L3');
    const currentPublication = {
        state,
        materials: state.manifest.materials.filter((material) => input.approvedItems.has(material.id)),
        packWikiPath: (0, pack_paths_1.toWikiPath)(vaultRoot, state.packFile),
        publishedAt: existingOutput?.publishedAt || input.now,
    };
    return (0, shared_publication_1.planSharedPublication)({
        vaultRoot,
        state,
        file: (0, pack_paths_1.materialsFilePath)(vaultRoot, state.manifest.sourceFile, state.manifest.sourceUrl),
        stateFile: (0, pack_paths_1.materialsStateFilePath)(vaultRoot, state.manifest.sourceUrl),
        sourceTitle: input.sourceTitle,
        sourceWikiPath: input.sourceWikiPath,
        now: input.now,
        currentPublication,
        adapter: materialsAdapter(input.sourceBody),
    });
}
async function planSharedMaterialsRetraction(input) {
    const { state, vaultRoot } = input;
    const existingOutput = state.outputs.find((output) => output.kind === 'L3');
    if (!existingOutput) {
        throw new Error('内部错误：加工包缺少 L3 输出');
    }
    const materials = state.manifest.materials.filter((material) => input.remainingItems.has(material.id));
    const currentPublication = materials.length > 0
        ? {
            state,
            materials,
            packWikiPath: (0, pack_paths_1.toWikiPath)(vaultRoot, state.packFile),
            publishedAt: existingOutput.publishedAt,
        }
        : null;
    return (0, shared_publication_1.planSharedRetraction)({
        vaultRoot,
        state,
        file: (0, pack_paths_1.materialsFilePath)(vaultRoot, state.manifest.sourceFile, state.manifest.sourceUrl),
        stateFile: (0, pack_paths_1.materialsStateFilePath)(vaultRoot, state.manifest.sourceUrl),
        sourceTitle: input.sourceTitle,
        sourceWikiPath: input.sourceWikiPath,
        now: input.now,
        currentPublication,
        adapter: materialsAdapter(input.sourceBody),
    });
}
function materialsAdapter(sourceBody) {
    return {
        kind: 'L3',
        label: '共享 L3',
        itemIdPattern: /^L3-\d{2}$/,
        fromStoredState: materialPublication,
        itemIdsOf: (publication) => publication.materials.map((material) => material.id),
        validatePublications: (publications) => (0, pack_manifest_1.validateQuotes)(publications.flatMap((publication) => publication.materials), sourceBody),
        render: pack_publication_1.renderMaterials,
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
