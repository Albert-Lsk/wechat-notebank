import { fetchArticleHtml, parseWechatArticle, buildMeta } from '../lib/parser';
import { saveArticle } from '../lib/storage';
import { readConfig } from '../lib/config';

export async function fetchCommand(url: string): Promise<void> {
  // 检查配置
  const config = await readConfig();
  if (!config) {
    console.log('❌ 未找到配置文件，请先运行 wechat-notebank init');
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
      config.archivePath,
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
