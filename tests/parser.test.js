const assert = require('assert');
const { parseWechatArticle } = require('../dist/lib/parser');

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

console.log('parser tests passed');
