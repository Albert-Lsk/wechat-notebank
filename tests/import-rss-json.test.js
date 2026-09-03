const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const projectRoot = path.resolve(__dirname, '..');
const cliPath = path.join(projectRoot, 'dist', 'index.js');
const mockFetchPath = path.join(__dirname, 'helpers', 'mock-fetch.js');

const fixture = (name) => path.join(__dirname, 'fixtures', name);

// 全部流量由 mock-fetch 接管，不触网；feed 地址用公网示例域名以通过 SSRF 安全闸。
function runImportRss(args, homePath, extraEnv = {}) {
  return spawnSync(process.execPath, [cliPath, 'import-rss', ...args], {
    cwd: homePath,
    encoding: 'utf8',
    env: {
      ...process.env,
      HOME: homePath,
      NODE_OPTIONS: `--require=${mockFetchPath}`,
      ...extraEnv,
    },
  });
}

function parseJson(result) {
  assert.ok(result.stdout, result.stderr);
  return JSON.parse(result.stdout);
}

const tempHome = fs.mkdtempSync(path.join(os.tmpdir(), 'wechat-notebank-import-rss-'));

const UNRESOLVABLE_NOTE =
  '当前 fetch 仅支持微信文章页：resolvable:false 的条目仅供查看，不能交给 fetch 归档';

const rssHtmlMap = JSON.stringify({
  'https://feeds.example.com/all.rss': fixture('feed-sample-rss.xml'),
  'https://feeds.example.com/all.atom': fixture('feed-sample-atom.xml'),
  'https://feeds.example.com/all.json': fixture('feed-sample-json.json'),
  'https://feeds.example.com/broken.rss': fixture('wechat-article.html'),
});

// ── 用例 1：RSS completed 契约（resolvable 标注 + 非微信条目附说明）───────
const rss = runImportRss(['https://feeds.example.com/all.rss', '--json'], tempHome, {
  WECHAT_NOTEBANK_TEST_IMAGE_MAP: rssHtmlMap,
});
assert.strictEqual(rss.status, 0, rss.stderr || rss.stdout);
assert.deepStrictEqual(parseJson(rss), {
  ok: true,
  command: 'import-rss',
  status: 'completed',
  result: {
    feedUrl: 'https://feeds.example.com/all.rss',
    feedKind: 'rss',
    limit: 20,
    items: [
      {
        title: '第一篇：知识库的分层实践',
        link: 'https://mp.weixin.qq.com/s/rss-article-one',
        pubDate: '2026-08-31T08:00:00.000Z',
        resolvable: true,
      },
      {
        title: '独立博客同步：为什么我回到自己的网站写作',
        link: 'https://blog.example.com/posts/back-to-my-site',
        pubDate: '2026-08-30T02:30:00.000Z',
        resolvable: false,
      },
      {
        title: '缺日期的更新说明',
        link: 'https://mp.weixin.qq.com/s/rss-article-three',
        pubDate: null,
        resolvable: true,
      },
    ],
    note: UNRESOLVABLE_NOTE,
  },
});

// ── 用例 2：Atom 契约（相对链接按 feed 地址补全）────────────────────────
const atom = runImportRss(['https://feeds.example.com/all.atom', '--json'], tempHome, {
  WECHAT_NOTEBANK_TEST_IMAGE_MAP: rssHtmlMap,
});
assert.strictEqual(atom.status, 0, atom.stderr || atom.stdout);
const atomOutput = parseJson(atom);
assert.strictEqual(atomOutput.result.feedKind, 'atom');
assert.deepStrictEqual(
  atomOutput.result.items.map((item) => ({ link: item.link, resolvable: item.resolvable })),
  [
    { link: 'https://mp.weixin.qq.com/s/atom-article-one', resolvable: true },
    { link: 'https://blog.example.com/atom-two', resolvable: false },
    { link: 'https://feeds.example.com/entries/relative-3', resolvable: false },
  ]
);
assert.deepStrictEqual(
  atomOutput.result.items.map((item) => item.pubDate),
  ['2026-08-30T08:00:00.000Z', null, null]
);

