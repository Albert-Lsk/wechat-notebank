import * as fs from 'fs-extra';
import * as path from 'path';
import matter from 'gray-matter';
import { ArticleMeta } from '../types';

export const FOLDER_L1 = 'L1_原文';      // 公众号文章原文
export const FOLDER_L2 = 'L2_原子卡片';  // 文章的原子想法卡片
export const FOLDER_L3 = 'L3_引用素材';  // 可以直接引用的素材
export const FOLDER_L4 = 'L4_原创文章';  // 根据 L3 素材重新写的文章

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
    .replace(/[^\u4e00-\u9fa5a-zA-Z0-9]/g, '')
    .slice(0, 20);
  return `${datePrefix}-${safeTitle || 'untitled'}.md`;
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
  if (!(await fs.pathExists(archivePath))) {
    return false;
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
      return true;
    }
  }

  return false;
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
