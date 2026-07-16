import * as fs from 'fs-extra';
import * as path from 'path';
import matter from 'gray-matter';
import { PackCreateArgs } from '../lib/cli';
import { CommandError, getErrorMessage } from '../lib/command-error';
import { FOLDER_L1 } from '../lib/storage';
import {
  commitFileTransaction,
  FileTransactionHooks,
  FileWrite,
} from '../lib/file-transaction';
import {
  canonicalJson,
  computePackId,
  InitialManifest,
  normalizeProcessingGoal,
  requireObject,
  validateInitialManifest,
  validateQuotes,
} from '../lib/pack-manifest';
import { renderPack, setPackStatus, upsertDerivedLink } from '../lib/pack-render';

interface PackState {
  packId: string;
  revision: number;
  status: 'pending' | 'superseded';
  packFile: string;
  createdAt: string;
  supersededAt?: string;
  manifest: InitialManifest;
}

export interface PackCreateResult {
  action: 'create' | 'reuse' | 'revise';
  packId: string;
  revision: number;
  status: 'pending';
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
  validateQuotes(manifest.materials, sourceDocument.content);

  const processingGoal = normalizeProcessingGoal(manifest.processingGoal);
  manifest.processingGoal = processingGoal;
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
      existing = validateCurrentPackState(
        await fs.readJson(stateFile),
        packId,
        sourceFile,
        vaultRoot
      );
    } catch (error) {
      throw new CommandError('PACK_ALREADY_EXISTS', getErrorMessage(error));
    }
    if (canonicalJson(existing.manifest) === canonicalJson(manifest)) {
      if (!(await fs.pathExists(existing.packFile))) {
        throw new CommandError('PACK_ALREADY_EXISTS', '加工包状态存在，但可见文件缺失');
      }
      return {
        action: 'reuse',
        packId,
        revision: existing.revision,
        status: existing.status === 'superseded' ? 'pending' : existing.status,
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
  const packFile = path.join(
    vaultRoot,
    'Inbox',
    `${sourceStem}-${packId.slice(0, 12)}-r${revision}.md`
  );
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
  };
  const revisionStateFile = path.join(
    path.dirname(stateFile),
    'revisions',
    `${revision}.json`
  );

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
        content: serializeJson(superseded),
      });
    }
    writes.push({ target: packFile, content: packContent });
    writes.push({ target: revisionStateFile, content: serializeJson(state) });
    writes.push({ target: stateFile, content: serializeJson(state) });
    writes.push({ target: sourceFile, content: sourceWithLink });
    await commitFileTransaction(vaultRoot, writes, transactionHooks);
  } catch (error) {
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

function serializeJson(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function validateCurrentPackState(
  value: unknown,
  packId: string,
  sourceFile: string,
  vaultRoot: string
): PackState {
  const state = requireObject(value, '加工包状态');
  if (state.packId !== packId) {
    throw new Error('加工包状态的 packId 不匹配');
  }
  if (!Number.isInteger(state.revision) || Number(state.revision) < 1) {
    throw new Error('加工包状态的 revision 无效');
  }
  if (state.status !== 'pending') {
    throw new Error('当前加工包状态必须是 pending');
  }
  if (typeof state.packFile !== 'string' || !state.packFile) {
    throw new Error('加工包状态的 packFile 无效');
  }
  const packFile = path.resolve(state.packFile);
  const relativePackFile = path.relative(vaultRoot, packFile);
  if (relativePackFile.startsWith('..') || path.isAbsolute(relativePackFile)) {
    throw new Error('加工包状态的 packFile 超出知识库');
  }
  if (typeof state.createdAt !== 'string' || !state.createdAt) {
    throw new Error('加工包状态的 createdAt 无效');
  }
  const stateManifest = validateInitialManifest(state.manifest, sourceFile);
  return {
    packId,
    revision: Number(state.revision),
    status: 'pending',
    packFile,
    createdAt: state.createdAt,
    manifest: stateManifest,
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

function toWikiPath(vaultRoot: string, filePath: string): string {
  return path.relative(vaultRoot, filePath)
    .replace(/\.md$/i, '')
    .split(path.sep)
    .join('/');
}
