import * as fs from 'fs-extra';
import matter from 'gray-matter';
import * as path from 'path';
import { PackRejectArgs } from '../lib/cli';
import { CommandError, getErrorMessage } from '../lib/command-error';
import {
  commitFileTransaction,
  FileTransactionConflictError,
  FileTransactionHooks,
  FileWrite,
} from '../lib/file-transaction';
import {
  LocatedPackState,
  locatePackState,
  PackState,
  serializePackState,
} from '../lib/pack-state';
import { rejectPack } from '../lib/pack-render';
import { withSourceUrlLock } from '../lib/storage';
import {
  recoverPackTransactions,
  recoverPackTransactionsForFile,
} from '../lib/pack-recovery';

export interface PackRejectResult {
  action: 'reject' | 'reuse';
  packId: string;
  revision: number;
  status: 'rejected';
  approvedItems: string[];
  publishedFiles: string[];
  packFile: string;
  stateFile: string;
}

export async function rejectPackCommand(
  args: PackRejectArgs,
  transactionHooks: FileTransactionHooks = {}
): Promise<PackRejectResult> {
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
    if (current.state.status === 'rejected') {
      return rejectResult('reuse', current.state, current.stateFile);
    }
    return rejectPackLocked(current, transactionHooks);
  });
}

async function rejectPackLocked(
  located: LocatedPackState,
  transactionHooks: FileTransactionHooks
): Promise<PackRejectResult> {
  const { state, stateFile, vaultRoot } = located;
  const packContent = await loadVisiblePack(state);
  const now = new Date().toISOString();
  const nextState: PackState = {
    ...state,
    status: 'rejected',
    updatedAt: now,
    rejectedAt: now,
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
      content: rejectPack(packContent, now),
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
  return rejectResult('reject', nextState, stateFile);
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
    return await locatePackState(packFile, ['pending', 'partial', 'rejected']);
  } catch (error) {
    throw new CommandError('PACK_ALREADY_EXISTS', getErrorMessage(error));
  }
}

function rejectResult(
  action: 'reject' | 'reuse',
  state: PackState,
  stateFile: string
): PackRejectResult {
  return {
    action,
    packId: state.packId,
    revision: state.revision,
    status: 'rejected',
    approvedItems: state.approvedItems,
    publishedFiles: state.outputs.map((output) => output.file),
    packFile: state.packFile,
    stateFile,
  };
}
