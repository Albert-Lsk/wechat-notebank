import * as fs from 'fs-extra';
import matter from 'gray-matter';
import * as path from 'path';
import { PackRevokeArgs } from '../lib/cli';
import { CommandError, getErrorMessage } from '../lib/command-error';
import {
  commitFileTransaction,
  FileMutation,
  FileTransactionConflictError,
  FileTransactionHooks,
  FileTransactionPreconditionError,
} from '../lib/file-transaction';
import {
  renderPublicationLinks,
  sha256Content,
} from '../lib/pack-publication';
import { toWikiPath } from '../lib/pack-paths';
import {
  LocatedPackState,
  listSourcePackStates,
  locatePackState,
  PackState,
  PublishedOutput,
  serializePackState,
} from '../lib/pack-state';
import {
  derivedRegionMatches,
  removeDerivedLink,
  publishedRegionMatches,
  revokePackPublication,
  withoutDerivedRegion,
} from '../lib/pack-render';
import { planSharedMaterialsRetraction } from '../lib/shared-materials';
import { planSharedReflectionRetraction } from '../lib/shared-reflections';
import { withSourceUrlLock } from '../lib/storage';
import {
  recoverPackTransactions,
  recoverPackTransactionsForFile,
} from '../lib/pack-recovery';

export interface PackRevokeResult {
  action: 'revoke' | 'reuse';
  packId: string;
  revision: number;
  status: 'revoked';
  approvedItems: string[];
  revokedItems: string[];
  removedFiles: string[];
  publishedFiles: string[];
  packFile: string;
  stateFile: string;
}

export async function revokePackCommand(
  args: PackRevokeArgs,
  transactionHooks: FileTransactionHooks = {}
): Promise<PackRevokeResult> {
  const packFile = path.resolve(args.packFile);
  await recoverPackTransactionsForFile(packFile);
  const initial = await locatePack(packFile);
  return withSourceUrlLock(initial.vaultRoot, initial.state.manifest.sourceUrl, async () => {
    await recoverPackTransactions(initial.vaultRoot);
    const current = await locatePack(packFile);
    if (
      current.state.packId !== initial.state.packId ||
      current.state.revision !== initial.state.revision
    ) {
      throw new CommandError('PACK_ALREADY_EXISTS', '加工包状态在获取锁期间发生变化');
    }
    return revokePackLocked(current, args.items, transactionHooks);
  });
}

