import { createHash } from 'crypto';
import matter from 'gray-matter';
import { AtomicNote, Material } from './pack-manifest';
import { toWikiPath } from './pack-paths';
import { PackState, PublishedOutput } from './pack-state';

export interface MaterialPublication {
  state: PackState;
  materials: Material[];
  packWikiPath: string;
  publishedAt: string;
}

export function renderAtomicNote(
  note: AtomicNote,
  state: PackState,
  sourceTitle: string,
  sourceWikiPath: string,
  packWikiPath: string,
  publishedAt: string
): string {
  return matter.stringify([
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

export function renderMaterials(
  publications: MaterialPublication[],
  sourceTitle: string,
  sourceWikiPath: string,
  publishedAt: string,
  updatedAt: string
): string {
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
  return matter.stringify([
    `# 引用素材包：${sourceTitle}`,
    '',
    `原文：[[${sourceWikiPath}|${sourceTitle}]]`,
    '',
    sections,
    '',
  ].join('\n'), {
    layer: 'L3',
    itemIds: publications.flatMap(
      (publication) => publication.materials.map((material) => material.id)
    ),
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

export function renderPublicationLinks(
  vaultRoot: string,
  outputs: PublishedOutput[],
  state: PackState
): Array<{ source: string; pack: string }> {
  const notes = new Map(state.manifest.atomicNotes.map((note) => [note.id, note]));
  return outputs.map((output) => {
    const wikiPath = toWikiPath(vaultRoot, output.file);
    if (output.kind === 'L2') {
      const itemId = output.itemIds[0];
      const title = notes.get(itemId)?.title || itemId;
      const link = `[[${wikiPath}|${itemId} · ${title}]]`;
      return {
        source: `- L2 原子卡片：${link}`,
        pack: `- L2 原子卡片：${link}`,
      };
    }
    const link = `[[${wikiPath}|L3 引用素材包]]`;
    return {
      source: `- L3 引用素材：${link}`,
      pack: `- L3 引用素材：${link}`,
    };
  });
}

export function sha256Content(content: string): string {
  return createHash('sha256').update(content).digest('hex');
}