// ── 用例 3：JSON Feed 契约 ───────────────────────────────────────────────
const jsonFeed = runImportRss(['https://feeds.example.com/all.json', '--json'], tempHome, {
  WECHAT_NOTEBANK_TEST_IMAGE_MAP: rssHtmlMap,
});
assert.strictEqual(jsonFeed.status, 0, jsonFeed.stderr || jsonFeed.stdout);
const jsonOutput = parseJson(jsonFeed);
assert.strictEqual(jsonOutput.result.feedKind, 'json');
assert.deepStrictEqual(jsonOutput.result.items, [
  {
    title: 'JSON Feed 条目：卡片盒笔记法重读',
    link: 'https://mp.weixin.qq.com/s/json-article-one',
    pubDate: '2026-08-29T12:00:00.000Z',
    resolvable: true,
  },
  {
    title: '外部链接条目',
    link: 'https://blog.example.com/posts/json-two',
    pubDate: '2026-08-27T16:00:00.000Z',
    resolvable: false,
  },
  {
    title: '缺日期的 JSON 条目',
    link: 'https://mp.weixin.qq.com/s/json-article-three',
    pubDate: null,
    resolvable: true,
  },
]);

// ── 用例 4：--limit 截断；全部可归档时不附 note 字段 ─────────────────────
const limited = runImportRss(
  ['https://feeds.example.com/all.rss', '--limit', '2', '--json'],
  tempHome,
  { WECHAT_NOTEBANK_TEST_IMAGE_MAP: rssHtmlMap }
);
assert.strictEqual(limited.status, 0, limited.stderr || limited.stdout);
const limitedOutput = parseJson(limited);
assert.strictEqual(limitedOutput.result.limit, 2);
assert.strictEqual(limitedOutput.result.items.length, 2);

const firstOnly = runImportRss(
  ['https://feeds.example.com/all.rss', '--limit', '1', '--json'],
  tempHome,
  { WECHAT_NOTEBANK_TEST_IMAGE_MAP: rssHtmlMap }
);
assert.strictEqual(firstOnly.status, 0, firstOnly.stderr || firstOnly.stdout);
const firstOnlyOutput = parseJson(firstOnly);
assert.ok(firstOnlyOutput.result.items.every((item) => item.resolvable));
assert.strictEqual('note' in firstOnlyOutput.result, false);

// ── 用例 5：--limit 边界（0 / 101 → CLI_USAGE_ERROR）─────────────────────
for (const badLimit of ['0', '101']) {
  const badLimitResult = runImportRss(
    ['https://feeds.example.com/all.rss', '--limit', badLimit, '--json'],
    tempHome
  );
  assert.strictEqual(badLimitResult.status, 1);
  assert.deepStrictEqual(parseJson(badLimitResult), {
    ok: false,
    command: 'import-rss',
    status: 'failed',
    error: {
      code: 'CLI_USAGE_ERROR',
      message: '--limit 必须在 1 到 100 之间',
    },
  });
}

const notIntegerLimit = runImportRss(
  ['https://feeds.example.com/all.rss', '--limit', 'abc', '--json'],
  tempHome
);
assert.strictEqual(notIntegerLimit.status, 1);
assert.match(parseJson(notIntegerLimit).error.message, /--limit requires a positive integer/);

// ── 用例 6：缺 feed 地址 / 未知参数 → CLI_USAGE_ERROR ────────────────────
const missingUrl = runImportRss(['--json'], tempHome);
assert.strictEqual(missingUrl.status, 1);
assert.deepStrictEqual(parseJson(missingUrl), {
  ok: false,
  command: 'import-rss',
  status: 'failed',
  error: {
    code: 'CLI_USAGE_ERROR',
    message: '请提供 feed 链接（RSS/Atom/JSON Feed 源地址）',
  },
});

const unknownOption = runImportRss(
  ['https://feeds.example.com/all.rss', '--bogus', '--json'],
  tempHome
);
assert.strictEqual(unknownOption.status, 1);
assert.match(parseJson(unknownOption).error.message, /Unknown import-rss option: --bogus/);

