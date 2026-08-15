const assert = require('assert');
const fs = require('fs');
const path = require('path');
const {
  parseColumnPage,
  extractWeixinUrl,
  isMirrorColumnUrl,
  assertMirrorColumnUrl,
} = require('../dist/lib/mirror');

const fixture = (name) => fs.readFileSync(
  path.join(__dirname, 'fixtures', name),
  'utf8'
);

const columnUrl = 'https://www.jintiankansha.me/column/demo';

const page1 = parseColumnPage(fixture('mirror-column-page1.html'), columnUrl);
assert.deepStrictEqual(page1, {
  items: [
    {
      title: '第一篇镜像文章：从列表到直链',
      url: 'https://www.jintiankansha.me/t/article-one',
    },
    {
      title: '同标题只保留第一次出现的文章',
      url: 'https://www.jintiankansha.me/t/article-two',
    },
  ],
  nextPageUrl: 'https://www.jintiankansha.me/column/demo?page=2',
});

// A second page can be consumed without inventing a next-page request.
assert.deepStrictEqual(
  parseColumnPage(fixture('mirror-column-page2.html'), 'https://jintiankansha.me/column/demo?page=2'),
  {
    items: [{
      title: '第二页的历史文章标题',
      url: 'https://jintiankansha.me/t/article-three',
    }],
    nextPageUrl: null,
  }
);

assert.strictEqual(
  extractWeixinUrl(fixture('mirror-article-page.html')),
  'https://mp.weixin.qq.com/s/mirror-article?scene=1&from=mirror'
);
assert.strictEqual(extractWeixinUrl('<html><body>VIP content only</body></html>'), null);
assert.strictEqual(extractWeixinUrl('https://mp.weixin.qq.com/something-that-is-not-an-article'), null);

// Column URLs are restricted to the two public mirror hosts and /column/ paths.
assert.strictEqual(isMirrorColumnUrl(columnUrl), true);
assert.strictEqual(isMirrorColumnUrl('https://jintiankansha.me/column/demo'), true);
assert.strictEqual(isMirrorColumnUrl('https://jintiankansha.me/t/article-one'), false);
assert.strictEqual(isMirrorColumnUrl('https://evil.example/column/demo'), false);
assert.strictEqual(isMirrorColumnUrl('https://www.jintiankansha.me.evil.example/column/demo'), false);
assert.throws(
  () => assertMirrorColumnUrl('https://www.jintiankansha.me/t/article-one'),
  /column/
);
assert.throws(
  () => assertMirrorColumnUrl('not a URL'),
  /专栏链接|column/i
);

console.log('mirror parser tests passed');
