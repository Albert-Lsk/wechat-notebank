const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const { validatePackState } = require('../dist/lib/pack-state');

const projectRoot = path.resolve(__dirname, '..');
const cliPath = path.join(projectRoot, 'dist', 'index.js');

function runCli(args, cwd, home) {
  return spawnSync(process.execPath, [cliPath, ...args], {
    cwd,
    encoding: 'utf8',
    env: { ...process.env, HOME: home },
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
        entries.push(`d:${childRelative}:${stat.mode & 0o777}`);
        visit(absolute, childRelative);
      } else {
        entries.push(`f:${childRelative}:${fs.readFileSync(absolute, 'hex')}`);
      }
    }
  }
  visit(root, '');
  return entries;
}

function createFixture(name, sourceUrl, atomicNotes) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), `wechat-notebank-${name}-`));
  const home = path.join(root, 'home');
  const vault = path.join(root, 'vault');
  const sourceFile = path.join(vault, 'L1_原文', 'WeChat', `${name}.md`);
  const manifestFile = path.join(root, 'manifest.json');
  fs.mkdirSync(path.dirname(sourceFile), { recursive: true });
  fs.mkdirSync(home, { recursive: true });
  fs.writeFileSync(sourceFile, [
    '---',
    `title: ${name}`,
    `sourceUrl: ${sourceUrl}`,
    '---',
    '',
    '生命周期测试原文。',
    '',
  ].join('\n'));
  fs.writeFileSync(manifestFile, JSON.stringify({
    schemaVersion: 1,
    sourceFile,
    sourceUrl,
    processingGoal: null,
    atomicNotes,
    materials: [],
    reviewQuestions: [],
  }, null, 2));
  const created = runCli([
    'pack', 'create', '--source', sourceFile, '--manifest', manifestFile, '--json',
  ], root, home);
  assert.strictEqual(created.status, 0, created.stderr || created.stdout);
  return {
    root,
    home,
    vault,
    sourceFile,
    manifestFile,
    pack: JSON.parse(created.stdout).result,
  };
}

function note(id, title) {
  return {
    id,
    title,
    claim: `${title}的观点。`,
    evidence: '生命周期测试原文。',
    boundary: '用于生命周期测试。',
    useCases: ['测试'],
  };
}

const rejected = createFixture(
  '拒绝后撤销',
  'https://mp.weixin.qq.com/s/reject-then-revoke',
  [note('L2-01', '已发布'), note('L2-02', '从未发布')]
);
let command = runCli([
  'pack', 'approve', rejected.pack.packFile, '--items', 'L2-01', '--json',
], rejected.root, rejected.home);
assert.strictEqual(command.status, 0, command.stderr || command.stdout);
command = runCli([
  'pack', 'reject', rejected.pack.packFile, '--json',
], rejected.root, rejected.home);
assert.strictEqual(command.status, 0, command.stderr || command.stdout);
const afterReject = snapshot(rejected.vault);

for (const args of [
  ['pack', 'approve', rejected.pack.packFile, '--items', 'L2-02', '--json'],
  ['pack', 'update', rejected.pack.packFile, '--manifest', rejected.manifestFile, '--json'],
]) {
  const blocked = runCli(args, rejected.root, rejected.home);
  assert.strictEqual(blocked.status, 1);
  assert.strictEqual(JSON.parse(blocked.stdout).error.code, 'PACK_ALREADY_EXISTS');
  assert.deepStrictEqual(snapshot(rejected.vault), afterReject);
}

command = runCli([
  'pack', 'revoke', rejected.pack.packFile, '--items', 'L2-01', '--json',
], rejected.root, rejected.home);
assert.strictEqual(command.status, 0, command.stderr || command.stdout);
assert.strictEqual(JSON.parse(command.stdout).result.status, 'revoked');
const rejectedState = JSON.parse(fs.readFileSync(rejected.pack.stateFile, 'utf8'));
assert.strictEqual(rejectedState.status, 'revoked');
assert.ok(rejectedState.rejectedAt);
assert.ok(rejectedState.revokedAt);
assert.deepStrictEqual(rejectedState.approvedItems, []);
assert.deepStrictEqual(rejectedState.revokedItems, ['L2-01']);
const afterRevoke = snapshot(rejected.vault);

