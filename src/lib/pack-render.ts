import matter from 'gray-matter';
import { InitialManifest, PackManifest } from './pack-manifest';
import { CommandError } from './command-error';

const DERIVED_START = '<!-- alskai-notebank:derived:start -->';
const DERIVED_END = '<!-- alskai-notebank:derived:end -->';
const PUBLISHED_START = '<!-- alskai-notebank:published:start -->';
const PUBLISHED_END = '<!-- alskai-notebank:published:end -->';
const REVIEW_START = '<!-- alskai-notebank:review:start -->';
const REVIEW_END = '<!-- alskai-notebank:review:end -->';

export function setPackStatus(content: string, supersededAt: string): string {
  const document = matter(content);
  return matter.stringify(document.content, {
    ...document.data,
    status: 'superseded',
    supersededAt,
  });
}

export function rejectPack(content: string, rejectedAt: string): string {
  const document = matter(content);
  return matter.stringify(document.content, {
    ...document.data,
    status: 'rejected',
    rejectedAt,
    updatedAt: rejectedAt,
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

export function removeDerivedLink(sourceContent: string, link: string): string {
  const region = findDerivedRegion(sourceContent);
  if (!region) {
    return sourceContent;
  }
  const managed = sourceContent.slice(region.start, region.end);
  const lines = managed.split('\n');
  const nextLines = lines.filter((line) => line !== link);
  if (nextLines.length === lines.length) {
    return sourceContent;
  }
  return `${sourceContent.slice(0, region.start)}${nextLines.join('\n')}` +
    `${sourceContent.slice(region.end)}`;
}

export function hasExactDerivedLink(sourceContent: string, link: string): boolean {
  const region = findDerivedRegion(sourceContent);
  if (!region) {
    return false;
  }
  return sourceContent
    .slice(region.start, region.end)
    .split('\n')
    .filter((line) => line === link)
    .length === 1;
}

export function derivedRegionLinkLines(sourceContent: string): string[] {
  const region = findDerivedRegion(sourceContent);
  if (!region) {
    return [];
  }
  return sourceContent
    .slice(region.start, region.end)
    .split('\n')
    .filter((line) => line.startsWith('- '));
}

export function derivedRegionMatches(
  sourceContent: string,
  links: string[]
): boolean {
  const region = findDerivedRegion(sourceContent);
  if (!region) {
    return links.length === 0;
  }
  const lines = sourceContent.slice(region.start, region.endAfter).split('\n');
  if (
    lines[0] !== DERIVED_START ||
    lines[1] !== '## 衍生内容' ||
    lines[lines.length - 1] !== DERIVED_END
  ) {
    return false;
  }
  const actualLinks = lines.slice(2, -1).sort();
  return JSON.stringify(actualLinks) === JSON.stringify([...links].sort());
}

export function withoutDerivedRegion(sourceContent: string): string {
  const region = findDerivedRegion(sourceContent);
  if (!region) {
    return sourceContent;
  }
  return `${sourceContent.slice(0, region.start)}${sourceContent.slice(region.endAfter)}`;
}

export function updatePackPublication(
  packContent: string,
  status: 'partial' | 'approved',
  approvedItems: string[],
  links: string[],
  updatedAt: string
): string {
  const document = matter(packContent);
  const body = upsertManagedRegion(
    document.content,
    PUBLISHED_START,
    PUBLISHED_END,
    ['## 已发布内容', '', ...links].join('\n')
  );
  return matter.stringify(body, {
    ...document.data,
    status,
    approvedItems,
    updatedAt,
  });
}

export function revokePackPublication(
  packContent: string,
  approvedItems: string[],
  revokedItems: string[],
  links: string[],
  revokedAt: string,
  updatedAt: string
): string {
  const document = matter(packContent);
  const body = upsertManagedRegion(
    document.content,
    PUBLISHED_START,
    PUBLISHED_END,
    ['## 已发布内容', '', ...links].join('\n')
  );
  return matter.stringify(body, {
    ...document.data,
    status: 'revoked',
    approvedItems,
    revokedItems,
    revokedAt,
    updatedAt,
  });
}

export function hasExactPublishedLink(packContent: string, link: string): boolean {
  const document = matter(packContent);
  const region = findManagedRegion(
    document.content,
    PUBLISHED_START,
    PUBLISHED_END,
    '加工包已发布内容'
  );
  if (!region) {
    return false;
  }
  return document.content
    .slice(region.start, region.end)
    .split('\n')
    .filter((line) => line === link)
    .length === 1;
}

export function publishedRegionMatches(
  packContent: string,
  links: string[]
): boolean {
  const document = matter(packContent);
  const region = findManagedRegion(
    document.content,
    PUBLISHED_START,
    PUBLISHED_END,
    '加工包已发布内容'
  );
  if (!region) {
    return links.length === 0;
  }
  const expected = [
    PUBLISHED_START,
    '## 已发布内容',
    '',
    ...links,
    PUBLISHED_END,
  ].join('\n');
  return document.content.slice(region.start, region.endAfter) === expected;
}

export function updatePackReview(
  packContent: string,
  manifest: PackManifest,
  updatedAt: string
): string {
  const document = matter(packContent);
  const answers = manifest.reviewQuestions.flatMap((question) => {
    const answer = manifest.reviewAnswers?.[question.id];
    return answer === undefined
      ? []
      : [
        `### ${question.id} · ${question.question}`,
        '',
        answer,
        '',
      ];
  });
  const body = upsertManagedRegion(
    document.content,
    REVIEW_START,
    REVIEW_END,
    [
      '## 用户原始回答',
      '',
      ...(answers.length > 0 ? answers : ['暂无回答。', '']),
      '## Agent 整理稿',
      '',
      manifest.reviewDraft || '尚未生成。',
    ].join('\n')
  );
  return matter.stringify(body, {
    ...document.data,
    updatedAt,
  });
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

function upsertManagedRegion(
  content: string,
  startMarker: string,
  endMarker: string,
  body: string
): string {
  const startCount = content.split(startMarker).length - 1;
  const endCount = content.split(endMarker).length - 1;
  if (startCount === 0 && endCount === 0) {
    const separator = content.endsWith('\n') ? '\n' : '\n\n';
    return `${content}${separator}${startMarker}\n${body}\n${endMarker}\n`;
  }
  if (startCount !== 1 || endCount !== 1) {
    throw new CommandError('MANIFEST_INVALID', '加工包已发布内容受控区域损坏');
  }
  const start = content.indexOf(startMarker);
  const end = content.indexOf(endMarker);
  if (end < start) {
    throw new CommandError('MANIFEST_INVALID', '加工包已发布内容起止标记顺序错误');
  }
  return `${content.slice(0, start)}${startMarker}\n${body}\n${content.slice(end)}`;
}

function findManagedRegion(
  content: string,
  startMarker: string,
  endMarker: string,
  label: string
): { start: number; end: number; endAfter: number } | null {
  const startCount = content.split(startMarker).length - 1;
  const endCount = content.split(endMarker).length - 1;
  if (startCount === 0 && endCount === 0) {
    return null;
  }
  if (startCount !== 1 || endCount !== 1) {
    throw new CommandError('MANIFEST_INVALID', `${label}受控区域损坏`);
  }
  const start = content.indexOf(startMarker);
  const end = content.indexOf(endMarker);
  if (end < start) {
    throw new CommandError('MANIFEST_INVALID', `${label}起止标记顺序错误`);
  }
  return { start, end, endAfter: end + endMarker.length };
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
