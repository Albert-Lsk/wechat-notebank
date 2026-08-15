const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const projectRoot = path.resolve(__dirname, '..');
const cliPath = path.join(projectRoot, 'dist', 'index.js');
const mockPuppeteerPath = path.join(__dirname, 'helpers', 'mock-puppeteer.js');
const mockFetchPath = path.join(__dirname, 'helpers', 'mock-fetch.js');

const fixture = (name) => path.join(__dirname, 'fixtures', name);

function sogouSearchUrl(query) {
  return `https://weixin.sogou.com/weixin?type=2&query=${encodeURIComponent(query)}`;
}

// 调低节流与直链轮询上限，避免测试真 sleep；全部流量由 mock 接管，不触网。
function runSearch(args, homePath, extraEnv = {}) {
  return spawnSync(process.execPath, [cliPath, 'search', ...args], {
    cwd: homePath,
    encoding: 'utf8',
    env: {
      ...process.env,
      HOME: homePath,
      NODE_OPTIONS: `--require=${mockPuppeteerPath} --require=${mockFetchPath}`,
      WECHAT_NOTEBANK_SEARCH_INTERVAL_MS: '1',
      WECHAT_NOTEBANK_SEARCH_RESOLVE_TIMEOUT_MS: '50',
      ...extraEnv,
    },
  });
}

function parseJson(result) {
  assert.ok(result.stdout, result.stderr);
  return JSON.parse(result.stdout);
}

const tempHome = fs.mkdtempSync(path.join(os.tmpdir(), 'wechat-notebank-search-'));
const tempFixtures = fs.mkdtempSync(path.join(os.tmpdir(), 'wechat-notebank-search-fixtures-'));

// 有骨架无条目 = 正常空结果（区别于 SEARCH_UNAVAILABLE）。
const emptyResultsFixture = path.join(tempFixtures, 'sogou-empty-results.html');
fs.writeFileSync(
  emptyResultsFixture,
  '<html><body><div id="sogou_vr_11002601"><ul class="news-list"></ul></div></body></html>'
);

const sogouHtmlMap = JSON.stringify({
  [sogouSearchUrl('饼干哥哥AGI')]: fixture('sogou-search-results.html'),
});
const sogouRedirectMap = JSON.stringify({
  'https://weixin.sogou.com/link?url=article-one': 'https://mp.weixin.qq.com/s/article-one',
  'https://weixin.sogou.com/link?url=article-two': 'https://mp.weixin.qq.com/s/article-two',
  'https://weixin.sogou.com/link?url=article-three': 'https://mp.weixin.qq.com/s/article-three',
});

// ── 用例 1：sogou completed ──────────────────────────────────────────────
const completed = runSearch(['饼干哥哥AGI', '--json'], tempHome, {
  WECHAT_NOTEBANK_TEST_HTML_MAP: sogouHtmlMap,
  WECHAT_NOTEBANK_TEST_REDIRECT_MAP: sogouRedirectMap,
});
assert.strictEqual(completed.status, 0, completed.stderr || completed.stdout);
assert.deepStrictEqual(parseJson(completed), {
  ok: true,
  command: 'search',
  status: 'completed',
  result: {
    query: '饼干哥哥AGI',
    source: 'sogou',
    account: null,
    limit: 10,
    intervalMs: 1,
    items: [
      {
        title: '第一篇文章：从想法到实践',
        account: '饼干哥哥AGI',
        pubDate: '2026-03-09',
        sourceUrl: 'https://mp.weixin.qq.com/s/article-one',
        resolved: true,
      },
      {
        title: '另一篇文章',
        account: '其他公众号',
        pubDate: '2026-03-08',
        sourceUrl: 'https://mp.weixin.qq.com/s/article-two',
        resolved: true,
      },
      {
        title: '第三篇文章',
        account: '饼干哥哥AGI',
        pubDate: '2026-03-09',
        sourceUrl: 'https://mp.weixin.qq.com/s/article-three',
        resolved: true,
      },
    ],
  },
});
assert.match(completed.stderr, /正在通过搜狗搜索/);

