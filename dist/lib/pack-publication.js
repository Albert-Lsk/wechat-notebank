"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.renderAtomicNote = renderAtomicNote;
exports.renderMaterials = renderMaterials;
exports.renderReflections = renderReflections;
exports.renderPublicationLinks = renderPublicationLinks;
exports.sha256Content = sha256Content;
const crypto_1 = require("crypto");
const gray_matter_1 = __importDefault(require("gray-matter"));
const pack_paths_1 = require("./pack-paths");
function renderAtomicNote(note, state, sourceTitle, sourceWikiPath, packWikiPath, publishedAt) {
    return gray_matter_1.default.stringify([
        `# ${note.title}`,
        '',
        note.claim,
        '',
        '## 原文依据',
        '',
        note.evidence,
        '',
        '## 适用边界',
        '',
        note.boundary,
        '',
        '## 潜在用途',
        '',
        note.useCases.length > 0 ? note.useCases.map((item) => `- ${item}`).join('\n') : '暂无。',
        '',
        `原文：[[${sourceWikiPath}|${sourceTitle}]]`,
        `加工包：[[${packWikiPath}|待审核加工包 r${state.revision}]]`,
        '',
    ].join('\n'), {
        layer: 'L2',
        itemId: note.id,
        packId: state.packId,
        revision: state.revision,
        sourceFile: state.manifest.sourceFile,
        sourceUrl: state.manifest.sourceUrl,
        packFile: state.packFile,
        publishedAt,
    });
}
function renderMaterials(publications, sourceTitle, sourceWikiPath, publishedAt, updatedAt) {
    const sections = publications.map((publication) => [
        `## 加工包 ${publication.state.packId.slice(0, 12)} · r${publication.state.revision}`,
        '',
        `加工包：[[${publication.packWikiPath}|待审核加工包 r${publication.state.revision}]]`,
        '',
        ...publication.materials.flatMap((material) => [
            `### ${material.id} · ${material.title}`,
            '',
            `类型：${material.kind}`,
            '',
            material.content,
            '',
            `原文章节：${material.sourceSection}`,
            '',
        ]),
    ].join('\n')).join('\n');
    const first = publications[0];
    if (!first) {
        throw new Error('L3 素材包至少需要一条发布记录');
    }
    return gray_matter_1.default.stringify([
        `# 引用素材包：${sourceTitle}`,
        '',
        `原文：[[${sourceWikiPath}|${sourceTitle}]]`,
        '',
        sections,
        '',
    ].join('\n'), {
        layer: 'L3',
        itemIds: publications.flatMap((publication) => publication.materials.map((material) => material.id)),
        sourceFile: first.state.manifest.sourceFile,
        sourceUrl: first.state.manifest.sourceUrl,
        publications: publications.map((publication) => ({
            packId: publication.state.packId,
            revision: publication.state.revision,
            itemIds: publication.materials.map((material) => material.id),
            packFile: publication.state.packFile,
            publishedAt: publication.publishedAt,
        })),
        publishedAt,
        updatedAt,
    });
}
function renderReflections(publications, sourceTitle, sourceWikiPath, publishedAt, updatedAt) {
    const first = publications[0];
    if (!first) {
        throw new Error('L4 阅读复盘至少需要一条发布记录');
    }
    const sections = publications.map((publication) => {
        const answers = publication.state.manifest.reviewAnswers;
        const draft = publication.state.manifest.reviewDraft;
        if (!answers || !draft) {
            throw new Error('内部错误：L4 发布记录缺少用户回答或 Agent 整理稿');
        }
        return [
            `## 加工包 ${publication.state.packId.slice(0, 12)} · r${publication.state.revision}`,
            '',
            `加工包：[[${publication.packWikiPath}|待审核加工包 r${publication.state.revision}]]`,
            '',
            '### 用户原始回答',
            '',
            ...publication.state.manifest.reviewQuestions.flatMap((question) => [
                `#### ${question.id} · ${question.question}`,
                '',
                answers[question.id],
                '',
            ]),
            '### Agent 整理稿',
            '',
            draft,
            '',
        ].join('\n');
    }).join('\n');
    return gray_matter_1.default.stringify([
        `# 阅读复盘：${sourceTitle}`,
        '',
        `原文：[[${sourceWikiPath}|${sourceTitle}]]`,
        '',
        sections,
        '',
    ].join('\n'), {
        layer: 'L4',
        sourceFile: first.state.manifest.sourceFile,
        sourceUrl: first.state.manifest.sourceUrl,
        publications: publications.map((publication) => ({
            packId: publication.state.packId,
            revision: publication.state.revision,
            itemIds: publication.state.manifest.reviewQuestions.map((question) => question.id),
            packFile: publication.state.packFile,
            publishedAt: publication.publishedAt,
        })),
        publishedAt,
        updatedAt,
    });
}
function renderPublicationLinks(vaultRoot, outputs, state) {
    const notes = new Map(state.manifest.atomicNotes.map((note) => [note.id, note]));
    return outputs.map((output) => {
        const wikiPath = (0, pack_paths_1.toWikiPath)(vaultRoot, output.file);
        if (output.kind === 'L2') {
            const itemId = output.itemIds[0];
            const title = notes.get(itemId)?.title || itemId;
            const link = `[[${wikiPath}|${itemId} · ${title}]]`;
            return {
                source: `- L2 原子卡片：${link}`,
                pack: `- L2 原子卡片：${link}`,
            };
        }
        if (output.kind === 'L3') {
            const link = `[[${wikiPath}|L3 引用素材包]]`;
            return {
                source: `- L3 引用素材：${link}`,
                pack: `- L3 引用素材：${link}`,
            };
        }
        const link = `[[${wikiPath}|L4 阅读复盘]]`;
        return {
            source: `- L4 阅读复盘：${link}`,
            pack: `- L4 阅读复盘：${link}`,
        };
    });
}
function sha256Content(content) {
    return (0, crypto_1.createHash)('sha256').update(content).digest('hex');
}
