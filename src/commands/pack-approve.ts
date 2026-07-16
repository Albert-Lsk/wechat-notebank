import * as fs from 'fs-extra';
import matter from 'gray-matter';
import * as path from 'path';
import { PackApproveArgs } from '../lib/cli';
import { CommandError, getErrorMessage } from '../lib/command-error';
import {
  commitFileTransaction,
  FileTransactionConflictError,
  FileTransactionHooks,
  FileTransactionPreconditionError,
  FileWrite,
} from '../lib/file-transaction';
import {
  renderAtomicNote,
  renderPublicationLinks,
  sha256Content,
} from '../lib/pack-publication';
import { atomicNoteFilePath, toWikiPath } from '../lib/pack-paths';
import {
  LocatedPackState,
  locatePackState,
  PackState,
  PublishedOutput,
  serializePackState,
} from '../lib/pack-state';
import {
  updatePackPublication,
  upsertDerivedLink,
  withoutDerivedRegion,
} from '../lib/pack-render';
import { planSharedMaterialsPublication } from '../lib/shared-materials';
import { planSharedReflectionPublication } from '../lib/shared-reflections';
import { withSourceUrlLock } from '../lib/storage';

export interface PackApproveResult {
  action: 'publish' | 'reuse';
  packId: string;
  revision: number;
  status: 'partial' | 'approved';
  approvedItems: string[];
  publishedFiles: string[];
  packFile: string;
  stateFile: string;
}

export async function approvePackCommand(
  args: PackApproveArgs,
  transactionHooks: FileTransactionHooks = {}
): Promise<PackApproveResult> {
  const packFile = path.resolve(args.packFile);
  const initial = await locatePack(packFile);
  return withSourceUrlLock(initial.vaultRoot, initial.state.manifest.sourceUrl, async () => {
    const current = await locatePack(packFile);
    if (current.state.packId !== initial.state.packId) {
      throw new CommandError('PACK_ALREADY_EXISTS', '加工包状态在获取锁期间发生变化');
    }
    return approvePackLocked(current, args.items, transactionHooks);
  });
}

