const assert = require('assert');
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

function snapshot(root) {
  const entries = [];
  function visit(current, relative) {
    for (const name of fs.readdirSync(current).sort()) {
      const absolute = path.join(current, name);
      const childRelative = path.join(relative, name);
      const stat = fs.lstatSync(absolute);
      if (stat.isDirectory()) {
        entries.push(`d:${childRelative}:${stat.mode & 0o777}:${stat.mtimeMs}`);
        visit(absolute, childRelative);
      } else {
        entries.push(
          `f:${childRelative}:${stat.mode & 0o777}:${stat.mtimeMs}:` +
          fs.readFileSync(absolute, 'hex')
        );
      }
    }
  }
  visit(root, '');
  return entries;
}

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'wechat-notebank-revoke-'));
const home = path.join(root, 'home');
const vault = path.join(root, 'vault');
const sourceFile = path.join(vault, 'L1_原文', 'WeChat', '撤销发布原文.md');
const manifestFile = path.join(root, 'manifest.json');
const sourceUrl = 'https://mp.weixin.qq.com/s/pack-revoke';
fs.mkdirSync(path.dirname(sourceFile), { recursive: true });
fs.mkdirSync(home, { recursive: true });
fs.writeFileSync(sourceFile, [
  '---',
  'title: 撤销发布原文',
  `sourceUrl: ${sourceUrl}`,
  '---',
  '',
  '撤销只能删除仍与发布哈希一致的生成文件。',
  '',
].join('\n'));
fs.writeFileSync(manifestFile, JSON.stringify({
  schemaVersion: 1,
  sourceFile,
  sourceUrl,
  processingGoal: null,
  atomicNotes: [
    {
      id: 'L2-01',
      title: '将被撤销',
      claim: '这张卡片将被安全撤销。',
      evidence: '撤销只能删除仍与发布哈希一致的生成文件。',
      boundary: '用于撤销测试。',
      useCases: ['审核'],
    },
    {
      id: 'L2-02',
      title: '继续保留',
      claim: '未被选中的卡片继续保留。',
      evidence: '撤销只能删除仍与发布哈希一致的生成文件。',
      boundary: '用于撤销测试。',
      useCases: ['审核'],
    },
    {
      id: 'L2-03',
      title: '从未发布',
      claim: '从未发布的候选不能被伪装成已撤销。',
      evidence: '撤销只能删除仍与发布哈希一致的生成文件。',
      boundary: '用于撤销测试。',
      useCases: [],
    },
  ],
  materials: [],
  reviewQuestions: [],
}, null, 2));

const created = runCli([
  'pack', 'create', '--source', sourceFile, '--manifest', manifestFile, '--json',
], root, home);
assert.strictEqual(created.status, 0, created.stderr || created.stdout);
const pack = JSON.parse(created.stdout).result;
const approved = runCli([
  'pack', 'approve', pack.packFile, '--items', 'L2-01,L2-02', '--json',
], root, home);
assert.strictEqual(approved.status, 0, approved.stderr || approved.stdout);
const stateBefore = JSON.parse(fs.readFileSync(pack.stateFile, 'utf8'));
const l2One = stateBefore.outputs.find((output) => output.itemIds[0] === 'L2-01').file;
const l2Two = stateBefore.outputs.find((output) => output.itemIds[0] === 'L2-02').file;
const sourceBody = fs.readFileSync(sourceFile, 'utf8').split(
  '<!-- alskai-notebank:derived:start -->'
)[0];

const revoked = runCli([
  'pack', 'revoke', pack.packFile, '--items', 'L2-01', '--json',
], root, home);
assert.strictEqual(revoked.status, 0, revoked.stderr || revoked.stdout);
assert.strictEqual(revoked.stderr, '');
const revokedOutput = JSON.parse(revoked.stdout);
assert.strictEqual(revokedOutput.ok, true);
assert.strictEqual(revokedOutput.command, 'pack.revoke');
assert.strictEqual(revokedOutput.status, 'revoked');
assert.strictEqual(revokedOutput.result.action, 'revoke');
assert.strictEqual(revokedOutput.result.status, 'revoked');
assert.deepStrictEqual(revokedOutput.result.revokedItems, ['L2-01']);
assert.deepStrictEqual(revokedOutput.result.approvedItems, ['L2-02']);
assert.deepStrictEqual(revokedOutput.result.removedFiles, [l2One]);
assert.deepStrictEqual(revokedOutput.result.publishedFiles, [l2Two]);

assert.strictEqual(fs.existsSync(l2One), false);
assert.strictEqual(fs.existsSync(l2Two), true);
const sourceAfter = fs.readFileSync(sourceFile, 'utf8');
assert.strictEqual(
  sourceAfter.split('<!-- alskai-notebank:derived:start -->')[0],
  sourceBody
);
assert.doesNotMatch(sourceAfter, /L2-01 · 将被撤销/);
assert.match(sourceAfter, /L2-02 · 继续保留/);
const visiblePack = fs.readFileSync(pack.packFile, 'utf8');
assert.match(visiblePack, /status: revoked/);
assert.match(visiblePack, /revokedItems:\n\s+- L2-01/);
const publishedRegion = visiblePack.split(
  '<!-- alskai-notebank:published:start -->'
)[1].split('<!-- alskai-notebank:published:end -->')[0];
assert.doesNotMatch(publishedRegion, /L2-01 · 将被撤销/);
assert.match(publishedRegion, /L2-02 · 继续保留/);

