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

export function generateFilename(title: string): string {
  const timestamp = Date.now();
  const safeTitle = title
    .replace(/[^\u4e00-\u9fa5a-zA-Z0-9]/g, '')
    .slice(0, 20);
  return `${timestamp}-${safeTitle || 'untitled'}.md`;
}

export async function saveArticle(
  archivePath: string,
  title: string,
  content: string,
  meta: ArticleMeta
): Promise<string> {
  const filename = generateFilename(title);
  const filePath = path.join(archivePath, filename);

  const fileContent = matter.stringify(content, meta);
  await fs.writeFile(filePath, fileContent, 'utf-8');

  return filePath;
}

export function getL1Path(basePath: string): string {
  return path.join(basePath, FOLDER_L1, 'WeChat');
}
