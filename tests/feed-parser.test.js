const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { parseFeed } = require('../dist/lib/feed');

const fixture = (name) => fs.readFileSync(
  path.join(__dirname, 'fixtures', name),
  'utf8'
);

// ── RSS 2.0：CDATA 中文标题、非微信链接、缺日期 ─────────────────────────
const rss = parseFeed(fixture('feed-sample-rss.xml'));
assert.strictEqual(rss.ok, true, JSON.stringify(rss));
assert.strictEqual(rss.kind, 'rss');
assert.deepStrictEqual(rss.items, [
  {
    title: '第一篇：知识库的分层实践',
    link: 'https://mp.weixin.qq.com/s/rss-article-one',
    pubDate: '2026-08-31T08:00:00.000Z',
  },
  {
    title: '独立博客同步：为什么我回到自己的网站写作',
    link: 'https://blog.example.com/posts/back-to-my-site',
    pubDate: '2026-08-30T02:30:00.000Z',
  },
  {
    title: '缺日期的更新说明',
    link: 'https://mp.weixin.qq.com/s/rss-article-three',
    pubDate: '',
  },
]);

// ── Atom：rel=alternate 链接、published/updated 回退、缺日期、相对链接 ──
const atomBase = 'https://feeds.example.com/all.atom';
const atom = parseFeed(fixture('feed-sample-atom.xml'), atomBase);
assert.strictEqual(atom.ok, true, JSON.stringify(atom));
assert.strictEqual(atom.kind, 'atom');
assert.deepStrictEqual(atom.items, [
  {
    title: 'Atom 条目：检索驱动的写作流',
    link: 'https://mp.weixin.qq.com/s/atom-article-one',
    pubDate: '2026-08-30T08:00:00.000Z',
  },
  {
    title: '外部站点条目（中文标题）',
    link: 'https://blog.example.com/atom-two',
    pubDate: '',
  },
  {
    title: '相对链接条目',
    link: 'https://feeds.example.com/entries/relative-3',
    pubDate: '',
  },
]);

// ── JSON Feed v1：url 链接、date_published、缺日期 ──────────────────────
const json = parseFeed(fixture('feed-sample-json.json'));
assert.strictEqual(json.ok, true, JSON.stringify(json));
assert.strictEqual(json.kind, 'json');
assert.deepStrictEqual(json.items, [
  {
    title: 'JSON Feed 条目：卡片盒笔记法重读',
    link: 'https://mp.weixin.qq.com/s/json-article-one',
    pubDate: '2026-08-29T12:00:00.000Z',
  },
  {
    title: '外部链接条目',
    link: 'https://blog.example.com/posts/json-two',
    pubDate: '2026-08-27T16:00:00.000Z',
  },
  {
    title: '缺日期的 JSON 条目',
    link: 'https://mp.weixin.qq.com/s/json-article-three',
    pubDate: '',
  },
]);

// ── 空 feed 是合法结果（ok:true + 空列表），不是解析失败 ─────────────────
const emptyRss = parseFeed(
  '<?xml version="1.0"?><rss version="2.0"><channel><title>空 feed</title></channel></rss>'
);
assert.deepStrictEqual(emptyRss, { ok: true, kind: 'rss', items: [] });

const emptyJson = parseFeed('{"version":"https://jsonfeed.org/version/1","items":[]}');
assert.deepStrictEqual(emptyJson, { ok: true, kind: 'json', items: [] });

// ── 解析失败返回结构化错误，不抛裸异常 ───────────────────────────────────
const failureCases = [
  ['<html><body>这不是 feed，是普通网页</body></html>'],
  ['普通文本内容，连标签都没有'],
  ['{"name":"有 items 之外的 JSON","other":1}'],
  ['{"version":"https://jsonfeed.org/version/1"}'],
  [''],
  ['<?xml version="1.0"?><rss version="2.0"><weird/></rss>'],
];
for (const [source] of failureCases) {
  const failure = parseFeed(source);
  assert.strictEqual(failure.ok, false, JSON.stringify(failure));
  assert.strictEqual(failure.code, 'FEED_PARSE_FAILED');
  assert.strictEqual(typeof failure.message, 'string');
  assert.ok(failure.message.length > 0, '结构化错误应带说明');
}

// 带 BOM 的 RSS 仍可识别（真实世界 feed 常见）
const bomRss = parseFeed(
  '\uFEFF<?xml version="1.0"?><rss version="2.0"><channel><item><title>标题</title>'
  + '<link>https://mp.weixin.qq.com/s/bom</link></item></channel></rss>'
);
assert.strictEqual(bomRss.ok, true, JSON.stringify(bomRss));
assert.strictEqual(bomRss.items[0].link, 'https://mp.weixin.qq.com/s/bom');

// 无法解析的日期保留原文，不让整条目丢失
const weirdDate = parseFeed(
  '<rss version="2.0"><channel><item><title>日期格式奇怪的条目</title>'
  + '<link>https://mp.weixin.qq.com/s/weird-date</link>'
  + '<pubDate>刚刚</pubDate></item></channel></rss>'
);
assert.strictEqual(weirdDate.ok, true, JSON.stringify(weirdDate));
assert.strictEqual(weirdDate.items[0].pubDate, '刚刚');

console.log('feed parser tests passed');
