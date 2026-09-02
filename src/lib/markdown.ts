import { NodeHtmlMarkdown } from 'node-html-markdown';

/**
 * 把 cleanHtml 之后的正文 HTML 转换为真 Markdown（v0.3.0，T9）。
 *
 * 选型实测记录（2026-08-15，turndown 7.2.4 vs node-html-markdown 2.0.0）：
 * - 嵌套列表、`pre>code` 的 `language-*` 保留为围栏语言、`strong`/`em`
 *   与字面 Markdown 符号转义、微信 section 嵌套汤的段落划分：
 *   两者输出等价且全部正确。
 * - 表格：node-html-markdown 原生输出 GFM 表格；turndown 核心会把表格
 *   拆成散落的裸文本，需要额外引入 turndown-plugin-gfm。
 * - 类型：node-html-markdown 自带 .d.ts；turndown 需额外的
 *   devDependency @types/turndown。
 * - 传递依赖体积：node-html-markdown → node-html-parser 链约 0.4MB；
 *   turndown → @mixmark-io/domino 链约 8.8MB。
 * 结论：选 node-html-markdown。
 *
 * 微信特例无需额外预处理：`section` 在该库中默认按块级元素处理，嵌套
 * 包裹层不会造成段落粘连（实测用例见
 * tests/fixtures/wechat-section-soup.html）。
 */
const translator = new NodeHtmlMarkdown({
  codeBlockStyle: 'fenced',
});

/**
 * 转换正文 HTML 为 Markdown。返回去掉首尾空白后的结果；
 * 空输入返回空字符串。
 */
export function convertArticleHtmlToMarkdown(html: string): string {
  return translator.translate(html).trim();
}
