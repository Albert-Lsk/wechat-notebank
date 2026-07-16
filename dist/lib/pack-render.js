"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.setPackStatus = setPackStatus;
exports.upsertDerivedLink = upsertDerivedLink;
exports.renderPack = renderPack;
const gray_matter_1 = __importDefault(require("gray-matter"));
const command_error_1 = require("./command-error");
const DERIVED_START = '<!-- alskai-notebank:derived:start -->';
const DERIVED_END = '<!-- alskai-notebank:derived:end -->';
function setPackStatus(content, supersededAt) {
    const document = (0, gray_matter_1.default)(content);
    return gray_matter_1.default.stringify(document.content, {
        ...document.data,
        status: 'superseded',
        supersededAt,
    });
}
function upsertDerivedLink(sourceContent, link) {
    const startMatches = sourceContent.split(DERIVED_START).length - 1;
    const endMatches = sourceContent.split(DERIVED_END).length - 1;
    if (startMatches !== endMatches || startMatches > 1) {
        throw new command_error_1.CommandError('MANIFEST_INVALID', '原文衍生内容受控区域损坏');
    }
    if (startMatches === 1) {
        const start = sourceContent.indexOf(DERIVED_START);
        const end = sourceContent.indexOf(DERIVED_END, start);
        const managed = sourceContent.slice(start, end);
        if (managed.includes(link)) {
            return sourceContent;
        }
        return `${sourceContent.slice(0, end)}${link}\n${sourceContent.slice(end)}`;
    }
    const suffix = sourceContent.endsWith('\n') ? '\n' : '\n\n';
    return `${sourceContent}${suffix}${DERIVED_START}\n## 衍生内容\n${link}\n${DERIVED_END}\n`;
}
function renderPack(input) {
    const l2 = input.manifest.atomicNotes.length > 0
        ? input.manifest.atomicNotes.map((note) => [
            `### ${note.id} · ${note.title}`,
            '',
            `- 观点：${note.claim}`,
            `- 原文依据：${note.evidence}`,
            `- 适用边界：${note.boundary}`,
            `- 潜在用途：${note.useCases.join('、')}`,
        ].join('\n')).join('\n\n')
        : '暂无候选。';
    const l3 = input.manifest.materials.length > 0
        ? input.manifest.materials.map((material) => [
            `### ${material.id} · ${material.title}`,
            '',
            `- 类型：${material.kind}`,
            `- 内容：${material.content}`,
            `- 原文章节：${material.sourceSection}`,
        ].join('\n')).join('\n\n')
        : '暂无候选。';
    const l4 = input.manifest.reviewQuestions.length > 0
        ? input.manifest.reviewQuestions.map((question) => `- ${question.id}：${question.question}`).join('\n')
        : '暂无问题。';
    return gray_matter_1.default.stringify([
        `# 待审核加工包：${input.sourceTitle}`,
        '',
        `原文：[[${input.sourceWikiPath}|${input.sourceTitle}]]`,
        '',
        '## L2 原子卡片候选',
        '',
        l2,
        '',
        '## L3 引用素材候选',
        '',
        l3,
        '',
        '## L4 阅读复盘问题',
        '',
        l4,
        '',
    ].join('\n'), {
        packId: input.packId,
        revision: input.revision,
        status: 'pending',
        sourceFile: input.sourceFile,
        sourceUrl: input.sourceUrl,
        processingGoal: input.processingGoal,
        createdAt: input.createdAt,
    });
}
