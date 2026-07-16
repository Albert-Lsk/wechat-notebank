"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.planSharedReflectionPublication = planSharedReflectionPublication;
exports.planSharedReflectionRetraction = planSharedReflectionRetraction;
const command_error_1 = require("./command-error");
const pack_paths_1 = require("./pack-paths");
const pack_publication_1 = require("./pack-publication");
const shared_publication_1 = require("./shared-publication");
async function planSharedReflectionPublication(input) {
    const { state, vaultRoot } = input;
    assertCompleteReview(state);
    const existingOutput = state.outputs.find((output) => output.kind === 'L4');
    const currentPublication = {
        state,
        packWikiPath: (0, pack_paths_1.toWikiPath)(vaultRoot, state.packFile),
        publishedAt: existingOutput?.publishedAt || input.now,
    };
    return (0, shared_publication_1.planSharedPublication)({
        vaultRoot,
        state,
        file: (0, pack_paths_1.reflectionFilePath)(vaultRoot, state.manifest.sourceFile, state.manifest.sourceUrl),
        stateFile: (0, pack_paths_1.reflectionStateFilePath)(vaultRoot, state.manifest.sourceUrl),
        sourceTitle: input.sourceTitle,
        sourceWikiPath: input.sourceWikiPath,
        now: input.now,
        currentPublication,
        adapter: reflectionAdapter(),
    });
}
async function planSharedReflectionRetraction(input) {
    const { state, vaultRoot } = input;
    if (!state.outputs.some((output) => output.kind === 'L4')) {
        throw new Error('内部错误：加工包缺少 L4 输出');
    }
    return (0, shared_publication_1.planSharedRetraction)({
        vaultRoot,
        state,
        file: (0, pack_paths_1.reflectionFilePath)(vaultRoot, state.manifest.sourceFile, state.manifest.sourceUrl),
        stateFile: (0, pack_paths_1.reflectionStateFilePath)(vaultRoot, state.manifest.sourceUrl),
        sourceTitle: input.sourceTitle,
        sourceWikiPath: input.sourceWikiPath,
        now: input.now,
        currentPublication: null,
        adapter: reflectionAdapter(),
    });
}
function reflectionAdapter() {
    return {
        kind: 'L4',
        label: '共享 L4',
        itemIdPattern: /^L4-Q\d{2}$/,
        fromStoredState: reflectionPublication,
        itemIdsOf: (publication) => publication.state.manifest.reviewQuestions.map((question) => question.id),
        validatePublications: (publications) => {
            for (const publication of publications) {
                assertCompleteReview(publication.state);
            }
        },
        render: pack_publication_1.renderReflections,
    };
}
function assertCompleteReview(state) {
    const answers = state.manifest.reviewAnswers;
    if (!answers ||
        state.manifest.reviewQuestions.some((question) => answers[question.id] === undefined) ||
        !state.manifest.reviewDraft) {
        throw new command_error_1.CommandError('MANIFEST_INVALID', 'L4 发布需要所有问题的用户原始回答与 Agent 整理稿');
    }
}
function reflectionPublication(state, vaultRoot) {
    const output = state.outputs.find((candidate) => candidate.kind === 'L4');
    if (!output) {
        throw new Error('内部错误：加工包缺少 L4 输出');
    }
    assertCompleteReview(state);
    return {
        state,
        packWikiPath: (0, pack_paths_1.toWikiPath)(vaultRoot, state.packFile),
        publishedAt: output.publishedAt,
    };
}