async function revokePackLocked(
  located: LocatedPackState,
  requestedItems: string[],
  transactionHooks: FileTransactionHooks
): Promise<PackRevokeResult> {
  const { state, stateFile, vaultRoot } = located;
  const candidates = candidateIds(state);
  for (const item of requestedItems) {
    if (!candidates.includes(item)) {
      throw new CommandError('MANIFEST_INVALID', `加工包中不存在可撤销候选: ${item}`);
    }
    if (!state.approvedItems.includes(item) && !state.revokedItems.includes(item)) {
      throw new CommandError('MANIFEST_INVALID', `候选从未发布，不能撤销: ${item}`);
    }
  }
  const activeItems = requestedItems.filter((item) => state.approvedItems.includes(item));
  if (activeItems.length === 0) {
    return revokeResult('reuse', state, stateFile, []);
  }

  const { sourceContent, packContent } = await loadDocuments(state);
  await assertManagedLinksCurrent(vaultRoot, state, sourceContent, packContent);
  assertL4RetractionIsComplete(activeItems, state);
  const removedL2Outputs = state.outputs.filter(
    (output) => output.kind === 'L2' && activeItems.includes(output.itemIds[0])
  );
  const mutations: FileMutation[] = [];
  const protectedFiles = new Set<string>();
  const removedFiles = new Set(removedL2Outputs.map((output) => output.file));
  for (const output of removedL2Outputs) {
    const content = await loadGeneratedFile(output);
    protectedFiles.add(path.resolve(output.file));
    mutations.push({ target: output.file, delete: true, expectedContent: content });
  }

  const activeSet = new Set(activeItems);
  const approvedItems = state.approvedItems.filter((item) => !activeSet.has(item));
  const revokedSet = new Set([...state.revokedItems, ...activeItems]);
  const revokedItems = candidates.filter((item) => revokedSet.has(item));
  const outputs = state.outputs.filter((output) => output.kind !== 'L2' ||
    !output.itemIds.some((item) => activeSet.has(item)));
  const now = new Date().toISOString();
  const sourceDocument = matter(sourceContent);
  const sourceTitle = typeof sourceDocument.data.title === 'string'
    ? sourceDocument.data.title
    : path.basename(state.manifest.sourceFile, path.extname(state.manifest.sourceFile));
  const sourceWikiPath = toWikiPath(vaultRoot, state.manifest.sourceFile);
  const sourceBody = withoutDerivedRegion(sourceDocument.content);
  const l3OutputIndex = outputs.findIndex((output) => output.kind === 'L3');
  if (activeItems.some((item) => item.startsWith('L3-'))) {
    if (l3OutputIndex < 0) {
      throw new CommandError('MANIFEST_INVALID', '加工包缺少待撤销的 L3 输出');
    }
    const l3Output = outputs[l3OutputIndex];
    const remainingItems = new Set(
      l3Output.itemIds.filter((item) => !activeSet.has(item))
    );
    const plan = await planSharedMaterialsRetraction({
      vaultRoot,
      state,
      sourceTitle,
      sourceWikiPath,
      sourceBody,
      remainingItems,
      now,
    });
    mutations.push(...plan.mutations);
    protectedFiles.add(path.resolve(l3Output.file));
    if (plan.sharedFileRemoved) {
      removedFiles.add(l3Output.file);
    }
    if (plan.output) {
      outputs[l3OutputIndex] = plan.output;
    } else {
      outputs.splice(l3OutputIndex, 1);
    }
  }
  const l4OutputIndex = outputs.findIndex((output) => output.kind === 'L4');
  if (activeItems.some((item) => item.startsWith('L4-Q'))) {
    if (l4OutputIndex < 0) {
      throw new CommandError('MANIFEST_INVALID', '加工包缺少待撤销的 L4 输出');
    }
    const l4Output = outputs[l4OutputIndex];
    const plan = await planSharedReflectionRetraction({
      vaultRoot,
      state,
      sourceTitle,
      sourceWikiPath,
      now,
    });
    mutations.push(...plan.mutations);
    protectedFiles.add(path.resolve(l4Output.file));
    if (plan.sharedFileRemoved) {
      removedFiles.add(l4Output.file);
    }
    outputs.splice(l4OutputIndex, 1);
  }
  assertOutputsCoverApprovedItems(outputs, approvedItems);
  const nextState: PackState = {
    ...state,
    status: 'revoked',
    approvedItems,
    revokedItems,
    outputs,
    revokedAt: state.revokedAt || now,
    updatedAt: now,
  };
  const remainingLinks = renderPublicationLinks(vaultRoot, outputs, nextState);
  let nextSourceContent = sourceContent;
  const removedSourceOutputs = state.outputs.filter((oldOutput) => {
    if (oldOutput.kind === 'L2') {
      return activeSet.has(oldOutput.itemIds[0]);
    }
    return removedFiles.has(oldOutput.file);
  });
  for (const link of renderPublicationLinks(vaultRoot, removedSourceOutputs, state)) {
    nextSourceContent = removeDerivedLink(nextSourceContent, link.source);
  }
  const nextPackContent = revokePackPublication(
    packContent,
    approvedItems,
    revokedItems,
    remainingLinks.map((link) => link.pack),
    nextState.revokedAt!,
    now
  );
  const previousStateContent = serializePackState(state);
  const nextStateContent = serializePackState(nextState);
  const isCurrentRevision = path.basename(stateFile) === 'state.json';
  const revisionStateFile = isCurrentRevision
    ? path.join(path.dirname(stateFile), 'revisions', `${state.revision}.json`)
    : stateFile;
  mutations.push(
    {
      target: state.manifest.sourceFile,
      content: nextSourceContent,
      expectedContent: sourceContent,
    },
    {
      target: state.packFile,
      content: nextPackContent,
      expectedContent: packContent,
    },
    {
      target: revisionStateFile,
      content: nextStateContent,
      expectedContent: previousStateContent,
    }
  );
  if (isCurrentRevision) {
    mutations.push({
      target: stateFile,
      content: nextStateContent,
      expectedContent: previousStateContent,
    });
  }
  await commitRevoke(
    vaultRoot,
    mutations,
    transactionHooks,
    protectedFiles
  );
  return revokeResult(
    'revoke',
    nextState,
    stateFile,
    [...removedFiles]
  );
}

async function loadDocuments(state: PackState): Promise<{
  sourceContent: string;
  packContent: string;
}> {
  let sourceContent: string;
  let packContent: string;
  try {
    [sourceContent, packContent] = await Promise.all([
      fs.readFile(state.manifest.sourceFile, 'utf8'),
      fs.readFile(state.packFile, 'utf8'),
    ]);
  } catch (error) {
    throw new CommandError('PACK_ALREADY_EXISTS', getErrorMessage(error));
  }
  try {
    const sourceDocument = matter(sourceContent);
    const packDocument = matter(packContent);
    if (sourceDocument.data.sourceUrl !== state.manifest.sourceUrl) {
      throw new Error('加工包 sourceUrl 与原文不一致');
    }
    if (
      packDocument.data.packId !== state.packId ||
      packDocument.data.revision !== state.revision ||
      packDocument.data.sourceFile !== state.manifest.sourceFile ||
      packDocument.data.sourceUrl !== state.manifest.sourceUrl
    ) {
      throw new Error('可见加工包身份字段与隐藏状态不一致');
    }
  } catch (error) {
    throw new CommandError('PACK_ALREADY_EXISTS', getErrorMessage(error));
  }
  return { sourceContent, packContent };
}