async function approvePackLocked(
  located: LocatedPackState,
  requestedItems: string[],
  transactionHooks: FileTransactionHooks
): Promise<PackApproveResult> {
  const { state, stateFile, vaultRoot } = located;
  const candidates = candidateIds(state);
  for (const item of requestedItems) {
    if (!candidates.includes(item)) {
      throw new CommandError('MANIFEST_INVALID', `加工包中不存在可审批候选: ${item}`);
    }
  }
  assertL4ApprovalReady(requestedItems, state);

  const approvedSet = new Set([...state.approvedItems, ...requestedItems]);
  const approvedItems = candidates.filter((item) => approvedSet.has(item));
  if (requestedItems.every((item) => state.approvedItems.includes(item))) {
    return approvalResult('reuse', state, stateFile);
  }

  const sourceFile = state.manifest.sourceFile;
  const { sourceContent, packContent, sourceDocument } =
    await loadApprovalDocuments(state);
  if (sourceDocument.data.sourceUrl !== state.manifest.sourceUrl) {
    throw new CommandError('MANIFEST_INVALID', '加工包 sourceUrl 与原文不一致');
  }
  const sourceBody = withoutDerivedRegion(sourceDocument.content);
  const sourceTitle = typeof sourceDocument.data.title === 'string'
    ? sourceDocument.data.title
    : path.basename(sourceFile, path.extname(sourceFile));
  const sourceWikiPath = toWikiPath(vaultRoot, sourceFile);
  const packWikiPath = toWikiPath(vaultRoot, state.packFile);
  const now = new Date().toISOString();
  const outputs = [...state.outputs];
  const writes: FileWrite[] = [];

  for (const note of state.manifest.atomicNotes.filter(
    (candidate) => requestedItems.includes(candidate.id) &&
      !state.approvedItems.includes(candidate.id)
  )) {
    const file = atomicNoteFilePath(
      vaultRoot,
      sourceFile,
      state.packId,
      state.revision,
      note.id
    );
    const content = renderAtomicNote(
      note,
      state,
      sourceTitle,
      sourceWikiPath,
      packWikiPath,
      now
    );
    writes.push({ target: file, content, expectAbsent: true });
    outputs.push({
      kind: 'L2',
      itemIds: [note.id],
      file,
      sha256: sha256Content(content),
      publishedAt: now,
      updatedAt: now,
    });
  }

  if (addsNewL3(requestedItems, state)) {
    await appendL3Write({
      state,
      vaultRoot,
      sourceTitle,
      sourceWikiPath,
      sourceBody,
      approvedSet,
      outputs,
      writes,
      now,
    });
  }
  if (addsNewL4(requestedItems, state)) {
    const plan = await planSharedReflectionPublication({
      state,
      vaultRoot,
      sourceTitle,
      sourceWikiPath,
      now,
    });
    writes.push(...plan.writes);
    outputs.push(plan.output);
  }
  sortOutputs(outputs, candidates);

  const status: 'partial' | 'approved' =
    candidates.every((item) => approvedSet.has(item))
      ? 'approved'
      : 'partial';
  const publicationLinks = renderPublicationLinks(vaultRoot, outputs, state);
  let sourceWithLinks = sourceContent;
  for (const link of publicationLinks) {
    sourceWithLinks = upsertDerivedLink(sourceWithLinks, link.source);
  }
  const nextPackContent = updatePackPublication(
    packContent,
    status,
    approvedItems,
    publicationLinks.map((link) => link.pack),
    now
  );
  const nextState: PackState = {
    ...state,
    status,
    updatedAt: now,
    approvedItems,
    outputs,
  };
  const revisionStateFile = path.join(
    path.dirname(stateFile),
    'revisions',
    `${state.revision}.json`
  );
  const previousStateContent = serializePackState(state);
  writes.push({
    target: state.packFile,
    content: nextPackContent,
    expectedContent: packContent,
  });
  writes.push({
    target: sourceFile,
    content: sourceWithLinks,
    expectedContent: sourceContent,
  });
  writes.push({
    target: revisionStateFile,
    content: serializePackState(nextState),
    expectedContent: previousStateContent,
  });
  writes.push({
    target: stateFile,
    content: serializePackState(nextState),
    expectedContent: previousStateContent,
  });
  await commitApproval(
    vaultRoot,
    writes,
    transactionHooks,
    new Set(outputs.filter((output) => output.kind !== 'L2').map((output) => output.file))
  );

  return approvalResult('publish', nextState, stateFile);
}

async function loadApprovalDocuments(state: PackState): Promise<{
  sourceContent: string;
  packContent: string;
  sourceDocument: matter.GrayMatterFile<string>;
}> {
  let sourceContent: string;
  try {
    sourceContent = await fs.readFile(state.manifest.sourceFile, 'utf8');
  } catch (error) {
    throw new CommandError(
      'MANIFEST_INVALID',
      `无法读取加工包原文: ${getErrorMessage(error)}`
    );
  }
  let packContent: string;
  try {
    packContent = await fs.readFile(state.packFile, 'utf8');
  } catch (error) {
    throw new CommandError(
      'PACK_ALREADY_EXISTS',
      `无法读取可见加工包: ${getErrorMessage(error)}`
    );
  }
  let sourceDocument: matter.GrayMatterFile<string>;
  try {
    sourceDocument = matter(sourceContent);
  } catch (error) {
    throw new CommandError(
      'MANIFEST_INVALID',
      `原文 Frontmatter 无效: ${getErrorMessage(error)}`
    );
  }
  try {
    const packDocument = matter(packContent);
    if (
      packDocument.data.packId !== state.packId ||
      packDocument.data.revision !== state.revision ||
      packDocument.data.sourceFile !== state.manifest.sourceFile ||
      packDocument.data.sourceUrl !== state.manifest.sourceUrl
    ) {
      throw new Error('可见加工包身份字段与隐藏状态不一致');
    }
  } catch (error) {
    throw new CommandError(
      'PACK_ALREADY_EXISTS',
      `可见加工包 Frontmatter 无效: ${getErrorMessage(error)}`
    );
  }
  return { sourceContent, packContent, sourceDocument };
}

