import * as fs from 'fs-extra';
import matter from 'gray-matter';
import * as path from 'path';
import { CommandError, getErrorMessage } from './command-error';
import { FileWrite } from './file-transaction';
import { sha256Content } from './pack-publication';
import {
  listSourcePackStates,
  packStateKey,
  PackState,
  PublishedOutput,
  StoredPackState,
} from './pack-state';

type SharedPublicationKind = 'L3' | 'L4';

export interface SharedPublicationContribution {
  state: PackState;
  publishedAt: string;
}

export interface SharedPublicationAdapter<
  Publication extends SharedPublicationContribution
> {
  kind: SharedPublicationKind;
  label: '共享 L3' | '共享 L4';
  itemIdPattern: RegExp;
  fromStoredState: (state: PackState, vaultRoot: string) => Publication;
  itemIdsOf: (publication: Publication) => string[];
  validatePublications: (publications: Publication[]) => void;
  render: (
    publications: Publication[],
    sourceTitle: string,
    sourceWikiPath: string,
    publishedAt: string,
    updatedAt: string
  ) => string;
}

export interface SharedPublicationPlan {
  output: PublishedOutput;
  writes: FileWrite[];
}

interface PublicationIndexEntry {
  packId: string;
  revision: number;
  itemIds: string[];
  packFile: string;
  publishedAt: string;
}

interface SharedPublicationState {
  schemaVersion: 1;
  sourceFile: string;
  sourceUrl: string;
  file: string;
  sha256: string;
  publications: PublicationIndexEntry[];
  createdAt: string;
  updatedAt: string;
}

interface LoadedSharedPublication {
  state: SharedPublicationState;
  stateContent: string;
  fileContent: string;
}

export async function planSharedPublication<
  Publication extends SharedPublicationContribution
>(input: {
  vaultRoot: string;
  state: PackState;
  file: string;
  stateFile: string;
  sourceTitle: string;
  sourceWikiPath: string;
  now: string;
  currentPublication: Publication;
  adapter: SharedPublicationAdapter<Publication>;
}): Promise<SharedPublicationPlan> {
  const { adapter, state, vaultRoot } = input;
  const existing = await loadSharedPublication({
    stateFile: input.stateFile,
    file: input.file,
    sourceFile: state.manifest.sourceFile,
    sourceUrl: state.manifest.sourceUrl,
    adapter,
  });
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
    (stored) => stored.state.outputs.some((output) => output.kind === adapter.kind)
  );
  const currentIndex = publicationIndex(publishedStates, adapter);
  if (existing) {
    if (JSON.stringify(existing.state.publications) !== JSON.stringify(currentIndex)) {
      throw new CommandError(
        'PACK_ALREADY_EXISTS',
        `${adapter.label} 的贡献清单与隐藏状态不一致`
      );
    }
    validateFrontmatter(existing.fileContent, existing.state, adapter);
  } else if (publishedStates.length > 0) {
    throw new CommandError(
      'PACK_ALREADY_EXISTS',
      `${adapter.label} 状态缺失，拒绝覆盖既有发布记录`
    );
  }

  const publications = publishedStates
    .filter((stored) => packStateKey(stored.state) !== currentKey)
    .map((stored) => adapter.fromStoredState(stored.state, vaultRoot))
    .concat(input.currentPublication)
    .sort((left, right) => publicationOrder(left.state, right.state));
  adapter.validatePublications(publications);
  const content = adapter.render(
    publications,
    input.sourceTitle,
    input.sourceWikiPath,
    publications.map((publication) => publication.publishedAt).sort()[0],
    input.now
  );
  const output: PublishedOutput = {
    kind: adapter.kind,
    itemIds: adapter.itemIdsOf(input.currentPublication),
    file: input.file,
    sha256: sha256Content(content),
    publishedAt: input.currentPublication.publishedAt,
    updatedAt: input.now,
  };
  const nextState: SharedPublicationState = {
    schemaVersion: 1,
    sourceFile: state.manifest.sourceFile,
    sourceUrl: state.manifest.sourceUrl,
    file: input.file,
    sha256: output.sha256,
    publications: publications.map((publication) => publicationIndexEntry(
      publication.state,
      adapter.kind,
      adapter.itemIdsOf(publication),
      publication.publishedAt
    )),
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

async function loadSharedPublication<
  Publication extends SharedPublicationContribution
>(input: {
  stateFile: string;
  file: string;
  sourceFile: string;
  sourceUrl: string;
  adapter: SharedPublicationAdapter<Publication>;
}): Promise<LoadedSharedPublication | null> {
  const [stateStat, fileStat] = await Promise.all([
    lstatIfExists(input.stateFile),
    lstatIfExists(input.file),
  ]);
  if (!stateStat && !fileStat) {
    return null;
  }
  if (!stateStat || !fileStat) {
    throw new CommandError(
      'PACK_ALREADY_EXISTS',
      `${input.adapter.label} 文件与隐藏状态不完整`
    );
  }
  if (
    stateStat.isSymbolicLink() ||
    !stateStat.isFile() ||
    fileStat.isSymbolicLink() ||
    !fileStat.isFile()
  ) {
    throw new CommandError(
      'PACK_ALREADY_EXISTS',
      `${input.adapter.label} 文件与隐藏状态必须是普通文件`
    );
  }
  let stateContent: string;
  let fileContent: string;
  try {
    [stateContent, fileContent] = await Promise.all([
      fs.readFile(input.stateFile, 'utf8'),
      fs.readFile(input.file, 'utf8'),
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
      `${input.adapter.label} 状态 JSON 无效: ${getErrorMessage(error)}`
    );
  }
  const state = validateSharedPublicationState(value, input);
  if (sha256Content(fileContent) !== state.sha256) {
    throw new CommandError(
      'DERIVED_FILE_MODIFIED',
      `已发布文件被人工修改，拒绝覆盖: ${input.file}`
    );
  }
  return { state, stateContent, fileContent };
}

function validateSharedPublicationState<
  Publication extends SharedPublicationContribution
>(
  value: unknown,
  expected: {
    stateFile: string;
    file: string;
    sourceFile: string;
    sourceUrl: string;
    adapter: SharedPublicationAdapter<Publication>;
  }
): SharedPublicationState {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new CommandError(
      'PACK_ALREADY_EXISTS',
      `${expected.adapter.label} 状态必须是对象`
    );
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
      `${expected.adapter.label} 状态无效: ${expected.stateFile}`
    );
  }
  return {
    schemaVersion: 1,
    sourceFile: path.resolve(String(state.sourceFile)),
    sourceUrl: state.sourceUrl,
    file: path.resolve(String(state.file)),
    sha256: state.sha256,
    publications: normalizePublicationIndex(
      state.publications,
      expected.adapter
    ),
    createdAt: state.createdAt,
    updatedAt: state.updatedAt,
  };
}

