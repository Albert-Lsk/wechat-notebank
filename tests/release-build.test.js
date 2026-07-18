const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const projectRoot = path.resolve(__dirname, '..');
const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'notebank-release-build-'));

function buildRelease(folderName) {
  const outputPath = path.join(tempRoot, folderName);
  const result = spawnSync(process.execPath, [
    path.join(projectRoot, 'scripts', 'build-release.js'),
    '--output',
    outputPath,
  ], {
    cwd: projectRoot,
    encoding: 'utf8',
  });
  assert.strictEqual(result.status, 0, result.stderr || result.stdout);
  return JSON.parse(result.stdout);
}

const first = buildRelease('first');
const second = buildRelease('second');

assert.strictEqual(first.ok, true);
assert.strictEqual(first.action, 'release-pack');
assert.strictEqual(first.version, '0.2.0');
assert.strictEqual(first.tag, 'v0.2.0');
assert.strictEqual(first.asset, 'wechat-notebank-0.2.0.tgz');
assert.strictEqual(first.checksum, 'wechat-notebank-0.2.0.tgz.sha256');
assert.match(first.sha256, /^[a-f0-9]{64}$/);
assert.strictEqual(second.sha256, first.sha256);

for (const release of [first, second]) {
  const assetPath = path.join(release.outputPath, release.asset);
  const checksumPath = path.join(release.outputPath, release.checksum);
  assert.strictEqual(fs.existsSync(assetPath), true);
  assert.strictEqual(
    fs.readFileSync(checksumPath, 'utf8'),
    `${release.sha256}  ${release.asset}\n`
  );
  const verified = spawnSync('shasum', ['-a', '256', '-c', release.checksum], {
    cwd: release.outputPath,
    encoding: 'utf8',
  });
  assert.strictEqual(verified.status, 0, verified.stderr || verified.stdout);
}

console.log('release build tests passed');