async function appendL3Write(input: {
  state: PackState;
  vaultRoot: string;
  sourceTitle: string;
  sourceWikiPath: string;
  sourceBody: string;
  approvedSet: Set<string>;
  outputs: PublishedOutput[];
  writes: FileWrite[];
  now: string;
}): Promise<void> {
  const plan = await planSharedMaterialsPublication({
    vaultRoot: input.vaultRoot,
    state: input.state,
    sourceTitle: input.sourceTitle,
    sourceWikiPath: input.sourceWikiPath,
    sourceBody: input.sourceBody,
    approvedItems: input.approvedSet,
    now: input.now,
  });
  const existingIndex = input.outputs.findIndex((output) => output.kind === 'L3');
  input.writes.push(...plan.writes);
  if (existingIndex >= 0) {
    input.outputs[existingIndex] = plan.output;
  } else {
    input.outputs.push(plan.output);
  }
}

async function locatePack(packFile: string): Promise<LocatedPackState> {
  try {
    return await locatePackState(packFile);
  } catch (error) {
    throw new CommandError('PACK_ALREADY_EXISTS', getErrorMessage(error));
  }
}

async function commitApproval(
  vaultRoot: string,
  writes: FileWrite[],
  hooks: FileTransactionHooks,
  protectedDerivedFiles: Set<string>
): Promise<void> {
  try {
    await commitFileTransaction(vaultRoot, writes, hooks);
  } catch (error) {
    if (
      error instanceof FileTransactionPreconditionError &&
      protectedDerivedFiles.has(path.resolve(error.target))
    ) {
      throw new CommandError(
        'DERIVED_FILE_MODIFIED',
        `已发布文件被人工修改，拒绝覆盖: ${error.target}`
      );
    }
    if (error instanceof FileTransactionConflictError) {
      throw new CommandError('PACK_ALREADY_EXISTS', getErrorMessage(error));
    }
    throw new CommandError('TRANSACTION_FAILED', getErrorMessage(error));
  }
}

function candidateIds(state: PackState): string[] {
  return [
    ...state.manifest.atomicNotes.map((item) => item.id),
    ...state.manifest.materials.map((item) => item.id),
    ...state.manifest.reviewQuestions.map((item) => item.id),
  ];
}

function addsNewL3(requestedItems: string[], state: PackState): boolean {
  return requestedItems.some(
    (item) => item.startsWith('L3-') && !state.approvedItems.includes(item)
  );
}

function addsNewL4(requestedItems: string[], state: PackState): boolean {
  return requestedItems.some(
    (item) => item.startsWith('L4-Q') && !state.approvedItems.includes(item)
  );
}

function assertL4ApprovalReady(requestedItems: string[], state: PackState): void {
  const requestedL4 = requestedItems.filter((item) => item.startsWith('L4-Q'));
  if (requestedL4.length === 0) {
    return;
  }
  const questionIds = state.manifest.reviewQuestions.map((question) => question.id);
  if (
    questionIds.some(
      (questionId) =>
        !state.approvedItems.includes(questionId) && !requestedL4.includes(questionId)
    )
  ) {
    throw new CommandError(
      'MANIFEST_INVALID',
      'L4 必须一次审批当前加工包的全部复盘问题'
    );
  }
  const answers = state.manifest.reviewAnswers;
  if (
    !answers ||
    questionIds.some((questionId) => answers[questionId] === undefined) ||
    !state.manifest.reviewDraft
  ) {
    throw new CommandError(
      'MANIFEST_INVALID',
      'L4 发布需要所有问题的用户原始回答与 Agent 整理稿'
    );
  }
}

function sortOutputs(outputs: PublishedOutput[], candidates: string[]): void {
  const order = new Map(candidates.map((item, index) => [item, index]));
  outputs.sort((left, right) => {
    const leftIndex = Math.min(...left.itemIds.map((item) => order.get(item) ?? Infinity));
    const rightIndex = Math.min(...right.itemIds.map((item) => order.get(item) ?? Infinity));
    return leftIndex - rightIndex;
  });
}

function approvalResult(
  action: 'publish' | 'reuse',
  state: PackState,
  stateFile: string
): PackApproveResult {
  return {
    action,
    packId: state.packId,
    revision: state.revision,
    status: state.status === 'approved' ? 'approved' : 'partial',
    approvedItems: state.approvedItems,
    publishedFiles: state.outputs.map((output) => output.file),
    packFile: state.packFile,
    stateFile,
  };
}