// ── 用例 2：sogou 空结果（ok:true, items:[]）─────────────────────────────
const emptyQuery = '没人叫这个名字的公众号';
const empty = runSearch([emptyQuery, '--json'], tempHome, {
  WECHAT_NOTEBANK_TEST_HTML_MAP: JSON.stringify({
    [sogouSearchUrl(emptyQuery)]: emptyResultsFixture,
  }),
});
assert.strictEqual(empty.status, 0, empty.stderr || empty.stdout);
assert.deepStrictEqual(parseJson(empty), {
  ok: true,
  command: 'search',
  status: 'completed',
  result: {
    query: emptyQuery,
    source: 'sogou',
    account: null,
    limit: 10,
    intervalMs: 1,
    items: [],
  },
});

// ── 用例 3：--account 精确过滤 ───────────────────────────────────────────
const filtered = runSearch(['饼干', '--account', '饼干哥哥AGI', '--json'], tempHome, {
  WECHAT_NOTEBANK_TEST_HTML_MAP: JSON.stringify({
    [sogouSearchUrl('饼干')]: fixture('sogou-search-results.html'),
  }),
  WECHAT_NOTEBANK_TEST_REDIRECT_MAP: sogouRedirectMap,
});
assert.strictEqual(filtered.status, 0, filtered.stderr || filtered.stdout);
const filteredOutput = parseJson(filtered);
assert.strictEqual(filteredOutput.result.account, '饼干哥哥AGI');
assert.deepStrictEqual(
  filteredOutput.result.items.map((item) => item.title),
  ['第一篇文章：从想法到实践', '第三篇文章']
);
assert.ok(filteredOutput.result.items.every((item) => item.account === '饼干哥哥AGI'));
assert.ok(filteredOutput.result.items.every((item) => item.resolved));

// ── 用例 4：--limit 边界（sogou 0 / 11 → CLI_USAGE_ERROR）────────────────
for (const badLimit of ['0', '11']) {
  const badLimitResult = runSearch(['饼干', '--limit', badLimit, '--json'], tempHome);
  assert.strictEqual(badLimitResult.status, 1);
  const badLimitOutput = parseJson(badLimitResult);
  assert.deepStrictEqual(
    {
      ok: badLimitOutput.ok,
      command: badLimitOutput.command,
      status: badLimitOutput.status,
      code: badLimitOutput.error.code,
    },
    { ok: false, command: 'search', status: 'failed', code: 'CLI_USAGE_ERROR' }
  );
  assert.match(badLimitOutput.error.message, /1 到 10/);
}

// mirror 源 limit 上限是 100：101 报错、100 合法（合法性由 mirror 用例覆盖默认值）。
const mirrorLimitResult = runSearch([
  'https://www.jintiankansha.me/column/demo-single',
  '--limit',
  '101',
  '--json',
], tempHome);
assert.strictEqual(mirrorLimitResult.status, 1);
assert.match(parseJson(mirrorLimitResult).error.message, /1 到 100/);

// ── 用例 5：列表页即验证码 → SOGOU_CAPTCHA failed ────────────────────────
const captcha = runSearch(['饼干', '--json'], tempHome, {
  WECHAT_NOTEBANK_TEST_HTML_MAP: JSON.stringify({
    [sogouSearchUrl('饼干')]: fixture('sogou-antispider.html'),
  }),
});
assert.strictEqual(captcha.status, 1);
const captchaOutput = parseJson(captcha);
assert.deepStrictEqual(
  {
    ok: captchaOutput.ok,
    command: captchaOutput.command,
    status: captchaOutput.status,
    code: captchaOutput.error.code,
  },
  { ok: false, command: 'search', status: 'failed', code: 'SOGOU_CAPTCHA' }
);
assert.strictEqual('result' in captchaOutput, false);
assert.match(captchaOutput.error.message, /验证码/);