// ── 用例 7：feed URL 未过 SSRF 安全闸 → CLI_USAGE_ERROR ─────────────────
const unsafeUrl = runImportRss(['http://127.0.0.1:4000/feeds/all.atom', '--json'], tempHome);
assert.strictEqual(unsafeUrl.status, 1);
const unsafeOutput = parseJson(unsafeUrl);
assert.strictEqual(unsafeOutput.error.code, 'CLI_USAGE_ERROR');
assert.match(unsafeOutput.error.message, /拒绝抓取内网 \/ 本地地址/);

// ── 用例 8：feed 不可达（HTTP 403）→ FEED_UNAVAILABLE 逐字断言 ───────────
const unavailable = runImportRss(
  ['https://feeds.example.com/missing.rss', '--json'],
  tempHome,
  { WECHAT_NOTEBANK_TEST_IMAGE_MAP: rssHtmlMap }
);
assert.strictEqual(unavailable.status, 1);
assert.deepStrictEqual(parseJson(unavailable), {
  ok: false,
  command: 'import-rss',
  status: 'failed',
  error: {
    code: 'FEED_UNAVAILABLE',
    message: 'feed 获取失败（HTTP 403）: https://feeds.example.com/missing.rss',
  },
});

// ── 用例 9：返回的是网页不是 feed → FEED_PARSE_FAILED 逐字断言 ───────────
const parseFailed = runImportRss(
  ['https://feeds.example.com/broken.rss', '--json'],
  tempHome,
  { WECHAT_NOTEBANK_TEST_IMAGE_MAP: rssHtmlMap }
);
assert.strictEqual(parseFailed.status, 1);
assert.deepStrictEqual(parseJson(parseFailed), {
  ok: false,
  command: 'import-rss',
  status: 'failed',
  error: {
    code: 'FEED_PARSE_FAILED',
    message: '内容不是可识别的 RSS 2.0 / Atom / JSON Feed 格式',
  },
});

// ── 用例 10：零落盘（目录快照前后一致）────────────────────────────────────
function snapshotDir(root) {
  const entries = [];
  const walk = (dir) => {
    for (const name of fs.readdirSync(dir)) {
      const fullPath = path.join(dir, name);
      const stat = fs.statSync(fullPath);
      entries.push(
        `${path.relative(root, fullPath)}:${stat.isDirectory() ? 'dir' : stat.size}`
      );
      if (stat.isDirectory()) {
        walk(fullPath);
      }
    }
  };
  walk(root);
  return entries.sort();
}

const zeroWriteHome = fs.mkdtempSync(path.join(os.tmpdir(), 'wechat-notebank-import-rss-disk-'));
const before = snapshotDir(zeroWriteHome);
const zeroWrite = runImportRss(['https://feeds.example.com/all.rss', '--json'], zeroWriteHome, {
  WECHAT_NOTEBANK_TEST_IMAGE_MAP: rssHtmlMap,
});
assert.strictEqual(zeroWrite.status, 0, zeroWrite.stderr || zeroWrite.stdout);
const zeroWriteOutput = parseJson(zeroWrite);
assert.strictEqual(zeroWriteOutput.command, 'import-rss');
assert.strictEqual(zeroWriteOutput.status, 'completed');
assert.deepStrictEqual(snapshotDir(zeroWriteHome), before, 'import-rss 不应写任何文件');

// ── 用例 11：非 --json 人类可读输出 ──────────────────────────────────────
const human = runImportRss(['https://feeds.example.com/all.rss'], tempHome, {
  WECHAT_NOTEBANK_TEST_IMAGE_MAP: rssHtmlMap,
});
assert.strictEqual(human.status, 0, human.stderr || human.stdout);
assert.match(human.stdout, /第一篇：知识库的分层实践/);
assert.match(human.stdout, /mp\.weixin\.qq\.com\/s\/rss-article-one/);
assert.match(human.stdout, /不可归档/);
assert.match(human.stdout, /仅支持微信文章页/);

console.log('import-rss json tests passed');
