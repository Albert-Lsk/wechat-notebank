const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { convertArticleHtmlToMarkdown } = require('../dist/lib/markdown');

const fixture = (name) => fs.readFileSync(
  path.join(__dirname, 'fixtures', name),
  'utf8'
);

// p：段落之间空行分隔
assert.strictEqual(
  convertArticleHtmlToMarkdown('<p>第一段</p><p>第二段</p>'),
  '第一段\n\n第二段'
);

// h1-h6：ATX 风格
assert.strictEqual(
  convertArticleHtmlToMarkdown(
    '<h1>一</h1><h2>二</h2><h3>三</h3><h4>四</h4><h5>五</h5><h6>六</h6>'
  ),
  '# 一\n\n## 二\n\n### 三\n\n#### 四\n\n##### 五\n\n###### 六'
);

// 嵌套 ul-ol：层级与编号正确
assert.strictEqual(
  convertArticleHtmlToMarkdown(
    '<ol><li>first<ul><li>nested a</li><li>nested b<ol><li>deep 1</li></ol></li></ul></li><li>second</li></ol>'
  ),
  '1. first\n  * nested a\n  * nested b\n    1. deep 1\n2. second'
);

// pre>code：language-* class 保留为围栏语言
assert.strictEqual(
  convertArticleHtmlToMarkdown(
    '<pre><code class="language-typescript">const x: number = 1;\nconsole.log(x);</code></pre>'
  ),
  '```typescript\nconst x: number = 1;\nconsole.log(x);\n```'
);

// pre>code：无语言时输出裸围栏
assert.strictEqual(
  convertArticleHtmlToMarkdown('<pre><code>plain code\nline2</code></pre>'),
  '```\nplain code\nline2\n```'
);

// pre>code：代码内容不做 HTML 实体或 Markdown 转义
assert.strictEqual(
  convertArticleHtmlToMarkdown(
    '<pre><code class="language-js">if (a &lt; b &amp;&amp; c &gt; d) { `tpl` }</code></pre>'
  ),
  '```js\nif (a < b && c > d) { `tpl` }\n```'
);

// strong/em：行内样式转换，字面 Markdown 符号被转义
assert.strictEqual(
  convertArticleHtmlToMarkdown(
    '<p>这是<strong>加粗</strong>和<em>斜体</em>，以及字面 *星号* 与 _下划线_ 与 **双星**</p>'
  ),
  '这是**加粗**和_斜体_，以及字面 \\*星号\\* 与 \\_下划线\\_ 与 \\*\\*双星\\*\\*'
);

// 转义边界：正文中常见的 Markdown 符号不破坏结构
assert.strictEqual(
  convertArticleHtmlToMarkdown('<p>价格 1*2*3，公式 a_b_c，路径 [link] 测试</p>'),
  '价格 1\\*2\\*3，公式 a\\_b\\_c，路径 \\[link\\] 测试'
);

// a：绝对与相对链接都保留
assert.strictEqual(
  convertArticleHtmlToMarkdown(
    '<p>见 <a href="https://example.com/post">这篇文章</a> 与 <a href="./other.md">相对链接</a></p>'
  ),
  '见 [这篇文章](https://example.com/post) 与 [相对链接](./other.md)'
);

// img：本地化后的相对路径原样保留
assert.strictEqual(
  convertArticleHtmlToMarkdown(
    '<p>图：</p><p><img src="./2026-08-10-x.assets/img1.jpg" alt="示例"></p>'
  ),
  '图：\n\n![示例](./2026-08-10-x.assets/img1.jpg)'
);

// blockquote：含嵌套
assert.strictEqual(
  convertArticleHtmlToMarkdown(
    '<blockquote><p>外层</p><blockquote><p>内层</p></blockquote></blockquote>'
  ),
  '> 外层\n> \n>> 内层'
);

// 表格：GFM 表格结构保留
assert.strictEqual(
  convertArticleHtmlToMarkdown(
    '<table><thead><tr><th>A</th><th>B</th></tr></thead><tbody><tr><td>1</td><td>2</td></tr></tbody></table>'
  ),
  '| A | B |\n| - | - |\n| 1 | 2 |'
);

// 空输入与纯空白包裹：返回空字符串
assert.strictEqual(convertArticleHtmlToMarkdown(''), '');
assert.strictEqual(
  convertArticleHtmlToMarkdown('<section><section></section></section>'),
  ''
);

// 微信 section 嵌套汤 fixture：段落划分、列表、代码块、相对图片全部正确
assert.strictEqual(
  convertArticleHtmlToMarkdown(fixture('wechat-section-soup.html')),
  [
    '这是**第一段**，含_斜体_与字面 \\*星号\\* 符号。',
    '',
    '第二段，引用他人观点：',
    '',
    '> 引用的内容',
    '',
    '## 一个小标题',
    '',
    '1. 要点一  ',
    '  * 子要点甲',
    '  * 子要点乙',
    '2. 要点二',
    '',
    '![配图](./2026-08-15-section-soup.assets/img1.jpg)',
    '',
    '```javascript',
    'const answer = 42;',
    'console.log(answer);',
    '```',
  ].join('\n')
);

console.log('markdown converter tests passed');