// ── 用例 6：逐条还原中途验证码 → partial 保留已解析条目 ──────────────────
const partial = runSearch(['饼干哥哥AGI', '--json'], tempHome, {
  WECHAT_NOTEBANK_TEST_HTML_MAP: sogouHtmlMap,
  WECHAT_NOTEBANK_TEST_REDIRECT_MAP: JSON.stringify({
    'https://weixin.sogou.com/link?url=article-one': 'https://mp.weixin.qq.com/s/article-one',
    'https://weixin.sogou.com/link?url=article-two': 'https://weixin.sogou.com/antispider/?from=link',
  }),
});
assert.strictEqual(partial.status, 1);
const partialOutput = parseJson(partial);
assert.strictEqual(partialOutput.ok, false);
assert.strictEqual(partialOutput.command, 'search');
assert.strictEqual(partialOutput.status, 'partial');
assert.strictEqual(partialOutput.error.code, 'SOGOU_CAPTCHA');
assert.deepStrictEqual(partialOutput.result.items, [
  {
    title: '第一篇文章：从想法到实践',
    account: '饼干哥哥AGI',
    pubDate: '2026-03-09',
    sourceUrl: 'https://mp.weixin.qq.com/s/article-one',
    resolved: true,
  },
]);

// ── 用例 7：直链超时 / 非微信域 → resolved:false, sourceUrl:null ─────────
const unresolved = runSearch(['饼干哥哥AGI', '--json'], tempHome, {
  WECHAT_NOTEBANK_TEST_HTML_MAP: sogouHtmlMap,
  WECHAT_NOTEBANK_TEST_REDIRECT_MAP: JSON.stringify({
    'https://weixin.sogou.com/link?url=article-one': 'https://mp.weixin.qq.com/s/article-one',
    'https://weixin.sogou.com/link?url=article-two': 'https://example.com/expired-link',
    // article-three 不在 REDIRECT_MAP：page.url() 停留在搜狗 link 页，轮询超时。
  }),
});
assert.strictEqual(unresolved.status, 0, unresolved.stderr || unresolved.stdout);
const unresolvedOutput = parseJson(unresolved);
assert.strictEqual(unresolvedOutput.ok, true);
assert.strictEqual(unresolvedOutput.status, 'completed');
assert.deepStrictEqual(
  unresolvedOutput.result.items.map((item) => ({
    resolved: item.resolved,
    sourceUrl: item.sourceUrl,
  })),
  [
    { resolved: true, sourceUrl: 'https://mp.weixin.qq.com/s/article-one' },
    { resolved: false, sourceUrl: null },
    { resolved: false, sourceUrl: null },
  ]
);

// ── 用例 8：mirror 单页（专栏 URL 自动路由 mirror）────────────────────────
const mirrorSingle = runSearch(
  ['https://www.jintiankansha.me/column/demo-single', '--json'],
  tempHome,
  {
    WECHAT_NOTEBANK_TEST_IMAGE_MAP: JSON.stringify({
      'https://www.jintiankansha.me/column/demo-single': fixture('mirror-column-page2.html'),
      'https://www.jintiankansha.me/t/article-three': fixture('mirror-article-page.html'),
    }),
  }
);
assert.strictEqual(mirrorSingle.status, 0, mirrorSingle.stderr || mirrorSingle.stdout);
assert.deepStrictEqual(parseJson(mirrorSingle), {
  ok: true,
  command: 'search',
  status: 'completed',
  result: {
    query: 'https://www.jintiankansha.me/column/demo-single',
    source: 'mirror',
    account: null,
    limit: 100,
    intervalMs: 1,
    columnUrl: 'https://www.jintiankansha.me/column/demo-single',
    items: [
      {
        title: '第二页的历史文章标题',
        account: null,
        pubDate: null,
        sourceUrl: 'https://mp.weixin.qq.com/s/mirror-article?scene=1&from=mirror',
        resolved: true,
      },
    ],
  },
});

