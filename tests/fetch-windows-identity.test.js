const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const { createHash } = require('crypto');

const projectRoot = path.resolve(__dirname, '..');
const cliPath = path.join(projectRoot, 'dist', 'index.js');
const mockPuppeteer = path.join(__dirname, 'helpers', 'mock-puppeteer.js');
const mockWindows = path.join(__dirname, 'helpers', 'mock-windows-process.js');
const fixture = path.join(__dirname, 'fixtures', 'wechat-article.html');
const tempHome = fs.mkdtempSync(path.join(os.tmpdir(), 'wechat-notebank-windows-'));
const archivePath = path.join(tempHome, 'archive');
const sourceUrl = 'https://mp.weixin.qq.com/s/windows-regression';
const platformArgs = process.platform === 'win32' ? [] : ['--require', mockWindows];

function runNode(args) {
  return spawnSync(process.execPath, [...platformArgs, ...args], {
    cwd: tempHome,
    encoding: 'utf8',
    env: {
      ...process.env,
      HOME: tempHome,
      USERPROFILE: tempHome,
      WECHAT_NOTEBANK_TEST_HTML_FILE: fixture,
    },
  });
}

try {
  const args = [
    '--require', mockPuppeteer, cliPath, 'fetch', sourceUrl,
    '--output', archivePath, '--no-images', '--json',
  ];
  const first = runNode(args);
  assert.strictEqual(first.status, 0, first.stderr || first.stdout);
  const saved = JSON.parse(first.stdout);
  assert.strictEqual(saved.status, 'saved');
  assert.ok(fs.existsSync(saved.result.savedFile));

  const second = runNode(args);
  assert.strictEqual(second.status, 0, second.stderr || second.stdout);
  const skipped = JSON.parse(second.stdout);
  assert.strictEqual(skipped.status, 'skipped');
  assert.strictEqual(skipped.result.savedFile, saved.result.savedFile);

  const staleUrl = 'https://mp.weixin.qq.com/s/windows-stale-lock';
  const lockName = createHash('sha256').update(staleUrl).digest('hex');
  const staleLock = path.join(archivePath, '.alskai-notebank-locks', `${lockName}.lock`);
  fs.mkdirSync(staleLock, { recursive: true });
  fs.writeFileSync(path.join(staleLock, 'owner.json'), JSON.stringify({
    pid: 2147483647,
    token: 'dead-process',
    processStartedAt: '638000000000000001',
  }));
  const recovered = runNode([
    '--require', mockPuppeteer, cliPath, 'fetch', staleUrl,
    '--output', archivePath, '--no-images', '--json',
  ]);
  assert.strictEqual(recovered.status, 0, recovered.stderr || recovered.stdout);
  assert.strictEqual(JSON.parse(recovered.stdout).status, 'saved');

  const identityModule = path.join(projectRoot, 'dist', 'lib', 'process-identity.js');
  const probe = runNode(['-e', `
    const assert = require('assert');
    const { getProcessIdentity } = require(${JSON.stringify(identityModule)});
    (async () => {
      const current = await getProcessIdentity(process.pid);
      assert.strictEqual(current.status, 'found');
      assert.deepStrictEqual(await getProcessIdentity(process.pid, { fresh: true }), current);
      assert.deepStrictEqual(await getProcessIdentity(2147483647), { status: 'missing' });
      if (${process.platform !== 'win32'}) {
        assert.deepStrictEqual(await getProcessIdentity(2147483646), { status: 'unknown' });
      }
      assert.deepStrictEqual(await getProcessIdentity(-1), { status: 'unknown' });
    })().catch((error) => { console.error(error); process.exitCode = 1; });
  `]);
  assert.strictEqual(probe.status, 0, probe.stderr || probe.stdout);

  console.log(`Windows fetch identity tests passed (${process.platform === 'win32' ? 'native' : 'simulated'})`);
} finally {
  fs.rmSync(tempHome, { recursive: true, force: true });
}