async function loadGeneratedFile(output: PublishedOutput): Promise<string> {
  try {
    const stat = await fs.lstat(output.file);
    if (stat.isSymbolicLink() || !stat.isFile()) {
      throw new Error('生成文件不是普通文件');
    }
    const content = await fs.readFile(output.file, 'utf8');
    if (sha256Content(content) !== output.sha256) {
      throw new Error('生成文件哈希与发布记录不一致');
    }
    return content;
  } catch (error) {
    throw new CommandError(
      'DERIVED_FILE_MODIFIED',
      `已发布文件缺失或被人工修改，拒绝删除: ${output.file}（${getErrorMessage(error)}）`
    );
  }
}

async function locatePack(packFile: string): Promise<LocatedPackState> {
  try {
    return await locatePackState(packFile, [
      'partial',
      'approved',
      'rejected',
      'revoked',
      'superseded',
    ], true);
  } catch (error) {
    throw new CommandError('PACK_ALREADY_EXISTS', getErrorMessage(error));
  }
}

async function commitRevoke(
  vaultRoot: string,
  mutations: FileMutation[],
  hooks: FileTransactionHooks,
  protectedFiles: Set<string>
): Promise<void> {
  try {
    await commitFileTransaction(vaultRoot, mutations, hooks);
  } catch (error) {
    if (
      error instanceof FileTransactionPreconditionError &&
      protectedFiles.has(path.resolve(error.target))
    ) {
      throw new CommandError(
        'DERIVED_FILE_MODIFIED',
        `已发布文件被人工修改，拒绝删除: ${error.target}`
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

function assertL4RetractionIsComplete(
  activeItems: string[],
  state: PackState
): void {
  const selected = activeItems.filter((item) => item.startsWith('L4-Q'));
  if (selected.length === 0) {
    return;
  }
  const output = state.outputs.find((candidate) => candidate.kind === 'L4');
  if (
    !output ||
    output.itemIds.some((item) => !selected.includes(item)) ||
    selected.some((item) => !output.itemIds.includes(item))
  ) {
    throw new CommandError(
      'MANIFEST_INVALID',
      'L4 必须一次撤销当前加工包的全部复盘问题'
    );
  }
}

function assertOutputsCoverApprovedItems(
  outputs: PublishedOutput[],
  approvedItems: string[]
): void {
  const outputItems = outputs.flatMap((output) => output.itemIds);
  if (
    outputItems.length !== approvedItems.length ||
    approvedItems.some((item) => !outputItems.includes(item))
  ) {
    throw new CommandError('MANIFEST_INVALID', '加工包输出与待撤销候选不一致');
  }
}

async function assertManagedLinksCurrent(
  vaultRoot: string,
  state: PackState,
  sourceContent: string,
  packContent: string
): Promise<void> {
  try {
    const storedStates = await listSourcePackStates(
      vaultRoot,
      state.manifest.sourceFile,
      state.manifest.sourceUrl
    );
    const expectedSourceLinks = new Set<string>();
    for (const stored of storedStates) {
      const storedState = stored.state;
      expectedSourceLinks.add(
        `- 待审核加工包：[[${toWikiPath(vaultRoot, storedState.packFile)}` +
        `|待审核加工包 r${storedState.revision}]]`
      );
      for (const link of renderPublicationLinks(
        vaultRoot,
        storedState.outputs,
        storedState
      )) {
        expectedSourceLinks.add(link.source);
      }
    }
    if (!derivedRegionMatches(sourceContent, [...expectedSourceLinks])) {
      throw new Error('原文衍生内容受控区域与隐藏状态不一致');
    }
    const packLinks = renderPublicationLinks(vaultRoot, state.outputs, state)
      .map((link) => link.pack);
    if (!publishedRegionMatches(packContent, packLinks)) {
      throw new Error('加工包已发布内容受控区域与隐藏状态不一致');
    }
  } catch (error) {
    throw new CommandError(
      'PACK_ALREADY_EXISTS',
      `受控双链存在人工漂移，请先运行 doctor: ${getErrorMessage(error)}`
    );
  }
}

function revokeResult(
  action: 'revoke' | 'reuse',
  state: PackState,
  stateFile: string,
  removedFiles: string[]
): PackRevokeResult {
  return {
    action,
    packId: state.packId,
    revision: state.revision,
    status: 'revoked',
    approvedItems: state.approvedItems,
    revokedItems: state.revokedItems,
    removedFiles,
    publishedFiles: state.outputs.map((output) => output.file),
    packFile: state.packFile,
    stateFile,
  };
}