// ── 用例 9：mirror 翻页跟随 + 跨页去重 ───────────────────────────────────
const mirrorPaged = runSearch(
  ['https://www.jintiankansha.me/column/demo', '--json'],
  tempHome,
  {
    WECHAT_NOTEBANK_TEST_IMAGE_MAP: JSON.stringify({
      'https://www.jintiankansha.me/column/demo': fixture('mirror-column-page1.html'),
      'https://www.jintiankansha.me/column/demo?page=2': fixture('mirror-column-page2.html'),
      'https://www.jintiankansha.me/t/article-one': fixture('mirror-article-page.html'),
      'https://www.jintiankansha.me/t/article-two': fixture('mirror-article-page.html'),
      'https://www.jintiankansha.me/t/article-three': fixture('mirror-article-page.html'),
    }),
  }
);
assert.strictEqual(mirrorPaged.status, 0, mirrorPaged.stderr || mirrorPaged.stdout);
const mirrorPagedOutput = parseJson(mirrorPaged);
assert.strictEqual(mirrorPagedOutput.result.columnUrl, 'https://www.jintiankansha.me/column/demo');
assert.deepStrictEqual(
  mirrorPagedOutput.result.items.map((item) => item.title),
  [
    '第一篇镜像文章：从列表到直链',
    '同标题只保留第一次出现的文章',
    '第二页的历史文章标题',
  ]
);
assert.ok(mirrorPagedOutput.result.items.every((item) => item.resolved));

// ── 用例 10：mirror 直链还原失败 → resolved:false，整批仍 completed ──────
const mirrorUnresolved = runSearch(
  ['https://www.jintiankansha.me/column/demo-fail', '--json'],
  tempHome,
  {
    WECHAT_NOTEBANK_TEST_IMAGE_MAP: JSON.stringify({
      'https://www.jintiankansha.me/column/demo-fail': fixture('mirror-column-page2.html'),
      // /t/article-three 不映射：mock fetch 返回 403，还原失败。
    }),
  }
);
assert.strictEqual(mirrorUnresolved.status, 0, mirrorUnresolved.stderr || mirrorUnresolved.stdout);
const mirrorUnresolvedOutput = parseJson(mirrorUnresolved);
assert.strictEqual(mirrorUnresolvedOutput.ok, true);
assert.strictEqual(mirrorUnresolvedOutput.status, 'completed');
assert.deepStrictEqual(mirrorUnresolvedOutput.result.items, [
  {
    title: '第二页的历史文章标题',
    account: null,
    pubDate: null,
    sourceUrl: null,
    resolved: false,
  },
]);

// ── 用例 11：未知参数 / 缺位置参数 → CLI_USAGE_ERROR ─────────────────────
const unknownOption = runSearch(['饼干', '--bogus', '--json'], tempHome);
assert.strictEqual(unknownOption.status, 1);
const unknownOptionOutput = parseJson(unknownOption);
assert.strictEqual(unknownOptionOutput.ok, false);
assert.strictEqual(unknownOptionOutput.command, 'search');
assert.strictEqual(unknownOptionOutput.status, 'failed');
assert.strictEqual(unknownOptionOutput.error.code, 'CLI_USAGE_ERROR');
assert.match(unknownOptionOutput.error.message, /Unknown search option/);

const missingQuery = runSearch(['--json'], tempHome);
assert.strictEqual(missingQuery.status, 1);
const missingQueryOutput = parseJson(missingQuery);
assert.strictEqual(missingQueryOutput.error.code, 'CLI_USAGE_ERROR');
assert.match(missingQueryOutput.error.message, /请提供公众号名称或今天看啥专栏链接/);

const badSource = runSearch(['饼干', '--source', 'google', '--json'], tempHome);
assert.strictEqual(badSource.status, 1);
assert.match(parseJson(badSource).error.message, /--source requires sogou or mirror/);

console.log('search json tests passed');