function validateFrontmatter<Publication extends SharedPublicationContribution>(
  content: string,
  state: SharedPublicationState,
  adapter: SharedPublicationAdapter<Publication>
): void {
  let document: matter.GrayMatterFile<string>;
  try {
    document = matter(content);
  } catch (error) {
    throw new CommandError(
      'PACK_ALREADY_EXISTS',
      `${adapter.label} Frontmatter 无效: ${getErrorMessage(error)}`
    );
  }
  if (
    document.data.sourceFile !== state.sourceFile ||
    document.data.sourceUrl !== state.sourceUrl ||
    JSON.stringify(normalizePublicationIndex(document.data.publications, adapter)) !==
      JSON.stringify(state.publications)
  ) {
    throw new CommandError(
      'PACK_ALREADY_EXISTS',
      `${adapter.label} Frontmatter 与隐藏状态不一致`
    );
  }
}

function normalizePublicationIndex<
  Publication extends SharedPublicationContribution
>(
  value: unknown,
  adapter: SharedPublicationAdapter<Publication>
): PublicationIndexEntry[] {
  if (!Array.isArray(value)) {
    throw new CommandError(
      'PACK_ALREADY_EXISTS',
      `${adapter.label} 缺少 publications 清单`
    );
  }
  return value.map((entry, index) => {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
      throw new CommandError(
        'PACK_ALREADY_EXISTS',
        `${adapter.label} publications[${index}] 无效`
      );
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
      record.itemIds.some(
        (item) => typeof item !== 'string' || !adapter.itemIdPattern.test(item)
      ) ||
      typeof record.packFile !== 'string' ||
      !record.packFile ||
      typeof record.publishedAt !== 'string' ||
      !record.publishedAt
    ) {
      throw new CommandError(
        'PACK_ALREADY_EXISTS',
        `${adapter.label} publications[${index}] 无效`
      );
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

function publicationIndex<Publication extends SharedPublicationContribution>(
  states: StoredPackState[],
  adapter: SharedPublicationAdapter<Publication>
): PublicationIndexEntry[] {
  return [...states]
    .sort((left, right) => publicationOrder(left.state, right.state))
    .map((stored) => publicationIndexEntry(stored.state, adapter.kind));
}

function publicationIndexEntry(
  state: PackState,
  kind: SharedPublicationKind,
  itemIds?: string[],
  publishedAt?: string
): PublicationIndexEntry {
  const output = state.outputs.find((candidate) => candidate.kind === kind);
  if ((!itemIds || !publishedAt) && !output) {
    throw new Error(`内部错误：加工包缺少 ${kind} 输出`);
  }
  return {
    packId: state.packId,
    revision: state.revision,
    itemIds: itemIds || output!.itemIds,
    packFile: state.packFile,
    publishedAt: publishedAt || output!.publishedAt,
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

function serializeSharedPublicationState(state: SharedPublicationState): string {
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
