const assert = require('assert');
const fs = require('fs');
const path = require('path');
const {
  parseSogouResults,
  detectAntispider,
  hasSogouResultPageSkeleton,
  detectSogouResultPageSkeleton,
  inspectSogouResultPage,
} = require('../dist/lib/sogou');

const fixture = (name) => fs.readFileSync(
  path.join(__dirname, 'fixtures', name),
  'utf8'
);

const resultsHtml = fixture('sogou-search-results.html');
const results = parseSogouResults(resultsHtml);

assert.deepStrictEqual(results, [
  {
    title: '第一篇文章：从想法到实践',
    rawLink: 'https://weixin.sogou.com/link?url=article-one',
    account: '饼干哥哥AGI',
    pubDate: '2026-03-09',
  },
  {
    title: '另一篇文章',
    rawLink: 'https://weixin.sogou.com/link?url=article-two',
    account: '其他公众号',
    pubDate: '2026-03-08',
  },
  {
    title: '第三篇文章',
    rawLink: 'https://weixin.sogou.com/link?url=article-three',
    account: '饼干哥哥AGI',
    pubDate: '2026-03-09',
  },
]);

// A caller can apply the exact account filter without the parser silently
// dropping results from other accounts.
assert.deepStrictEqual(
  results.filter((item) => item.account === '饼干哥哥AGI').map((item) => item.title),
  ['第一篇文章：从想法到实践', '第三篇文章']
);

assert.strictEqual(hasSogouResultPageSkeleton(resultsHtml), true);
assert.strictEqual(detectSogouResultPageSkeleton(resultsHtml), true);
assert.deepStrictEqual(inspectSogouResultPage(resultsHtml), {
  hasSkeleton: true,
  itemCount: 3,
});

// The result-page shell may be present while no result blocks are returned.
const emptyResultsHtml = `
  <html><body>
    <div id="sogou_vr_11002601"><ul class="news-list"></ul></div>
  </body></html>
`;
assert.strictEqual(hasSogouResultPageSkeleton(emptyResultsHtml), true);
assert.deepStrictEqual(parseSogouResults(emptyResultsHtml), []);
assert.deepStrictEqual(inspectSogouResultPage(emptyResultsHtml), {
  hasSkeleton: true,
  itemCount: 0,
});

// A page with neither the known shell nor result blocks is a DOM-change /
// unavailable signal, not a legitimate empty result.
const changedHtml = '<html><body><div class="new-layout">No results</div></body></html>';
assert.strictEqual(hasSogouResultPageSkeleton(changedHtml), false);
assert.strictEqual(detectSogouResultPageSkeleton(changedHtml), false);
assert.deepStrictEqual(inspectSogouResultPage(changedHtml), {
  hasSkeleton: false,
  itemCount: 0,
});

const antiSpiderHtml = fixture('sogou-antispider.html');
assert.strictEqual(
  detectAntispider('https://weixin.sogou.com/antispider/?from=search', '<html></html>'),
  true
);
assert.strictEqual(
  detectAntispider('https://weixin.sogou.com/weixin?query=x', antiSpiderHtml),
  true
);
assert.strictEqual(
  detectAntispider('https://weixin.sogou.com/weixin?query=x', '<html><body>normal results</body></html>'),
  false
);

// Invalid or missing timestamp markup is represented as an empty date rather
// than making the whole result page unavailable.
const missingDateHtml = `
  <div class="news-list">
    <li id="sogou_vr_11002601_box_9">
      <h3><a href="/link?url=no-date">No date</a></h3>
      <span class="all-time-y2">Account</span>
      <span class="s2">刚刚</span>
    </li>
  </div>
`;
assert.deepStrictEqual(parseSogouResults(missingDateHtml), [{
  title: 'No date',
  rawLink: 'https://weixin.sogou.com/link?url=no-date',
  account: 'Account',
  pubDate: '',
}]);

console.log('sogou parser tests passed');
