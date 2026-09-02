import * as cheerio from 'cheerio';
import * as fs from 'fs-extra';
import * as path from 'path';
import { assertSafeArticleUrl } from './url';

const DEFAULT_IMAGE_TIMEOUT_MS = 30_000;
const MAX_REDIRECTS = 3;
const IMAGE_REFERER = 'https://mp.weixin.qq.com/';
const IMAGE_USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

export interface LocalizeImagesResult {
  content: string;
  total: number;
  downloaded: number;
}

/**
 * 下载正文中的远程图片并改写为文章旁的相对路径。
 *
 * 图片下载是 best-effort 的：单图失败时保留原始 src，不能让整篇文章
 * 因为某个图床不可达而归档失败。安全校验沿用文章抓取的 SSRF 防护，
 * 且手动跟随重定向以便每一跳都重新校验目标地址。
 */
export async function localizeImages(
  contentHtml: string,
  assetsDirAbsPath: string,
  assetsDirName: string
): Promise<LocalizeImagesResult> {
  // isDocument=false 保留调用方传入的 HTML 片段，不凭空包裹 html/head/body。
  const $ = cheerio.load(contentHtml, null, false);
  const images = $('img[src]').toArray();
  let total = 0;
  let downloaded = 0;
  let imageNumber = 0;

  for (const image of images) {
    const source = $(image).attr('src') || '';
    if (/^data:/i.test(source.trim())) {
      continue;
    }

    total += 1;
    imageNumber += 1;
    const local = await downloadImage(
      source,
      assetsDirAbsPath,
      assetsDirName,
      imageNumber
    );
    if (local) {
      $(image).attr('src', local.relativePath);
      downloaded += 1;
    }
  }

  if (downloaded === 0) {
    await removeEmptyDirectory(assetsDirAbsPath);
  }

  return {
    content: $.root().html() || '',
    total,
    downloaded,
  };
}

interface DownloadedImage {
  relativePath: string;
}

async function downloadImage(
  rawSource: string,
  assetsDirAbsPath: string,
  assetsDirName: string,
  imageNumber: number
): Promise<DownloadedImage | null> {
  const source = rawSource.trim();
  let currentUrl: URL;

  try {
    currentUrl = assertSafeArticleUrl(source);
  } catch {
    return null;
  }

  const timeoutMs = readPositiveIntegerEnv(
    'WECHAT_NOTEBANK_IMAGE_TIMEOUT_MS',
    DEFAULT_IMAGE_TIMEOUT_MS
  );
  const signal = AbortSignal.timeout(timeoutMs);
  let response: Response;

  try {
    for (let redirectCount = 0; ; redirectCount += 1) {
      response = await globalThis.fetch(currentUrl.toString(), {
        headers: {
          Referer: IMAGE_REFERER,
          'User-Agent': IMAGE_USER_AGENT,
        },
        redirect: 'manual',
        signal,
      });

      if (response.status < 300 || response.status >= 400) {
        break;
      }

      const location = response.headers.get('location');
      if (!location || redirectCount >= MAX_REDIRECTS) {
        return null;
      }

      let nextUrl: URL;
      try {
        nextUrl = new URL(location, currentUrl);
        assertSafeArticleUrl(nextUrl.toString());
      } catch {
        return null;
      }
      currentUrl = nextUrl;
    }
  } catch {
    return null;
  }

  // 规格只把 HTTP 200 视为成功；例如 204/206 不能冒充完整图片。
  if (response.status !== 200) {
    return null;
  }

  let bytes: Buffer;
  try {
    bytes = Buffer.from(await response.arrayBuffer());
  } catch {
    return null;
  }

  const extension = inferImageExtension(response, currentUrl);
  const filename = `img${imageNumber}.${extension}`;
  const filePath = path.join(assetsDirAbsPath, filename);

  try {
    await fs.ensureDir(assetsDirAbsPath);
    await fs.writeFile(filePath, bytes);
  } catch {
    return null;
  }

  return {
    relativePath: `./${assetsDirName}/${filename}`,
  };
}

function inferImageExtension(response: Response, imageUrl: URL): string {
  const contentType = response.headers.get('content-type') || '';
  const mediaType = contentType.split(';', 1)[0].trim().toLowerCase();
  const fromContentType = extensionForValue(mediaType);
  if (fromContentType) {
    return fromContentType;
  }

  const fromWxFormat = extensionForValue(imageUrl.searchParams.get('wx_fmt') || '');
  return fromWxFormat || 'jpg';
}

function extensionForValue(value: string): string | null {
  switch (value.replace(/^image\//, '').toLowerCase()) {
    case 'jpeg':
    case 'jpg':
      return 'jpg';
    case 'png':
      return 'png';
    case 'gif':
      return 'gif';
    case 'webp':
      return 'webp';
    default:
      return null;
  }
}

function readPositiveIntegerEnv(name: string, fallback: number): number {
  const value = process.env[name];
  if (!value) {
    return fallback;
  }

  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

async function removeEmptyDirectory(directoryPath: string): Promise<void> {
  try {
    const entries = await fs.readdir(directoryPath);
    if (entries.length === 0) {
      await fs.rmdir(directoryPath);
    }
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code !== 'ENOENT' && code !== 'ENOTDIR') {
      // 清理是 best-effort；目录残留不应掩盖正文归档结果。
    }
  }
}
