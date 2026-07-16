import matter from 'gray-matter';
import { InitialManifest } from './pack-manifest';
import { CommandError } from './command-error';

const DERIVED_START = '<!-- alskai-notebank:derived:start -->';
const DERIVED_END = '<!-- alskai-notebank:derived:end -->';

export function setPackStatus(content: string, supersededAt: string): string {
  const document = matter(content);
  return matter.stringify(document.content, {
    ...document.data,
    status: 'superseded',
    supersededAt,
  });
}

export function upsertDerivedLink(sourceContent: string, link: string): string {
  const region = findDerivedRegion(sourceContent);
  if (region) {
    const { start, end } = region;
    const managed = sourceContent.slice(start, end);
    if (managed.includes(link)) {
      return sourceContent;
    }
    return `${sourceContent.slice(0, end)}${link}\n${sourceContent.slice(end)}`;
  }
  const suffix = sourceContent.endsWith('\n') ? '\n' : '\n\n';
  return `${sourceContent}${suffix}${DERIVED_START}\n## 衍生内容\n${link}\n${DERIVED_END}\n`;
}

export function withoutDerivedRegion(sourceContent: string): string {
  const region = findDerivedRegion(sourceContent);
  if (!region) {
    return sourceContent;
  }
  return `${sourceContent.slice(0, region.start)}${sourceContent.slice(region.endAfter)}`;
}

function findDerivedRegion(
  sourceContent: string
): { start: number; end: number; endAfter: number } | null {
  const startMatches = sourceContent.split(DERIVED_START).length - 1;
  const endMatches = sourceContent.split(DERIVED_END).length - 1;
  if (startMatches !== endMatches || startMatches > 1) {
    throw new CommandError('MANIFEST_INVALID', '原文衍生内容受控区域损坏');
  }
  if (startMatches === 0) {
    return null;
  }
  const start = sourceContent.indexOf(DERIVED_START);
  const end = sourceContent.indexOf(DERIVED_END);
  if (end < start) {
    throw new CommandError('MANIFEST_INVALID', '原文衍生内容受控区域顺序无效');
  }
  return { start, end, endAfter: end + DERIVED_END.length };
}

export function renderPack(input: {
  packId: string;
  revision: number;
  sourceFile: string;
  sourceUrl: string;
  processingGoal: string | null;
  sourceTitle: string;
  sourceWikiPath: string;
  createdAt: string;
  manifest: InitialManifest;
}): string {
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
    ? input.manifest.reviewQuestions.map(
      (question) => `- ${question.id}：${question.question}`
    ).join('\n')
    : '暂无问题。';
  return matter.stringify([
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
