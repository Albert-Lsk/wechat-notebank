import { fetchArticleHtml, parseWechatArticle, buildMeta } from '../lib/parser';
import { saveArticle } from '../lib/storage';
import { readConfig } from '../lib/config';
import { WechatNotebankConfig } from '../types';

export async function fetchCommand(url: string, outputPath?: string): Promise<void> {
  // 检查配置
  const config = await readConfig();
  let archivePath: string;
  try {
    archivePath = resolveArchivePath(config, outputPath);
  } catch (error) {
    console.log(`❌ ${error instanceof Error ? error.message : '未知错误'}`);
    return;
  }

  console.log(`📥 正在获取文章: ${url}`);

  try {
    // 获取 HTML
    const html = await fetchArticleHtml(url);

    // 解析文章
    const parseResult = parseWechatArticle(html, url);

    // 构建元数据
    const meta = buildMeta(parseResult, url);

    // 保存文件
    const filePath = await saveArticle(
      archivePath,
      parseResult.title,
      parseResult.content,
      meta
    );

    console.log(`\n✅ 文章已保存！`);
    console.log(`📄 文件: ${filePath}`);
    console.log(`📌 标题: ${meta.title}`);
    console.log(`👤 作者: ${meta.author}`);
    console.log(`📅 发布: ${meta.pubDate}`);
    console.log(`🏷️  来源: ${meta.wechatName}`);
  } catch (error) {
    console.error(`\n❌ 错误: ${error instanceof Error ? error.message : '未知错误'}`);
    process.exit(1);
  }
}

export function resolveArchivePath(
  config: Pick<WechatNotebankConfig, 'archivePath'> | null,
  outputPath?: string
): string {
  if (outputPath) {
    return outputPath;
  }

  if (!config) {
    throw new Error('未找到配置文件，请先运行 wechat-notebank init，或使用 --output <folder> 指定保存目录');
  }

  return config.archivePath;
}
