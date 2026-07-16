const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { createHash } = require('crypto');
const { spawn } = require('child_process');

const projectRoot = path.resolve(__dirname, '..');
const cliPath = path.join(projectRoot, 'dist', 'index.js');
const mockPuppeteerPath = path.join(__dirname, 'helpers', 'mock-puppeteer.js');
const articleFixturePath = path.join(__dirname, 'fixtures', 'wechat-article.html');

function runCli(args, homePath) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [cliPath, ...args], {
      cwd: homePath,
      env: {
        ...process.env,
        HOME: homePath,
        NODE_OPTIONS: `--require=${mockPuppeteerPath}`,
        WECHAT_NOTEBANK_TEST_HTML_FILE: articleFixturePath,
        WECHAT_NOTEBANK_TEST_GOTO_DELAY_MS: '150',
      },
    });
    let stdout = '';
    let stderr = '';
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (chunk) => {
      stdout += chunk;
    });
    child.stderr.on('data', (chunk) => {
      stderr += chunk;
    });
    child.on('close', (status) => resolve({ status, stdout, stderr }));
  });
}

(async () => {
  const tempHome = fs.mkdtempSync(path.join(os.tmpdir(), 'wechat-notebank-concurrent-'));
  const archivePath = path.join(tempHome, 'archive');
  const sourceUrl = 'https://mp.weixin.qq.com/s/concurrent';
  const args = ['fetch', sourceUrl, '--output', archivePath, '--json'];

  const results = await Promise.all([
    runCli(args, tempHome),
    runCli(args, tempHome),
  ]);

  for (const result of results) {
    assert.strictEqual(result.status, 0, result.stderr || result.stdout);
  }
  const outputs = results.map((result) => JSON.parse(result.stdout));
  assert.deepStrictEqual(
    outputs.map((output) => output.status).sort(),
    ['saved', 'skipped']
  );
  assert.strictEqual(outputs[0].result.savedFile, outputs[1].result.savedFile);
  assert.strictEqual(
    fs.readdirSync(archivePath).filter((fileName) => fileName.endsWith('.md')).length,
    1
  );

  const staleArchivePath = path.join(tempHome, 'stale-archive');
  const staleSourceUrl = 'https://mp.weixin.qq.com/s/stale-concurrent';
  const lockName = createHash('sha256').update(staleSourceUrl).digest('hex');
  const lockDirectory = path.join(staleArchivePath, '.alskai-notebank-locks');
  fs.mkdirSync(lockDirectory, { recursive: true });
  const staleLockPath = path.join(lockDirectory, `${lockName}.lock`);
  fs.mkdirSync(staleLockPath);
  fs.writeFileSync(
    path.join(staleLockPath, 'owner.json'),
    JSON.stringify({ pid: 999999, token: 'dead-owner' })
  );
  const staleArgs = ['fetch', staleSourceUrl, '--output', staleArchivePath, '--json'];
  const staleResults = await Promise.all(
    Array.from({ length: 8 }, () => runCli(staleArgs, tempHome))
  );
  for (const result of staleResults) {
    assert.strictEqual(result.status, 0, result.stderr || result.stdout);
  }
  const staleOutputs = staleResults.map((result) => JSON.parse(result.stdout));
  assert.strictEqual(
    staleOutputs.filter((output) => output.status === 'saved').length,
    1
  );
  assert.strictEqual(
    staleOutputs.filter((output) => output.status === 'skipped').length,
    7
  );
  assert.strictEqual(
    fs.readdirSync(staleArchivePath).filter((fileName) => fileName.endsWith('.md')).length,
    1
  );

  console.log('fetch concurrency tests passed');
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
