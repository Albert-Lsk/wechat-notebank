import * as fs from 'fs-extra';
import matter from 'gray-matter';
import * as path from 'path';
import { CommandError, getErrorMessage } from './command-error';
import { FileWrite } from './file-transaction';
import { validateQuotes } from './pack-manifest';
import {
  materialsFilePath,
  materialsStateFilePath,
  toWikiPath,
} from './pack-paths';
import {
  MaterialPublication,
  renderMaterials,
  sha256Content,
} from './pack-publication';
import {
  listSourcePackStates,
  packStateKey,
  PackState,
  PublishedOutput,
  StoredPackState,
} from './pack-state';

interface PublicationIndexEntry {
  packId: string;
  revision: number;
  itemIds: string[];
  packFile: string;
  publishedAt: string;
}

interface SharedMaterialsState {
  schemaVersion: 1;
  sourceFile: string;
  sourceUrl: string;
  file: string;
  sha256: string;
  publications: PublicationIndexEntry[];
  createdAt: string;
  updatedAt: string;
}

interface LoadedSharedMaterials {
  state: SharedMaterialsState;
  stateContent: string;
  fileContent: string;
}

export interface SharedMaterialsPlan {
  output: PublishedOutput;
  writes: FileWrite[];
}

export async function planSharedMaterialsPublication(input: {
  vaultRoot: string;
  state: PackState;
  sourceTitle: string;
  sourceWikiPath: string;
  sourceBody: string;
  approvedItems: Set<string>;
  now: string;
}): Promise<SharedMaterialsPlan> {
  const { state, vaultRoot } = input;
  const file = materialsFilePath(
    vaultRoot,
    state.manifest.sourceFile,
    state.manifest.sourceUrl
  );
  const stateFile = materialsStateFilePath(vaultRoot, state.manifest.sourceUrl);
  const existing = await loadSharedMaterials(
    stateFile,
    file,
    state.manifest.sourceFile,
    state.manifest.sourceUrl
  );
  const storedStates = await loadSourcePackStates(
    vaultRoot,
    state.manifest.sourceFile,
    state.manifest.sourceUrl
  );
  const currentKey = packStateKey(state);
  if (!storedStates.some((stored) => packStateKey(stored.state) === currentKey)) {
    throw new CommandError('PACK_ALREADY_EXISTS', '找不到当前加工包的 revision 状态');
  }
  const publishedStates = storedStates.filter(
    (stored) => stored.state.outputs.some((output) => output.kind === 'L3')
  );
  const currentIndex = publicationIndex(publishedStates);
  if (existing) {
    if (JSON.stringify(existing.state.publications) !== JSON.stringify(currentIndex)) {
      throw new CommandError('PACK_ALREADY_EXISTS', '共享 L3 的贡献清单与隐藏状态不一致');
    }
    validateMaterialFrontmatter(existing.fileContent, existing.state);
  } else if (publishedStates.length > 0) {
    throw new CommandError('PACK_ALREADY_EXISTS', '共享 L3 状态缺失，拒绝覆盖既有发布记录');
  }

  const existingOutput = state.outputs.find((output) => output.kind === 'L3');
  const materials = state.manifest.materials.filter(
    (material) => input.approvedItems.has(material.id)
  );
  const output: PublishedOutput = {
    kind: 'L3',
    itemIds: materials.map((material) => material.id),
    file,
    sha256: '',
    publishedAt: existingOutput?.publishedAt || input.now,
    updatedAt: input.now,
  };
  const publications = publishedStates
    .filter((stored) => packStateKey(stored.state) !== currentKey)
    .map((stored) => materialPublication(stored.state, vaultRoot))
    .concat({
      state,
      materials,
      packWikiPath: toWikiPath(vaultRoot, state.packFile),
      publishedAt: output.publishedAt,
    })
    .sort((left, right) => publicationOrder(left.state, right.state));
  validateQuotes(
    publications.flatMap((publication) => publication.materials),
    input.sourceBody
  );
  const content = renderMaterials(
    publications,
    input.sourceTitle,
    input.sourceWikiPath,
    publications.map((publication) => publication.publishedAt).sort()[0],
    input.now
  );
  output.sha256 = sha256Content(content);
  const nextState: SharedMaterialsState = {
    schemaVersion: 1,
    sourceFile: state.manifest.sourceFile,
    sourceUrl: state.manifest.sourceUrl,
    file,
    sha256: output.sha256,
    publications: publications.map((publication) => publicationIndexEntry(
      publication.state,
      publication.materials.map((material) => material.id),
      publication.publishedAt
    )),
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

async function loadSharedMaterials(
  stateFile: string,
  file: string,
  sourceFile: string,
  sourceUrl: string
): Promise<LoadedSharedMaterials | null> {
  const [stateStat, fileStat] = await Promise.all([
    lstatIfExists(stateFile),
    lstatIfExists(file),
  ]);
  if (!stateStat && !fileStat) {
    return null;
  }
  if (!stateStat || !fileStat) {
    throw new CommandError('PACK_ALREADY_EXISTS', '共享 L3 文件与隐藏状态不完整');
  }
  if (
    stateStat.isSymbolicLink() ||
    !stateStat.isFile() ||
    fileStat.isSymbolicLink() ||
    !fileStat.isFile()
  ) {
    throw new CommandError('PACK_ALREADY_EXISTS', '共享 L3 文件与隐藏状态必须是普通文件');
  }
  let stateContent: string;
  let fileContent: string;
  try {
    [stateContent, fileContent] = await Promise.all([
      fs.readFile(stateFile, 'utf8'),
      fs.readFile(file, 'utf8'),
    ]);
  } catch (error) {
    throw new CommandError('PACK_ALREADY_EXISTS', getErrorMessage(error));
  }
  let value: unknown;
  try {
    value = JSON.parse(stateContent);
  } catch (error) {
    throw new CommandError(
      'PACK_ALREADY_EXISTS',
      `共享 L3 状态 JSON 无效: ${getErrorMessage(error)}`
    );
  }
  const state = validateSharedMaterialsState(value, {
    stateFile,
    file,
    sourceFile,
    sourceUrl,
  });
  if (sha256Content(fileContent) !== state.sha256) {
    throw new CommandError(
      'DERIVED_FILE_MODIFIED',
      `已发布文件被人工修改，拒绝覆盖: ${file}`
    );
  }
  return { state, stateContent, fileContent };
}

function validateSharedMaterialsState(
  value: unknown,
  expected: {
    stateFile: string;
    file: string;
    sourceFile: string;
    sourceUrl: string;
  }
): SharedMaterialsState {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new CommandError('PACK_ALREADY_EXISTS', '共享 L3 状态必须是对象');
  }
  const state = value as Record<string, unknown>;
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
  if (
    Object.keys(state).length !== fields.length ||
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
    !state.updatedAt
  ) {
    throw new CommandError(
      'PACK_ALREADY_EXISTS',
      `共享 L3 状态无效: ${expected.stateFile}`
    );
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

function validateMaterialFrontmatter(
  content: string,
  state: SharedMaterialsState
): void {
  let document: matter.GrayMatterFile<string>;
  try {
    document = matter(content);
  } catch (error) {
    throw new CommandError(
      'PACK_ALREADY_EXISTS',
      `共享 L3 Frontmatter 无效: ${getErrorMessage(error)}`
    );
  }
  if (
    document.data.sourceFile !== state.sourceFile ||
    document.data.sourceUrl !== state.sourceUrl ||
    JSON.stringify(normalizePublicationIndex(document.data.publications)) !==
      JSON.stringify(state.publications)
  ) {
    throw new CommandError('PACK_ALREADY_EXISTS', '共享 L3 Frontmatter 与隐藏状态不一致');
  }
}

function normalizePublicationIndex(value: unknown): PublicationIndexEntry[] {
  if (!Array.isArray(value)) {
    throw new CommandError('PACK_ALREADY_EXISTS', '共享 L3 缺少 publications 清单');
  }
  return value.map((entry, index) => {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
      throw new CommandError('PACK_ALREADY_EXISTS', `共享 L3 publications[${index}] 无效`);
    }
    const record = entry as Record<string, unknown>;
    const fields = ['packId', 'revision', 'itemIds', 'packFile', 'publishedAt'];
    if (
      Object.keys(record).length !== fields.length ||
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
      !record.publishedAt
    ) {
      throw new CommandError('PACK_ALREADY_EXISTS', `共享 L3 publications[${index}] 无效`);
    }
    return {
      packId: record.packId,
      revision: Number(record.revision),
      itemIds: [...record.itemIds] as string[],
      packFile: path.resolve(record.packFile),
      publishedAt: record.publishedAt,
    };
  });
}

function publicationIndex(states: StoredPackState[]): PublicationIndexEntry[] {
  return [...states]
    .sort((left, right) => publicationOrder(left.state, right.state))
    .map((stored) => publicationIndexEntry(stored.state));
}

function publicationIndexEntry(
  state: PackState,
  itemIds?: string[],
  publishedAt?: string
): PublicationIndexEntry {
  const output = state.outputs.find((candidate) => candidate.kind === 'L3');
  if ((!itemIds || !publishedAt) && !output) {
    throw new Error('内部错误：加工包缺少 L3 输出');
  }
  return {
    packId: state.packId,
    revision: state.revision,
    itemIds: itemIds || output!.itemIds,
    packFile: state.packFile,
    publishedAt: publishedAt || output!.publishedAt,
  };
}

function materialPublication(state: PackState, vaultRoot: string): MaterialPublication {
  const output = state.outputs.find((candidate) => candidate.kind === 'L3');
  if (!output) {
    throw new Error('内部错误：加工包缺少 L3 输出');
  }
  const selected = new Set(output.itemIds);
  return {
    state,
    materials: state.manifest.materials.filter((material) => selected.has(material.id)),
    packWikiPath: toWikiPath(vaultRoot, state.packFile),
    publishedAt: output.publishedAt,
  };
}

function publicationOrder(left: PackState, right: PackState): number {
  return left.createdAt.localeCompare(right.createdAt) ||
    packStateKey(left).localeCompare(packStateKey(right));
}

async function loadSourcePackStates(
  vaultRoot: string,
  sourceFile: string,
  sourceUrl: string
): Promise<StoredPackState[]> {
  try {
    return await listSourcePackStates(vaultRoot, sourceFile, sourceUrl);
  } catch (error) {
    throw new CommandError('PACK_ALREADY_EXISTS', getErrorMessage(error));
  }
}

function serializeSharedMaterialsState(state: SharedMaterialsState): string {
  return `${JSON.stringify(state, null, 2)}\n`;
}

async function lstatIfExists(target: string): Promise<fs.Stats | null> {
  try {
    return await fs.lstat(target);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return null;
    }
    throw new CommandError('PACK_ALREADY_EXISTS', getErrorMessage(error));
  }
}
