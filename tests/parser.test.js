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

console.log('parser tests passed');
