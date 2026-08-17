const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const { parseColumnPage } = require('../dist/lib/mirror');

const fixturePath = path.join(__dirname, 'fixtures', 'mirror-column-real-site.html');
const html = fs.readFileSync(fixturePath, 'utf8');
const columnUrl = 'https://www.jintiankansha.me/column/real-site';

assert.deepStrictEqual(parseColumnPage(html, columnUrl), {
  items: [{
    title: '真实站点形态下的历史文章标题',
    url: 'https://www.jintiankansha.me/t/real-site-article',
  }],
  nextPageUrl: 'https://www.jintiankansha.me/column/real-site?page=2',
});

const projectRoot = path.resolve(__dirname, '..');
const cliPath = path.join(projectRoot, 'dist', 'index.js');
const mockFetchPath = path.join(__dirname, 'helpers', 'mock-fetch.js');
const articleFixturePath = path.join(__dirname, 'fixtures', 'mirror-article-page.html');
const tempHome = fs.mkdtempSync(path.join(os.tmpdir(), 'wechat-notebank-mirror-real-'));
const cliResult = spawnSync(
  process.execPath,
  [cliPath, 'search', columnUrl, '--source', 'mirror', '--limit', '1', '--json'],
  {
    cwd: tempHome,
    encoding: 'utf8',
    env: {
      ...process.env,
      HOME: tempHome,
      NODE_OPTIONS: `--require=${mockFetchPath}`,
      WECHAT_NOTEBANK_SEARCH_INTERVAL_MS: '1',
      WECHAT_NOTEBANK_TEST_IMAGE_MAP: JSON.stringify({
        [columnUrl]: fixturePath,
        'https://www.jintiankansha.me/t/real-site-article': articleFixturePath,
      }),
    },
  }
);

assert.strictEqual(cliResult.status, 0, cliResult.stderr || cliResult.stdout);
assert.deepStrictEqual(JSON.parse(cliResult.stdout), {
  ok: true,
  command: 'search',
  status: 'completed',
  result: {
    query: columnUrl,
    source: 'mirror',
    account: null,
    limit: 1,
    intervalMs: 1,
    columnUrl,
    items: [{
      title: '真实站点形态下的历史文章标题',
      account: null,
      pubDate: null,
      sourceUrl: 'https://mp.weixin.qq.com/s/mirror-article?scene=1&from=mirror',
      resolved: true,
    }],
  },
});

const noSkeletonUrl = 'https://www.jintiankansha.me/column/no-skeleton';
const noSkeletonFixturePath = path.join(tempHome, 'mirror-no-skeleton.html');
fs.writeFileSync(
  noSkeletonFixturePath,
  '<!doctype html><html><body><main>account sign-in</main></body></html>'
);
const noSkeletonResult = spawnSync(
  process.execPath,
  [cliPath, 'search', noSkeletonUrl, '--source', 'mirror', '--limit', '1', '--json'],
  {
    cwd: tempHome,
    encoding: 'utf8',
    env: {
      ...process.env,
      HOME: tempHome,
      NODE_OPTIONS: `--require=${mockFetchPath}`,
      WECHAT_NOTEBANK_SEARCH_INTERVAL_MS: '1',
      WECHAT_NOTEBANK_TEST_IMAGE_MAP: JSON.stringify({
        [noSkeletonUrl]: noSkeletonFixturePath,
      }),
    },
  }
);

assert.strictEqual(noSkeletonResult.status, 1);
const noSkeletonOutput = JSON.parse(noSkeletonResult.stdout);
assert.strictEqual(noSkeletonOutput.status, 'failed');
assert.strictEqual(noSkeletonOutput.error.code, 'SEARCH_UNAVAILABLE');

console.log('mirror real-site regression tests passed');