const state = JSON.parse(fs.readFileSync(pack.stateFile, 'utf8'));
assert.strictEqual(state.status, 'revoked');
assert.match(state.revokedAt, /^\d{4}-\d{2}-\d{2}T/);
assert.deepStrictEqual(state.revokedItems, ['L2-01']);
assert.deepStrictEqual(state.approvedItems, ['L2-02']);
assert.deepStrictEqual(state.outputs.map((output) => output.itemIds), [['L2-02']]);
assert.deepStrictEqual(
  JSON.parse(fs.readFileSync(path.join(
    path.dirname(pack.stateFile),
    'revisions',
    '1.json'
  ), 'utf8')),
  state
);

const beforeRepeat = snapshot(vault);
const repeated = runCli([
  'pack', 'revoke', pack.packFile, '--items', 'L2-01', '--json',
], root, home);
assert.strictEqual(repeated.status, 0, repeated.stderr || repeated.stdout);
const repeatedOutput = JSON.parse(repeated.stdout);
assert.strictEqual(repeatedOutput.status, 'unchanged');
assert.strictEqual(repeatedOutput.result.action, 'reuse');
assert.deepStrictEqual(snapshot(vault), beforeRepeat);

const healthySource = fs.readFileSync(sourceFile, 'utf8');
const sourceLink = healthySource.split('\n').find(
  (line) => line.includes('L2-02 · 继续保留')
);
assert.ok(sourceLink);
fs.writeFileSync(sourceFile, healthySource.replace(
  sourceLink,
  sourceLink.replace('L2-02 · 继续保留', '人工改过的链接别名')
));
const sourceLinkDrift = snapshot(vault);
const sourceLinkBlocked = runCli([
  'pack', 'revoke', pack.packFile, '--items', 'L2-02', '--json',
], root, home);
assert.strictEqual(sourceLinkBlocked.status, 1);
assert.strictEqual(
  JSON.parse(sourceLinkBlocked.stdout).error.code,
  'PACK_ALREADY_EXISTS'
);
assert.deepStrictEqual(snapshot(vault), sourceLinkDrift);
fs.writeFileSync(sourceFile, healthySource);

fs.writeFileSync(sourceFile, healthySource.replace(
  '<!-- alskai-notebank:derived:end -->',
  '* [[不存在的旧卡片]]\n<!-- alskai-notebank:derived:end -->'
));
const extraSourceLinkDrift = snapshot(vault);
const extraSourceLinkBlocked = runCli([
  'pack', 'revoke', pack.packFile, '--items', 'L2-02', '--json',
], root, home);
assert.strictEqual(extraSourceLinkBlocked.status, 1);
assert.strictEqual(
  JSON.parse(extraSourceLinkBlocked.stdout).error.code,
  'PACK_ALREADY_EXISTS'
);
assert.deepStrictEqual(snapshot(vault), extraSourceLinkDrift);
fs.writeFileSync(sourceFile, healthySource);

const healthyPack = fs.readFileSync(pack.packFile, 'utf8');
const packLink = healthyPack.split('\n').find(
  (line) => line.startsWith('- L2 原子卡片：') && line.includes('L2-02 · 继续保留')
);
assert.ok(packLink);
fs.writeFileSync(pack.packFile, healthyPack.replace(`${packLink}\n`, ''));
const packLinkDrift = snapshot(vault);
const packLinkBlocked = runCli([
  'pack', 'revoke', pack.packFile, '--items', 'L2-02', '--json',
], root, home);
assert.strictEqual(packLinkBlocked.status, 1);
assert.strictEqual(
  JSON.parse(packLinkBlocked.stdout).error.code,
  'PACK_ALREADY_EXISTS'
);
assert.deepStrictEqual(snapshot(vault), packLinkDrift);
fs.writeFileSync(pack.packFile, healthyPack);

fs.appendFileSync(l2Two, '\n用户补充的人工编辑。\n');
const afterManualEdit = snapshot(vault);
const modified = runCli([
  'pack', 'revoke', pack.packFile, '--items', 'L2-02', '--json',
], root, home);
assert.strictEqual(modified.status, 1);
assert.strictEqual(JSON.parse(modified.stdout).error.code, 'DERIVED_FILE_MODIFIED');
assert.deepStrictEqual(snapshot(vault), afterManualEdit);

const neverPublished = runCli([
  'pack', 'revoke', pack.packFile, '--items', 'L2-03', '--json',
], root, home);
assert.strictEqual(neverPublished.status, 1);
assert.strictEqual(JSON.parse(neverPublished.stdout).error.code, 'MANIFEST_INVALID');
assert.deepStrictEqual(snapshot(vault), afterManualEdit);

const approvalAfterRevoke = runCli([
  'pack', 'approve', pack.packFile, '--items', 'L2-03', '--json',
], root, home);
assert.strictEqual(approvalAfterRevoke.status, 1);
assert.strictEqual(
  JSON.parse(approvalAfterRevoke.stdout).error.code,
  'PACK_ALREADY_EXISTS'
);
assert.deepStrictEqual(snapshot(vault), afterManualEdit);

console.log('pack revoke json tests passed');
