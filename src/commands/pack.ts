import * as fs from 'fs-extra';
import * as path from 'path';
import matter from 'gray-matter';
import { PackCreateArgs } from '../lib/cli';
import { CommandError, getErrorMessage } from '../lib/command-error';
import { FOLDER_L1, withSourceUrlLock } from '../lib/storage';
import {
  commitFileTransaction,
  FileTransactionConflictError,
  FileTransactionHooks,
  FileWrite,
} from '../lib/file-transaction';
import {
  canonicalJson,
  computePackId,
  initialManifestOf,
  InitialManifest,
  normalizeProcessingGoal,
  validateInitialManifest,
  validateQuotes,
} from '../lib/pack-manifest';
import {
  PackState,
  serializePackState,
  validatePackState,
} from '../lib/pack-state';
import { packFilePath, toWikiPath } from '../lib/pack-paths';
import {
  renderPack,
  setPackStatus,
  upsertDerivedLink,
  withoutDerivedRegion,
} from '../lib/pack-render';

export interface PackCreateResult {
  action: 'create' | 'reuse' | 'revise';
  packId: string;
  revision: number;
  status: 'pending' | 'partial' | 'approved';
  sourceFile: string;
  sourceUrl: string;
  processingGoal: string | null;
  packFile: string;
  stateFile: string;
}

export async function createPackCommand(
  args: PackCreateArgs,
  transactionHooks: FileTransactionHooks = {}
): Promise<PackCreateResult> {
  const sourceFile = path.resolve(args.sourceFile);
  const manifestFile = path.resolve(args.manifestFile);
  const initial = await loadPackInputs(sourceFile, manifestFile);
  const vaultRoot = findVaultRoot(sourceFile);
  return withSourceUrlLock(vaultRoot, initial.manifest.sourceUrl, async () => {
    const current = await loadPackInputs(sourceFile, manifestFile);
    if (current.manifest.sourceUrl !== initial.manifest.sourceUrl) {
      throw new CommandError('MANIFEST_INVALID', '源 URL 在获取归档锁期间发生变化');
    }
    return createPackLocked(sourceFile, current, transactionHooks);
  });
}

interface PackInputs {
  sourceContent: string;
  sourceDocument: matter.GrayMatterFile<string>;
  manifest: InitialManifest;
}

async function loadPackInputs(
  sourceFile: string,
  manifestFile: string
): Promise<PackInputs> {
  let sourceContent: string;
  let manifestValue: unknown;
  try {
    [sourceContent, manifestValue] = await Promise.all([
      fs.readFile(sourceFile, 'utf8'),
      fs.readJson(manifestFile),
    ]);
  } catch (error) {
    throw new CommandError('MANIFEST_INVALID', getErrorMessage(error));
  }

  const manifest = validateInitialManifest(manifestValue, sourceFile);
  let sourceDocument: matter.GrayMatterFile<string>;
  try {
    sourceDocument = matter(sourceContent);
  } catch (error) {
    throw new CommandError('MANIFEST_INVALID', `原文 Frontmatter 无效: ${getErrorMessage(error)}`);
  }
  const sourceData = sourceDocument.data as { sourceUrl?: unknown; title?: unknown };
  if (sourceData.sourceUrl !== manifest.sourceUrl) {
    throw new CommandError('MANIFEST_INVALID', 'Manifest sourceUrl 与原文不一致');
  }
  validateQuotes(manifest.materials, withoutDerivedRegion(sourceDocument.content));
  return { sourceContent, sourceDocument, manifest };
}

