const assert = require('assert');
const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const projectRoot = path.resolve(__dirname, '..');
const cliPath = path.join(projectRoot, 'dist', 'index.js');

function runCli(args, cwdPath, homePath) {
  return spawnSync(process.execPath, [cliPath, ...args], {
    cwd: cwdPath,
    encoding: 'utf8',
    env: { ...process.env, HOME: homePath },
  });
}

// 黑盒目录快照：相对路径 -> 文件内容 sha256。任何新文件、删除或改动都会被发现。
function snapshotDirectory(root) {
  const entries = {};
  const walk = (directory) => {
    for (const name of fs.readdirSync(directory).sort()) {
      const fullPath = path.join(directory, name);
      const relativePath = path.relative(root, fullPath);
      const stat = fs.lstatSync(fullPath);
      if (stat.isDirectory()) {
        walk(fullPath);
        continue;
      }
      entries[relativePath] = crypto
        .createHash('sha256')
        .update(fs.readFileSync(fullPath))
        .digest('hex');
    }
  };
  walk(root);
  return entries;
}

function createVault(rootPrefix, sourceUrl) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), rootPrefix));
  const home = path.join(root, 'home');
  fs.mkdirSync(home, { recursive: true });
  const sourceDirectory = path.join(root, 'vault', 'L1_原文', 'WeChat');
  const sourceFile = path.join(sourceDirectory, '源文章.md');
  fs.mkdirSync(sourceDirectory, { recursive: true });
  fs.writeFileSync(sourceFile, [
    '---',
    'title: 源文章',
    `sourceUrl: ${sourceUrl}`,
    '---',
    '',
    '# 源文章',
    '',
    '这是未经加工的原文。',
    '',
  ].join('\n'));
  const manifestFile = path.join(root, 'manifest.json');
  fs.writeFileSync(manifestFile, JSON.stringify({
    schemaVersion: 1,
    sourceFile,
    sourceUrl,
    processingGoal: null,
    atomicNotes: [],
    materials: [],
    reviewQuestions: [],
  }, null, 2));
  return { root, home, sourceFile, manifestFile, sourceUrl };
}

function expectedPackIdentity(vaultRoot, sourceUrl) {
  const packId = crypto.createHash('sha256')
    .update(`${sourceUrl}\n__general__`)
    .digest('hex');
  return {
    packId,
    packFile: path.join(vaultRoot, 'Inbox', `源文章-${packId.slice(0, 12)}-r1.md`),
    stateFile: path.join(
      vaultRoot,
      '.alskai-notebank',
      'packs',
      packId,
      'state.json'
    ),
  };
}

// 验收一：合法 Manifest + --dry-run 返回成功标识，磁盘零变化
const validVault = createVault(
  'wechat-notebank-dryrun-valid-',
  'https://mp.weixin.qq.com/s/pack-dry-run-valid'
);
const validVaultRoot = path.join(validVault.root, 'vault');
const validIdentity = expectedPackIdentity(validVaultRoot, validVault.sourceUrl);

const beforeValidRun = snapshotDirectory(validVault.root);
const validResult = runCli([
  'pack', 'create',
  '--source', validVault.sourceFile,
  '--manifest', validVault.manifestFile,
  '--dry-run',
  '--json',
], validVault.root, validVault.home);

assert.strictEqual(
  validResult.status,
  0,
  validResult.stderr || validResult.stdout
);
assert.strictEqual(validResult.stderr, '');
const validOutput = JSON.parse(validResult.stdout);
assert.strictEqual(validOutput.ok, true);
assert.strictEqual(validOutput.command, 'pack.create');
assert.strictEqual(validOutput.status, 'planned');
assert.deepStrictEqual(validOutput.result, {
  action: 'create',
  packId: validIdentity.packId,
  revision: 1,
  status: 'pending',
  sourceFile: validVault.sourceFile,
  sourceUrl: validVault.sourceUrl,
  processingGoal: null,
  packFile: validIdentity.packFile,
  stateFile: validIdentity.stateFile,
  dryRun: true,
});
assert.deepStrictEqual(
  snapshotDirectory(validVault.root),
  beforeValidRun,
  'dry-run 在合法 Manifest 下不得改动磁盘（含 Inbox 与 .alskai-notebank）'
);

// 验收二（reuse 路径）：dry-run 对已存在且内容一致的加工包返回 unchanged，磁盘零变化
const realCreateResult = runCli([
  'pack', 'create',
  '--source', validVault.sourceFile,
  '--manifest', validVault.manifestFile,
  '--json',
], validVault.root, validVault.home);
assert.strictEqual(
  realCreateResult.status,
  0,
  realCreateResult.stderr || realCreateResult.stdout
);
assert.strictEqual(JSON.parse(realCreateResult.stdout).status, 'created');

