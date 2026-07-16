import * as path from 'path';
import { computeSourceId } from './pack-manifest';
import { FOLDER_L2, FOLDER_L3, FOLDER_L4 } from './storage';

export function packFilePath(
  vaultRoot: string,
  sourceFile: string,
  packId: string,
  revision: number
): string {
  return path.join(
    vaultRoot,
    'Inbox',
    `${sourceStem(sourceFile)}-${packId.slice(0, 12)}-r${revision}.md`
  );
}

export function atomicNoteFilePath(
  vaultRoot: string,
  sourceFile: string,
  packId: string,
  revision: number,
  itemId: string
): string {
  return path.join(
    vaultRoot,
    FOLDER_L2,
    `${sourceStem(sourceFile)}-${packId.slice(0, 12)}-r${revision}-${itemId}.md`
  );
}

export function materialsFilePath(
  vaultRoot: string,
  sourceFile: string,
  sourceUrl: string
): string {
  return path.join(
    vaultRoot,
    FOLDER_L3,
    `${sourceStem(sourceFile)}-${computeSourceId(sourceUrl).slice(0, 12)}.md`
  );
}

export function materialsStateFilePath(vaultRoot: string, sourceUrl: string): string {
  return path.join(
    vaultRoot,
    '.alskai-notebank',
    'materials',
    `${computeSourceId(sourceUrl)}.json`
  );
}

export function reflectionFilePath(
  vaultRoot: string,
  sourceFile: string,
  sourceUrl: string
): string {
  return path.join(
    vaultRoot,
    FOLDER_L4,
    `${sourceStem(sourceFile)}-${computeSourceId(sourceUrl).slice(0, 12)}.md`
  );
}

export function reflectionStateFilePath(vaultRoot: string, sourceUrl: string): string {
  return path.join(
    vaultRoot,
    '.alskai-notebank',
    'reflections',
    `${computeSourceId(sourceUrl)}.json`
  );
}

export function toWikiPath(vaultRoot: string, filePath: string): string {
  return path.relative(vaultRoot, filePath)
    .replace(/\.md$/i, '')
    .split(path.sep)
    .join('/');
}

function sourceStem(sourceFile: string): string {
  return path.basename(sourceFile, path.extname(sourceFile));
}