const rejectRevoked = runCli([
  'pack', 'reject', rejected.pack.packFile, '--json',
], rejected.root, rejected.home);
assert.strictEqual(rejectRevoked.status, 1);
assert.strictEqual(JSON.parse(rejectRevoked.stdout).error.code, 'PACK_ALREADY_EXISTS');
assert.deepStrictEqual(snapshot(rejected.vault), afterRevoke);

const revokedRevisionManifest = JSON.parse(
  fs.readFileSync(rejected.manifestFile, 'utf8')
);
revokedRevisionManifest.atomicNotes[0].title = '撤销后的新修订';
fs.writeFileSync(
  rejected.manifestFile,
  JSON.stringify(revokedRevisionManifest, null, 2)
);
const revisedAfterRevoke = runCli([
  'pack', 'create', '--source', rejected.sourceFile,
  '--manifest', rejected.manifestFile, '--json',
], rejected.root, rejected.home);
assert.strictEqual(revisedAfterRevoke.status, 0, revisedAfterRevoke.stderr || revisedAfterRevoke.stdout);
const revisedAfterRevokeOutput = JSON.parse(revisedAfterRevoke.stdout);
assert.strictEqual(revisedAfterRevokeOutput.status, 'revised');
assert.strictEqual(revisedAfterRevokeOutput.result.revision, 2);
assert.strictEqual(revisedAfterRevokeOutput.result.status, 'pending');
const revokedHistory = JSON.parse(fs.readFileSync(path.join(
  path.dirname(rejected.pack.stateFile),
  'revisions',
  '1.json'
), 'utf8'));
assert.strictEqual(revokedHistory.status, 'superseded');
assert.ok(revokedHistory.revokedAt);
assert.deepStrictEqual(revokedHistory.revokedItems, ['L2-01']);

const approved = createFixture(
  '批准后拒绝非法',
  'https://mp.weixin.qq.com/s/reject-approved-invalid',
  [note('L2-01', '完整批准')]
);
command = runCli([
  'pack', 'approve', approved.pack.packFile, '--items', 'L2-01', '--json',
], approved.root, approved.home);
assert.strictEqual(command.status, 0, command.stderr || command.stdout);
const approvedSnapshot = snapshot(approved.vault);
command = runCli([
  'pack', 'reject', approved.pack.packFile, '--json',
], approved.root, approved.home);
assert.strictEqual(command.status, 1);
assert.strictEqual(JSON.parse(command.stdout).error.code, 'PACK_ALREADY_EXISTS');
assert.deepStrictEqual(snapshot(approved.vault), approvedSnapshot);

const rejectedTerminal = createFixture(
  '拒绝后重新加工',
  'https://mp.weixin.qq.com/s/revise-rejected',
  [note('L2-01', '原候选')]
);
command = runCli([
  'pack', 'reject', rejectedTerminal.pack.packFile, '--json',
], rejectedTerminal.root, rejectedTerminal.home);
assert.strictEqual(command.status, 0, command.stderr || command.stdout);
const repeatedRejectedCreate = runCli([
  'pack', 'create', '--source', rejectedTerminal.sourceFile,
  '--manifest', rejectedTerminal.manifestFile, '--json',
], rejectedTerminal.root, rejectedTerminal.home);
assert.strictEqual(
  repeatedRejectedCreate.status,
  0,
  repeatedRejectedCreate.stderr || repeatedRejectedCreate.stdout
);
assert.strictEqual(JSON.parse(repeatedRejectedCreate.stdout).status, 'unchanged');
assert.strictEqual(JSON.parse(repeatedRejectedCreate.stdout).result.status, 'rejected');
const rejectedRevisionManifest = JSON.parse(
  fs.readFileSync(rejectedTerminal.manifestFile, 'utf8')
);
rejectedRevisionManifest.atomicNotes[0].title = '拒绝后的新候选';
fs.writeFileSync(
  rejectedTerminal.manifestFile,
  JSON.stringify(rejectedRevisionManifest, null, 2)
);
const revisedAfterReject = runCli([
  'pack', 'create', '--source', rejectedTerminal.sourceFile,
  '--manifest', rejectedTerminal.manifestFile, '--json',
], rejectedTerminal.root, rejectedTerminal.home);
assert.strictEqual(revisedAfterReject.status, 0, revisedAfterReject.stderr || revisedAfterReject.stdout);
assert.strictEqual(JSON.parse(revisedAfterReject.stdout).status, 'revised');
const rejectedHistory = JSON.parse(fs.readFileSync(path.join(
  path.dirname(rejectedTerminal.pack.stateFile),
  'revisions',
  '1.json'
), 'utf8'));
assert.strictEqual(rejectedHistory.status, 'superseded');
assert.ok(rejectedHistory.rejectedAt);

