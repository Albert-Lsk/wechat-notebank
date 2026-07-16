import * as fs from 'fs-extra';
import { promises as nodeFs } from 'fs';
import { createHash } from 'crypto';
import * as path from 'path';
import matter from 'gray-matter';
import { ArticleMeta } from '../types';

const MAX_FILENAME_BYTES = 240;
const SOURCE_LOCK_RETRY_MS = 25;
const SOURCE_LOCK_TIMEOUT_MS = 60_000;
const ABANDONED_LOCK_AGE_MS = 5 * 60_000;

export const FOLDER_L1 = 'L1_原文';      // 公众号文章原文
export const FOLDER_L2 = 'L2_原子卡片';  // 文章的原子想法卡片
export const FOLDER_L3 = 'L3_引用素材';  // 可以直接引用的素材
export const FOLDER_L4 = 'L4_阅读复盘';  // 保留出处，记录自己的理解

export async function ensureDirectories(basePath: string): Promise<void> {
  const dirs = [
    basePath,
    path.join(basePath, FOLDER_L1, 'WeChat'),
    path.join(basePath, FOLDER_L2),
    path.join(basePath, FOLDER_L3),
    path.join(basePath, FOLDER_L4),
  ];

  for (const dir of dirs) {
    await fs.ensureDir(dir);
  }
}

export function generateFilename(title: string, pubDate: string): string {
  const datePrefix = /^\d{4}-\d{2}-\d{2}$/.test(pubDate)
    ? pubDate
    : new Date().toISOString().split('T')[0];
  const safeTitle = title
    .replace(/[^\u4e00-\u9fa5a-zA-Z0-9]/g, '');
  const filenamePrefix = `${datePrefix}-`;
  const filenameExt = '.md';
  const titleByteLimit = MAX_FILENAME_BYTES - Buffer.byteLength(filenamePrefix + filenameExt);
  const safeTitleForFilename = truncateUtf8(safeTitle || 'untitled', titleByteLimit);

  return `${filenamePrefix}${safeTitleForFilename}.md`;
}

function truncateUtf8(value: string, maxBytes: number): string {
  let result = '';

  for (const char of Array.from(value)) {
    if (Buffer.byteLength(result + char) > maxBytes) {
      break;
    }
    result += char;
  }

  return result;
}

export async function saveArticle(
  archivePath: string,
  title: string,
  content: string,
  meta: ArticleMeta
): Promise<string> {
  await fs.ensureDir(archivePath);

  const filename = generateFilename(title, meta.pubDate);
  const filePath = await getAvailableFilePath(archivePath, filename);

  const fileContent = matter.stringify(content, meta);
  await fs.writeFile(filePath, fileContent, 'utf-8');

  return filePath;
}

export async function articleExistsBySourceUrl(
  archivePath: string,
  sourceUrl: string
): Promise<boolean> {
  return (await findArticleBySourceUrl(archivePath, sourceUrl)) !== null;
}

export async function findArticleBySourceUrl(
  archivePath: string,
  sourceUrl: string
): Promise<string | null> {
  if (!(await fs.pathExists(archivePath))) {
    return null;
  }

  const entries = await fs.readdir(archivePath);
  for (const entry of entries) {
    if (path.extname(entry).toLowerCase() !== '.md') {
      continue;
    }

    const filePath = path.join(archivePath, entry);
    const stat = await fs.stat(filePath);
    if (!stat.isFile()) {
      continue;
    }

    const fileContent = await fs.readFile(filePath, 'utf-8');
    const parsed = matter(fileContent);
    if (parsed.data?.sourceUrl === sourceUrl) {
      return filePath;
    }
  }

  return null;
}

export async function withSourceUrlLock<T>(
  archivePath: string,
  sourceUrl: string,
  action: () => Promise<T>
): Promise<T> {
  const lockDirectory = path.join(archivePath, '.alskai-notebank-locks');
  const lockName = createHash('sha256').update(sourceUrl).digest('hex');
  const lockPath = path.join(lockDirectory, `${lockName}.lock`);
  await fs.ensureDir(lockDirectory);

  const startedAt = Date.now();
  let lockHandle;
  while (!lockHandle) {
    try {
      lockHandle = await nodeFs.open(lockPath, 'wx');
      await lockHandle.writeFile(String(process.pid), 'utf8');
    } catch (error) {
      if (!hasErrorCode(error, 'EEXIST')) {
        throw error;
      }
      if (await removeAbandonedLock(lockPath)) {
        continue;
      }
      if (Date.now() - startedAt >= SOURCE_LOCK_TIMEOUT_MS) {
        throw new Error(`等待来源归档锁超时: ${sourceUrl}`);
      }
      await delay(SOURCE_LOCK_RETRY_MS);
    }
  }

  try {
    return await action();
  } finally {
    await lockHandle.close();
    await fs.remove(lockPath);
  }
}

async function removeAbandonedLock(lockPath: string): Promise<boolean> {
  try {
    const [ownerText, stat] = await Promise.all([
      nodeFs.readFile(lockPath, 'utf8'),
      nodeFs.stat(lockPath),
    ]);
    const ownerPid = Number(ownerText);
    const ownerIsGone = Number.isInteger(ownerPid) && ownerPid > 0
      ? !isProcessAlive(ownerPid)
      : Date.now() - stat.mtimeMs >= ABANDONED_LOCK_AGE_MS;
    if (!ownerIsGone) {
      return false;
    }
    await fs.remove(lockPath);
    return true;
  } catch (error) {
    if (hasErrorCode(error, 'ENOENT')) {
      return true;
    }
    return false;
  }
}

function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return !hasErrorCode(error, 'ESRCH');
  }
}

function hasErrorCode(error: unknown, code: string): boolean {
  return Boolean(
    error &&
    typeof error === 'object' &&
    'code' in error &&
    (error as NodeJS.ErrnoException).code === code
  );
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function getAvailableFilePath(archivePath: string, filename: string): Promise<string> {
  const parsed = path.parse(filename);
  let filePath = path.join(archivePath, filename);
  let counter = 2;

  while (await fs.pathExists(filePath)) {
    filePath = path.join(archivePath, `${parsed.name}-${counter}${parsed.ext}`);
    counter++;
  }

  return filePath;
}

export function getL1Path(basePath: string): string {
  return path.join(basePath, FOLDER_L1, 'WeChat');
}
