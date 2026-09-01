const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const projectRoot = path.resolve(__dirname, '..');
const cliPath = path.join(projectRoot, 'dist', 'index.js');
const mockPuppeteerPath = path.join(__dirname, 'helpers', 'mock-puppeteer.js');
const articleFixturePath = path.join(__dirname, 'fixtures', 'wechat-article.html');
const fakeChromeRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'wechat-notebank-purity-chrome-'));
const fakeChromePath = path.join(fakeChromeRoot, 'Google Chrome');
fs.writeFileSync(fakeChromePath, '');
fs.chmodSync(fakeChromePath, 0o755);

function createSandbox(name) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), `wechat-notebank-purity-${name}-`));
  const home = path.join(root, 'home');
  fs.mkdirSync(home, { recursive: true });
  return { root, home };
}

function runCli(args, homePath, extraEnv = {}) {
  return spawnSync(process.execPath, [cliPath, ...args], {
    cwd: homePath,
    encoding: 'utf8',
    env: {
      ...process.env,
      HOME: homePath,
      ...extraEnv,
    },
  });
}

function runCliWithRuntime(args, homePath, extraEnv = {}) {
  const script = [
    `Object.defineProperty(process, 'platform', { value: 'darwin' });`,
    `Object.defineProperty(process, 'arch', { value: 'arm64' });`,
    `process.argv = [process.execPath, ${JSON.stringify(cliPath)}, ...${JSON.stringify(args)}];`,
    `require(${JSON.stringify(cliPath)});`,
  ].join('');
  return spawnSync(process.execPath, ['-e', script], {
    cwd: homePath,
    encoding: 'utf8',
    env: {
      ...process.env,
      HOME: homePath,
      ...extraEnv,
    },
  });
}

/**
 * 黑盒断言：--json 模式下 stdout 必须只有一行，且能被 JSON.parse，
 * 并呈现 {ok, command, status, ...} 同构形态。
 */
function assertSingleJsonLine(result, label) {
  const lines = result.stdout.split('\n').filter((line) => line.trim().length > 0);
  assert.strictEqual(
    lines.length,
    1,
    `${label}: --json 模式下 stdout 应只有一行结果，实际 ${lines.length} 行:\n${result.stdout}`
  );
  let payload;
  assert.doesNotThrow(
    () => {
      payload = JSON.parse(lines[0]);
    },
    `${label}: stdout 行必须能被 JSON.parse，实际内容: ${lines[0]}`
  );
  assert.strictEqual(typeof payload.ok, 'boolean', `${label}: 缺少 ok 字段`);
  assert.strictEqual(typeof payload.command, 'string', `${label}: 缺少 command 字段`);
  assert.strictEqual(typeof payload.status, 'string', `${label}: 缺少 status 字段`);
  return payload;
}

// 1. doctor --json：stdout 只有一行 JSON
const doctorSandbox = createSandbox('doctor');
const doctorResult = runCli(['doctor', '--json'], doctorSandbox.home);
assert.strictEqual(doctorResult.status, 0, doctorResult.stderr || doctorResult.stdout);
const doctorOutput = assertSingleJsonLine(doctorResult, 'doctor --json');
assert.strictEqual(doctorOutput.ok, true);
assert.strictEqual(doctorOutput.command, 'doctor');

// 2. setup --dry-run --json：stdout 只有一行 JSON
const setupSandbox = createSandbox('setup');
const setupResult = runCliWithRuntime(
  ['setup', '--agents', 'codex', '--dry-run', '--json'],
  setupSandbox.home,
  { WECHAT_NOTEBANK_CHROME_PATH: fakeChromePath }
);
assert.strictEqual(setupResult.status, 0, setupResult.stderr || setupResult.stdout);
const setupOutput = assertSingleJsonLine(setupResult, 'setup --dry-run --json');
assert.strictEqual(setupOutput.ok, true);
assert.strictEqual(setupOutput.command, 'setup');
assert.strictEqual(setupOutput.status, 'planned');

// 3. pack create --json（源文件缺失的错误路径）：stdout 只有一行 JSON
const packSandbox = createSandbox('pack');
const packResult = runCli(
  [
    'pack',
    'create',
    '--source',
    path.join(packSandbox.root, 'missing.md'),
    '--manifest',
    path.join(packSandbox.root, 'manifest.json'),
    '--json',
  ],
  packSandbox.home
);
assert.strictEqual(packResult.status, 1);
const packOutput = assertSingleJsonLine(packResult, 'pack create --json');
assert.strictEqual(packOutput.ok, false);
assert.strictEqual(packOutput.command, 'pack.create');
assert.strictEqual(packOutput.status, 'failed');

// 4. fetch --json（被安全校验拒绝的无效 URL，不触发真实抓取）：stdout 只有一行 JSON
const fetchSandbox = createSandbox('fetch');
const fetchResult = runCli(
  ['fetch', 'http://127.0.0.1/article', '--json', '--output', path.join(fetchSandbox.root, 'archive')],
  fetchSandbox.home
);
assert.strictEqual(fetchResult.status, 1);
const fetchOutput = assertSingleJsonLine(fetchResult, 'fetch --json 无效 URL');
assert.strictEqual(fetchOutput.ok, false);
assert.strictEqual(fetchOutput.command, 'fetch');
assert.strictEqual(fetchOutput.status, 'failed');
assert.match(fetchResult.stderr, /内网|本地/);

// 5. fetch --json 成功路径：📥 等进度日志只出现在 stderr，stdout 保持单行 JSON
const fetchSavedSandbox = createSandbox('fetch-saved');
const fetchSavedArchive = path.join(fetchSavedSandbox.root, 'archive');
const fetchSavedResult = runCli(
  ['fetch', '--json', 'https://mp.weixin.qq.com/s/purity', '--output', fetchSavedArchive],
  fetchSavedSandbox.home,
  {
    NODE_OPTIONS: `--require=${mockPuppeteerPath}`,
    WECHAT_NOTEBANK_TEST_HTML_FILE: articleFixturePath,
  }
);
assert.strictEqual(fetchSavedResult.status, 0, fetchSavedResult.stderr || fetchSavedResult.stdout);
const fetchSavedOutput = assertSingleJsonLine(fetchSavedResult, 'fetch --json 成功路径');
assert.strictEqual(fetchSavedOutput.ok, true);
assert.strictEqual(fetchSavedOutput.command, 'fetch');
assert.strictEqual(fetchSavedOutput.status, 'saved');
assert.ok(
  fs.existsSync(fetchSavedOutput.result.savedFile),
  '成功路径应真实保存文章文件'
);
assert.match(fetchSavedResult.stderr, /正在获取文章/);

console.log('json stdout purity tests passed');