const beforeReuseRun = snapshotDirectory(validVault.root);
const reuseDryRunResult = runCli([
  'pack', 'create',
  '--source', validVault.sourceFile,
  '--manifest', validVault.manifestFile,
  '--dry-run',
  '--json',
], validVault.root, validVault.home);
assert.strictEqual(
  reuseDryRunResult.status,
  0,
  reuseDryRunResult.stderr || reuseDryRunResult.stdout
);
const reuseDryRunOutput = JSON.parse(reuseDryRunResult.stdout);
assert.strictEqual(reuseDryRunOutput.status, 'unchanged');
assert.strictEqual(reuseDryRunOutput.result.action, 'reuse');
assert.strictEqual(reuseDryRunOutput.result.dryRun, true);
assert.deepStrictEqual(
  snapshotDirectory(validVault.root),
  beforeReuseRun,
  'dry-run 的 reuse 结果同样不得改动磁盘'
);

// 验收三（revise 路径）：dry-run 预演新修订，磁盘零变化（不产生 r2、不改 state）
const revisedManifestFile = path.join(validVault.root, 'manifest-revised.json');
fs.writeFileSync(revisedManifestFile, JSON.stringify({
  schemaVersion: 1,
  sourceFile: validVault.sourceFile,
  sourceUrl: validVault.sourceUrl,
  processingGoal: null,
  atomicNotes: [{
    id: 'L2-01',
    title: '预演观点',
    claim: '候选内容变化必须形成新修订。',
    evidence: '原文保留并建立双链。',
    boundary: '同一来源与同一目标。',
    useCases: ['审计加工历史'],
  }],
  materials: [],
  reviewQuestions: [],
}, null, 2));

const beforeReviseRun = snapshotDirectory(validVault.root);
const reviseDryRunResult = runCli([
  'pack', 'create',
  '--source', validVault.sourceFile,
  '--manifest', revisedManifestFile,
  '--dry-run',
  '--json',
], validVault.root, validVault.home);
assert.strictEqual(
  reviseDryRunResult.status,
  0,
  reviseDryRunResult.stderr || reviseDryRunResult.stdout
);
const reviseDryRunOutput = JSON.parse(reviseDryRunResult.stdout);
assert.strictEqual(reviseDryRunOutput.status, 'planned');
assert.strictEqual(reviseDryRunOutput.result.action, 'revise');
assert.strictEqual(reviseDryRunOutput.result.revision, 2);
assert.strictEqual(reviseDryRunOutput.result.dryRun, true);
assert.match(reviseDryRunOutput.result.packFile, /-r2\.md$/);
assert.deepStrictEqual(
  snapshotDirectory(validVault.root),
  beforeReviseRun,
  'dry-run 的 revise 预演不得写入 r2 修订或更新隐藏状态'
);

// 验收四：非法 Manifest 的 --dry-run 报错与正式创建逐字一致，且磁盘零变化
const invalidVault = createVault(
  'wechat-notebank-dryrun-invalid-',
  'https://mp.weixin.qq.com/s/pack-dry-run-invalid'
);
const invalidManifestFile = path.join(invalidVault.root, 'manifest-invalid.json');
fs.writeFileSync(invalidManifestFile, JSON.stringify({
  schemaVersion: 1,
  sourceFile: invalidVault.sourceFile,
  sourceUrl: invalidVault.sourceUrl,
  processingGoal: null,
  atomicNotes: [],
  materials: [{
    id: 'L3-01',
    kind: 'quote',
    title: '伪造引用',
    content: '这句话并不存在于原文之中。',
    sourceSection: '源文章',
  }],
  reviewQuestions: [],
}, null, 2));

const beforeInvalidRuns = snapshotDirectory(invalidVault.root);
const realInvalidResult = runCli([
  'pack', 'create',
  '--source', invalidVault.sourceFile,
  '--manifest', invalidManifestFile,
  '--json',
], invalidVault.root, invalidVault.home);
assert.strictEqual(realInvalidResult.status, 1);
assert.strictEqual(JSON.parse(realInvalidResult.stdout).error.code, 'QUOTE_NOT_FOUND');

const dryRunInvalidResult = runCli([
  'pack', 'create',
  '--source', invalidVault.sourceFile,
  '--manifest', invalidManifestFile,
  '--dry-run',
  '--json',
], invalidVault.root, invalidVault.home);
assert.strictEqual(dryRunInvalidResult.status, realInvalidResult.status);
assert.strictEqual(
  dryRunInvalidResult.stdout,
  realInvalidResult.stdout,
  'dry-run 校验失败输出必须与正式创建逐字一致（不泄漏 dry-run 差异）'
);
assert.strictEqual(
  dryRunInvalidResult.stderr,
  realInvalidResult.stderr,
  'dry-run 校验失败 stderr 必须与正式创建逐字一致'
);
assert.deepStrictEqual(
  snapshotDirectory(invalidVault.root),
  beforeInvalidRuns,
  '非法 Manifest 下 dry-run 与正式创建都不得改动磁盘'
);

console.log('pack create dry-run tests passed');