const historical = createFixture(
  '历史修订撤销',
  'https://mp.weixin.qq.com/s/revoke-superseded',
  [note('L2-01', '旧修订')]
);
command = runCli([
  'pack', 'approve', historical.pack.packFile, '--items', 'L2-01', '--json',
], historical.root, historical.home);
assert.strictEqual(command.status, 0, command.stderr || command.stdout);
const revisionOneState = JSON.parse(fs.readFileSync(historical.pack.stateFile, 'utf8'));
const oldOutput = revisionOneState.outputs[0].file;
const revisedManifest = JSON.parse(fs.readFileSync(historical.manifestFile, 'utf8'));
revisedManifest.atomicNotes[0].title = '新修订';
fs.writeFileSync(historical.manifestFile, JSON.stringify(revisedManifest, null, 2));
command = runCli([
  'pack', 'create', '--source', historical.sourceFile,
  '--manifest', historical.manifestFile, '--json',
], historical.root, historical.home);
assert.strictEqual(command.status, 0, command.stderr || command.stdout);
const revisionTwo = JSON.parse(command.stdout).result;
const currentBeforeHistoricalRevoke = fs.readFileSync(revisionTwo.stateFile, 'utf8');
const revisionOneFile = path.join(
  path.dirname(revisionTwo.stateFile),
  'revisions',
  '1.json'
);
assert.strictEqual(JSON.parse(fs.readFileSync(revisionOneFile, 'utf8')).status, 'superseded');

command = runCli([
  'pack', 'revoke', historical.pack.packFile, '--items', 'L2-01', '--json',
], historical.root, historical.home);
assert.strictEqual(command.status, 0, command.stderr || command.stdout);
assert.strictEqual(fs.existsSync(oldOutput), false);
assert.strictEqual(fs.readFileSync(revisionTwo.stateFile, 'utf8'), currentBeforeHistoricalRevoke);
const oldRevisionAfter = JSON.parse(fs.readFileSync(revisionOneFile, 'utf8'));
assert.strictEqual(oldRevisionAfter.status, 'revoked');
assert.ok(oldRevisionAfter.supersededAt);
assert.deepStrictEqual(oldRevisionAfter.approvedItems, []);
assert.deepStrictEqual(oldRevisionAfter.revokedItems, ['L2-01']);
assert.match(fs.readFileSync(historical.pack.packFile, 'utf8'), /status: revoked/);

const incompleteSupersededAudit = {
  ...oldRevisionAfter,
  status: 'superseded',
};
delete incompleteSupersededAudit.revokedAt;
assert.throws(
  () => validatePackState(incompleteSupersededAudit, {
    vaultRoot: historical.vault,
    expectedPackId: historical.pack.packId,
    expectedPackFile: historical.pack.packFile,
  }),
  /撤销记录/
);

const missingSupersededAt = {
  ...oldRevisionAfter,
  status: 'superseded',
};
delete missingSupersededAt.supersededAt;
assert.throws(
  () => validatePackState(missingSupersededAt, {
    vaultRoot: historical.vault,
    expectedPackId: historical.pack.packId,
    expectedPackFile: historical.pack.packFile,
  }),
  /supersededAt/
);

const pendingWithSupersededAt = JSON.parse(
  fs.readFileSync(revisionTwo.stateFile, 'utf8')
);
pendingWithSupersededAt.supersededAt = '2099-01-01T00:00:00.000Z';
assert.throws(
  () => validatePackState(pendingWithSupersededAt, {
    vaultRoot: historical.vault,
    expectedPackId: historical.pack.packId,
    expectedPackFile: revisionTwo.packFile,
  }),
  /supersededAt/
);

console.log('pack reject/revoke lifecycle tests passed');