async function createPackLocked(
  sourceFile: string,
  inputs: PackInputs,
  transactionHooks: FileTransactionHooks
): Promise<PackCreateResult> {
  const { sourceContent, sourceDocument, manifest } = inputs;
  const sourceData = sourceDocument.data as { title?: unknown };
  const processingGoal = normalizeProcessingGoal(manifest.processingGoal);
  const packId = computePackId(manifest.sourceUrl, processingGoal);
  const vaultRoot = findVaultRoot(sourceFile);
  const sourceStem = path.basename(sourceFile, path.extname(sourceFile));
  const stateFile = path.join(
    vaultRoot,
    '.alskai-notebank',
    'packs',
    packId,
    'state.json'
  );
  let existing: PackState | null = null;
  if (await fs.pathExists(stateFile)) {
    try {
      existing = validatePackState(
        await fs.readJson(stateFile),
        {
          vaultRoot,
          expectedPackId: packId,
          expectedSourceFile: sourceFile,
          allowedStatuses: ['pending', 'partial', 'approved'],
        }
      );
    } catch (error) {
      throw new CommandError('PACK_ALREADY_EXISTS', getErrorMessage(error));
    }
    if (canonicalJson(initialManifestOf(existing.manifest)) === canonicalJson(manifest)) {
      if (!(await fs.pathExists(existing.packFile))) {
        throw new CommandError('PACK_ALREADY_EXISTS', '加工包状态存在，但可见文件缺失');
      }
      return {
        action: 'reuse',
        packId,
        revision: existing.revision,
        status: existing.status === 'partial' || existing.status === 'approved'
          ? existing.status
          : 'pending',
        sourceFile,
        sourceUrl: manifest.sourceUrl,
        processingGoal,
        packFile: existing.packFile,
        stateFile,
      };
    }
  }
  const sourceWikiPath = toWikiPath(vaultRoot, sourceFile);
  const revision = existing ? existing.revision + 1 : 1;
  const packFile = packFilePath(vaultRoot, sourceFile, packId, revision);
  const packWikiPath = toWikiPath(vaultRoot, packFile);
  const createdAt = new Date().toISOString();
  const packContent = renderPack({
    packId,
    revision,
    sourceFile,
    sourceUrl: manifest.sourceUrl,
    processingGoal,
    sourceTitle: typeof sourceData.title === 'string' ? sourceData.title : sourceStem,
    sourceWikiPath,
    createdAt,
    manifest,
  });
  const sourceWithLink = upsertDerivedLink(
    sourceContent,
    `- 待审核加工包：[[${packWikiPath}|待审核加工包 r${revision}]]`
  );
  const state: PackState = {
    packId,
    revision,
    status: 'pending',
    packFile,
    createdAt,
    manifest,
    approvedItems: [],
    outputs: [],
  };
  const revisionStateFile = path.join(
    path.dirname(stateFile),
    'revisions',
    `${revision}.json`
  );
  const unexpectedTargets = [packFile, revisionStateFile];
  if (!existing) {
    unexpectedTargets.push(stateFile);
  }
  const occupiedTarget = (
    await Promise.all(unexpectedTargets.map(async (target) => ({
      target,
      exists: await fs.pathExists(target),
    })))
  ).find((candidate) => candidate.exists);
  if (occupiedTarget) {
    throw new CommandError(
      'PACK_ALREADY_EXISTS',
      `加工包目标已存在，拒绝覆盖: ${occupiedTarget.target}`
    );
  }

  const writes: FileWrite[] = [];
  try {
    if (existing) {
      const superseded: PackState = {
        ...existing,
        status: 'superseded',
        supersededAt: createdAt,
      };
      const previousRevisionFile = path.join(
        path.dirname(stateFile),
        'revisions',
        `${existing.revision}.json`
      );
      const previousPackContent = await fs.readFile(existing.packFile, 'utf8');
      writes.push({
        target: existing.packFile,
        content: setPackStatus(previousPackContent, createdAt),
      });
      writes.push({
        target: previousRevisionFile,
        content: serializePackState(superseded),
      });
    }
    writes.push({ target: packFile, content: packContent, expectAbsent: true });
    writes.push({
      target: revisionStateFile,
      content: serializePackState(state),
      expectAbsent: true,
    });
    writes.push({
      target: stateFile,
      content: serializePackState(state),
      expectAbsent: !existing,
    });
    writes.push({ target: sourceFile, content: sourceWithLink });
    await commitFileTransaction(vaultRoot, writes, transactionHooks);
  } catch (error) {
    if (error instanceof FileTransactionConflictError) {
      throw new CommandError('PACK_ALREADY_EXISTS', getErrorMessage(error));
    }
    throw new CommandError('TRANSACTION_FAILED', getErrorMessage(error));
  }

  return {
    action: existing ? 'revise' : 'create',
    packId,
    revision,
    status: 'pending',
    sourceFile,
    sourceUrl: manifest.sourceUrl,
    processingGoal,
    packFile,
    stateFile,
  };
}

function findVaultRoot(sourceFile: string): string {
  const parsed = path.parse(sourceFile);
  const segments = sourceFile.slice(parsed.root.length).split(path.sep);
  const l1Index = segments.lastIndexOf(FOLDER_L1);
  if (l1Index < 0) {
    return path.dirname(sourceFile);
  }
  return path.join(parsed.root, ...segments.slice(0, l1Index));
}
