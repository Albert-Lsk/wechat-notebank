const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const projectRoot = path.resolve(__dirname, '..');
const cliPath = path.join(projectRoot, 'dist', 'index.js');
const mockPuppeteerPath = path.join(__dirname, 'helpers', 'mock-puppeteer.js');
const articleFixturePath = path.join(__dirname, 'fixtures', 'wechat-article.html');

function runCli(args, homePath) {
  return spawnSync(process.execPath, [cliPath, ...args], {
    cwd: homePath,
    encoding: 'utf8',
    env: {
      ...process.env,
      HOME: homePath,
      NODE_OPTIONS: `--require=${mockPuppeteerPath}`,
      WECHAT_NOTEBANK_TEST_HTML_FILE: articleFixturePath,
    },
  });
}

const tempHome = fs.mkdtempSync(path.join(os.tmpdir(), 'wechat-notebank-json-'));
const archivePath = path.join(tempHome, 'vault', 'L1_原文', 'WeChat');
const sourceUrl = 'https://mp.weixin.qq.com/s/json-success';
const result = runCli([
  'fetch',
  '--json',
  sourceUrl,
  '--output',
  archivePath,
], tempHome);

assert.strictEqual(result.status, 0, result.stderr || result.stdout);
const output = JSON.parse(result.stdout);
assert.deepStrictEqual(output, {
  ok: true,
  command: 'fetch',
  status: 'saved',
  result: {
    action: 'archive',
    sourceUrl,
    savedFile: path.join(archivePath, '2026-07-16-AgentJSON接口测试文章.md'),
    archiveRoot: archivePath,
    processingGoal: null,
    autoProcess: false,
  },
});
assert.match(result.stderr, /正在获取文章/);
assert.ok(fs.existsSync(output.result.savedFile));

const missingUrlResult = runCli([
  'fetch',
  '--json',
  '--output',
  archivePath,
], tempHome);

assert.strictEqual(missingUrlResult.status, 1);
assert.deepStrictEqual(JSON.parse(missingUrlResult.stdout), {
  ok: false,
  command: 'fetch',
  status: 'failed',
  error: {
    code: 'ARTICLE_UNAVAILABLE',
    message: '请提供文章链接',
  },
});
assert.match(missingUrlResult.stderr, /请提供文章链接/);

const saveFailureResult = runCli([
  'fetch',
  sourceUrl,
  '--output',
  path.join('/dev/null', 'articles'),
  '--json',
], tempHome);

assert.strictEqual(saveFailureResult.status, 1);
const saveFailureOutput = JSON.parse(saveFailureResult.stdout);
assert.deepStrictEqual({
  ok: saveFailureOutput.ok,
  command: saveFailureOutput.command,
  status: saveFailureOutput.status,
  code: saveFailureOutput.error.code,
}, {
  ok: false,
  command: 'fetch',
  status: 'failed',
  code: 'TRANSACTION_FAILED',
});
assert.match(saveFailureOutput.error.message, /dev\/null/);
assert.match(saveFailureResult.stderr, /dev\/null/);

const unconfiguredHome = fs.mkdtempSync(path.join(os.tmpdir(), 'wechat-notebank-unconfigured-'));
const missingConfigResult = runCli([
  'fetch',
  sourceUrl,
  '--json',
], unconfiguredHome);

assert.strictEqual(missingConfigResult.status, 1);
const missingConfigOutput = JSON.parse(missingConfigResult.stdout);
assert.strictEqual(missingConfigOutput.ok, false);
assert.strictEqual(missingConfigOutput.command, 'fetch');
assert.strictEqual(missingConfigOutput.status, 'failed');
assert.strictEqual(missingConfigOutput.error.code, 'CONFIG_INVALID');
assert.match(missingConfigOutput.error.message, /配置文件|输出目录/);
assert.strictEqual(
  fs.existsSync(path.join(unconfiguredHome, '.wechat-notebank.json')),
  false
);

const invalidOptionResult = runCli([
  'fetch',
  '--json',
  sourceUrl,
  '--unknown-option',
], tempHome);

assert.strictEqual(invalidOptionResult.status, 1);
const invalidOptionOutput = JSON.parse(invalidOptionResult.stdout);
assert.strictEqual(invalidOptionOutput.ok, false);
assert.strictEqual(invalidOptionOutput.command, 'fetch');
assert.strictEqual(invalidOptionOutput.status, 'failed');
assert.strictEqual(invalidOptionOutput.error.code, 'ARTICLE_UNAVAILABLE');
assert.match(invalidOptionOutput.error.message, /Unknown fetch option/);

const humanArchivePath = path.join(tempHome, 'human-output');
const humanResult = runCli([
  'fetch',
  sourceUrl,
  '--output',
  humanArchivePath,
], tempHome);

assert.strictEqual(humanResult.status, 0, humanResult.stderr || humanResult.stdout);
assert.match(humanResult.stdout, /正在获取文章/);
assert.match(humanResult.stdout, /文章已保存/);
assert.match(humanResult.stdout, /Agent JSON 接口测试文章/);
assert.strictEqual(humanResult.stderr, '');

console.log('fetch json tests passed');
