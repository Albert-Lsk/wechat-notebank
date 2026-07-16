import * as fs from 'fs-extra';
import matter from 'gray-matter';
import * as path from 'path';
import { PackUpdateArgs } from '../lib/cli';
import { CommandError, getErrorMessage } from '../lib/command-error';
import {
  commitFileTransaction,
  FileTransactionConflictError,
  FileTransactionHooks,
  FileWrite,
} from '../lib/file-transaction';
import {
  canonicalJson,
  initialManifestOf,
  PackManifest,
  validatePackManifest,
} from '../lib/pack-manifest';
import {
  LocatedPackState,
  locatePackState,
  PackState,
  serializePackState,
} from '../lib/pack-state';
import { updatePackReview } from '../lib/pack-render';
import { withSourceUrlLock } from '../lib/storage';

export interface PackUpdateResult {
  action: 'update' | 'reuse';
  packId: string;
  revision: number;
  status: 'pending' | 'partial' | 'approved';
  answeredQuestionIds: string[];
  hasReviewDraft: boolean;
  packFile: string;
  stateFile: string;
}

export async function updatePackCommand(
  args: PackUpdateArgs,
  transactionHooks: FileTransactionHooks = {}
): Promise<PackUpdateResult> {
  const packFile = path.resolve(args.packFile);
  const initial = await locatePack(packFile);
  return withSourceUrlLock(initial.vaultRoot, initial.state.manifest.sourceUrl, async () => {
    const current = await locatePack(packFile);
    if (current.state.packId !== initial.state.packId) {
      throw new CommandError('PACK_ALREADY_EXISTS', '加工包状态在获取锁期间发生变化');
    }
    return updatePackLocked(current, path.resolve(args.manifestFile), transactionHooks);
  });
}

async function updatePackLocked(
  located: LocatedPackState,
  manifestFile: string,
  transactionHooks: FileTransactionHooks
): Promise<PackUpdateResult> {
  const { state, stateFile, vaultRoot } = located;
  const manifest = await loadUpdatedManifest(manifestFile, state);
  assertReviewAnswersPreserved(state.manifest, manifest);
  const packContent = await loadVisiblePack(state);

  if (canonicalJson(state.manifest) === canonicalJson(manifest)) {
    return updateResult('reuse', state, stateFile);
  }
  if (state.outputs.some((output) => output.kind === 'L4')) {
    throw new CommandError(
      'MANIFEST_INVALID',
      '已发布 L4 的回答或整理稿不可直接更新，请创建新 revision'
    );
  }

  const now = new Date().toISOString();
  const nextState: PackState = {
    ...state,
    updatedAt: now,
    manifest,
  };
  const previousStateContent = serializePackState(state);
  const revisionStateFile = path.join(
    path.dirname(stateFile),
    'revisions',
    `${state.revision}.json`
  );
  const writes: FileWrite[] = [
    {
      target: state.packFile,
      content: updatePackReview(packContent, manifest, now),
      expectedContent: packContent,
    },
    {
      target: revisionStateFile,
      content: serializePackState(nextState),
      expectedContent: previousStateContent,
    },
    {
      target: stateFile,
      content: serializePackState(nextState),
      expectedContent: previousStateContent,
    },
  ];
  try {
    await commitFileTransaction(vaultRoot, writes, transactionHooks);
  } catch (error) {
    if (error instanceof FileTransactionConflictError) {
      throw new CommandError('PACK_ALREADY_EXISTS', getErrorMessage(error));
    }
    throw new CommandError('TRANSACTION_FAILED', getErrorMessage(error));
  }
  return updateResult('update', nextState, stateFile);
}

async function loadUpdatedManifest(
  manifestFile: string,
  state: PackState
): Promise<PackManifest> {
  let value: unknown;
  try {
    value = await fs.readJson(manifestFile);
  } catch (error) {
    throw new CommandError('MANIFEST_INVALID', getErrorMessage(error));
  }
  const manifest = validatePackManifest(value, state.manifest.sourceFile);
  if (
    canonicalJson(initialManifestOf(manifest)) !==
    canonicalJson(initialManifestOf(state.manifest))
  ) {
    throw new CommandError(
      'MANIFEST_INVALID',
      '更新加工包时只能追加用户回答或调整 Agent 整理稿'
    );
  }
  return manifest;
}

function assertReviewAnswersPreserved(
  current: PackManifest,
  next: PackManifest
): void {
  for (const [questionId, answer] of Object.entries(current.reviewAnswers || {})) {
    if (next.reviewAnswers?.[questionId] !== answer) {
      throw new CommandError(
        'MANIFEST_INVALID',
        `用户原始回答不可删除或改写: ${questionId}`
      );
    }
  }
}

async function loadVisiblePack(state: PackState): Promise<string> {
  let content: string;
  try {
    content = await fs.readFile(state.packFile, 'utf8');
  } catch (error) {
    throw new CommandError(
      'PACK_ALREADY_EXISTS',
      `无法读取可见加工包: ${getErrorMessage(error)}`
    );
  }
  try {
    const document = matter(content);
    if (
      document.data.packId !== state.packId ||
      document.data.revision !== state.revision ||
      document.data.sourceFile !== state.manifest.sourceFile ||
      document.data.sourceUrl !== state.manifest.sourceUrl
    ) {
      throw new Error('可见加工包身份字段与隐藏状态不一致');
    }
  } catch (error) {
    throw new CommandError(
      'PACK_ALREADY_EXISTS',
      `可见加工包 Frontmatter 无效: ${getErrorMessage(error)}`
    );
  }
  return content;
}

async function locatePack(packFile: string): Promise<LocatedPackState> {
  try {
    return await locatePackState(packFile);
  } catch (error) {
    throw new CommandError('PACK_ALREADY_EXISTS', getErrorMessage(error));
  }
}

function updateResult(
  action: 'update' | 'reuse',
  state: PackState,
  stateFile: string
): PackUpdateResult {
  return {
    action,
    packId: state.packId,
    revision: state.revision,
    status: state.status === 'approved'
      ? 'approved'
      : state.status === 'partial'
        ? 'partial'
        : 'pending',
    answeredQuestionIds: state.manifest.reviewQuestions
      .map((question) => question.id)
      .filter((questionId) => state.manifest.reviewAnswers?.[questionId] !== undefined),
    hasReviewDraft: state.manifest.reviewDraft !== undefined,
    packFile: state.packFile,
    stateFile,
  };
}
