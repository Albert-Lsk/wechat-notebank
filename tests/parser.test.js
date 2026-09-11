const assert = require('assert');
const { parseWechatArticle } = require('../dist/lib/parser');
const { convertArticleHtmlToMarkdown } = require('../dist/lib/markdown');

const SAMPLE_ARTICLE_URL = 'https://mp.weixin.qq.com/s/example';

function wrapArticle(jsContent) {
  return `
  <html>
    <body>
      <h1 id="activity-name">Article Title</h1>
      <span id="js_name">Account</span>
      <em id="publish_time">2026-05-12</em>
      <div id="js_content">${jsContent}</div>
    </body>
  </html>
`;
}

function parsedCodeText(jsContent) {
  const parsed = parseWechatArticle(wrapArticle(jsContent), SAMPLE_ARTICLE_URL);
  const match = parsed.content.match(/<pre><code(?: class="[^"]*")?>([\s\S]*?)<\/code><\/pre>/);
  assert.ok(match, `expected a clean code block, got: ${parsed.content}`);
  return match[1]
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');
}

const htmlWithChineseDate = `
  <html>
    <body>
      <h1 id="activity-name">Article Title</h1>
      <span id="js_name">Account</span>
      <em id="publish_time">2026年3月9日 23:25</em>
      <div id="js_content"><p>Hello</p></div>
    </body>
  </html>
`;

assert.strictEqual(
  parseWechatArticle(htmlWithChineseDate, 'https://mp.weixin.qq.com/s/example').pubDate,
  '2026-03-09'
);

const htmlWithCtFallback = `
  <html>
    <body>
      <h1 id="activity-name">Article Title</h1>
      <span id="js_name">Account</span>
      <script>var ct = "1773069922";</script>
      <div id="js_content"><p>Hello</p></div>
    </body>
  </html>
`;

assert.strictEqual(
  parseWechatArticle(htmlWithCtFallback, 'https://mp.weixin.qq.com/s/example').pubDate,
  '2026-03-09'
);

const htmlWithWechatCodeBlock = `
  <html>
    <body>
      <h1 id="activity-name">Article Title</h1>
      <span id="js_name">Account</span>
      <em id="publish_time">2026-05-12</em>
      <div id="js_content">
        <p>Before</p>
        <section class="code-snippet__fix code-snippet__js">
          <ul class="code-snippet__line-index"><li></li><li></li></ul>
          <pre class="code-snippet__js" data-lang="bash" style="white-space: normal;">
            <code style="display: flex;"><span leaf="">skill-name/</span></code>
            <code style="display: flex;"><span leaf="">├── SKILL.md &nbsp;<span class="code-snippet__comment"># required</span></span></code>
          </pre>
        </section>
        <p>After</p>
      </div>
    </body>
  </html>
`;

const parsedCodeBlock = parseWechatArticle(
  htmlWithWechatCodeBlock,
  'https://mp.weixin.qq.com/s/example'
);

assert.match(
  parsedCodeBlock.content,
  /<pre><code class="language-bash">skill-name\/\n├── SKILL\.md {2}# required<\/code><\/pre>/
);
assert.ok(!parsedCodeBlock.content.includes('code-snippet__line-index'));
assert.ok(!parsedCodeBlock.content.includes('white-space: normal'));

assert.strictEqual(
  parsedCodeText(
    '<pre><code class="language-javascript"><span>line1</span><br><span>line2</span><br><span>line3</span></code></pre>'
  ),
  'line1\nline2\nline3',
  'case 1: wechat span+br lines'
);

assert.strictEqual(
  parsedCodeText('<pre><code><span>line1</span><br/><span>line2</span><br/><span>line3</span></code></pre>'),
  'line1\nline2\nline3',
  'case 2: self-closing br/'
);

assert.strictEqual(
  parsedCodeText('<pre><code><span>line1</span><br /><span>line2</span><br /><span>line3</span></code></pre>'),
  'line1\nline2\nline3',
  'case 3: br with space before slash'
);

assert.strictEqual(
  parsedCodeText('<pre><code><p>p1</p><p>p2</p></code></pre>'),
  'p1\np2',
  'case 4: adjacent p tags'
);

assert.strictEqual(
  parsedCodeText('<pre><code><p>if (a &lt; b)</p><br>x<br /><p>end</p></code></pre>'),
  'if (a < b)\nx\nend',
  'case 5: mixed p/br with entity decode and no blank line'
);

assert.strictEqual(
  parsedCodeText('<pre><code>a\n\nb</code></pre>'),
  'a\n\nb',
  'case 6: keep legitimate blank line inside code'
);

assert.strictEqual(
  parsedCodeText(`
        <section class="code-snippet__fix code-snippet__js">
          <ul class="code-snippet__line-index"><li></li><li></li></ul>
          <pre class="code-snippet__js" data-lang="bash" style="white-space: normal;">
            <code style="display: flex;"><span leaf="">skill-name/</span></code>
            <code style="display: flex;"><span leaf="">├── SKILL.md &nbsp;<span class="code-snippet__comment"># required</span></span></code>
          </pre>
        </section>
`),
  'skill-name/\n├── SKILL.md  # required',
  'case 7: multi-code join and nbsp stay unchanged'
);

{
  const parsed = parseWechatArticle(
    wrapArticle(
      '<pre><code class="language-javascript"><span>line1</span><br><span>line2</span><br><span>line3</span></code></pre>'
    ),
    SAMPLE_ARTICLE_URL
  );
  const markdown = convertArticleHtmlToMarkdown(parsed.content);
  const fence = markdown.match(/```[^\n]*\n([\s\S]*?)\n```/);
  assert.ok(fence, `case 8: expected a fenced code block, got: ${markdown}`);
  assert.strictEqual(fence[1], 'line1\nline2\nline3', 'case 8: e2e fence has 3 lines');
}

assert.strictEqual(
  parsedCodeText('<pre><code><p>a</p>\n  <p>b</p></code></pre>'),
  'a\nb',
  'case 9: source whitespace between block tags does not become a blank line'
);

console.log('parser tests passed');
