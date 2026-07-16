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

function snapshot(files) {
  return new Map(files.map((file) => [file, {
    content: fs.readFileSync(file, 'utf8'),
    mtimeMs: fs.statSync(file).mtimeMs,
  }]));
}

function assertSnapshot(files, expected) {
  for (const file of files) {
    assert.strictEqual(fs.readFileSync(file, 'utf8'), expected.get(file).content);
    assert.strictEqual(fs.statSync(file).mtimeMs, expected.get(file).mtimeMs);
  }
}

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'wechat-notebank-reject-'));
const home = path.join(root, 'home');
const vault = path.join(root, 'vault');
const sourceFile = path.join(vault, 'L1_原文', 'WeChat', '拒绝加工原文.md');
const manifestFile = path.join(root, 'manifest.json');
const sourceUrl = 'https://mp.weixin.qq.com/s/pack-reject';
fs.mkdirSync(path.dirname(sourceFile), { recursive: true });
fs.mkdirSync(home, { recursive: true });
fs.writeFileSync(sourceFile, [
  '---',
  'title: 拒绝加工原文',
  `sourceUrl: ${sourceUrl}`,
  '---',
  '',
  '用户可以拒绝尚未发布的候选。',
  '',
].join('\n'));
fs.writeFileSync(manifestFile, JSON.stringify({
  schemaVersion: 1,
  sourceFile,
  sourceUrl,
  processingGoal: null,
  atomicNotes: [{
    id: 'L2-01',
    title: '拒绝候选',
    claim: '拒绝后不能继续审批当前 revision。',
    evidence: '用户可以拒绝尚未发布的候选。',
    boundary: '适用于待审核加工包。',
    useCases: ['审核'],
  }],
  materials: [],
  reviewQuestions: [],
}, null, 2));

const created = runCli([
  'pack', 'create', '--source', sourceFile, '--manifest', manifestFile, '--json',
], root, home);
assert.strictEqual(created.status, 0, created.stderr || created.stdout);
const pack = JSON.parse(created.stdout).result;
const revisionStateFile = path.join(
  path.dirname(pack.stateFile),
  'revisions',
  '1.json'
);
const sourceBeforeReject = fs.readFileSync(sourceFile, 'utf8');

const rejected = runCli([
  'pack', 'reject', pack.packFile, '--json',
], root, home);
assert.strictEqual(rejected.status, 0, rejected.stderr || rejected.stdout);
assert.strictEqual(rejected.stderr, '');
const rejectedOutput = JSON.parse(rejected.stdout);
assert.strictEqual(rejectedOutput.ok, true);
assert.strictEqual(rejectedOutput.command, 'pack.reject');
assert.strictEqual(rejectedOutput.status, 'rejected');
assert.strictEqual(rejectedOutput.result.action, 'reject');
assert.strictEqual(rejectedOutput.result.status, 'rejected');
assert.strictEqual(rejectedOutput.result.packId, pack.packId);
assert.deepStrictEqual(rejectedOutput.result.approvedItems, []);
assert.deepStrictEqual(rejectedOutput.result.publishedFiles, []);

const state = JSON.parse(fs.readFileSync(pack.stateFile, 'utf8'));
assert.strictEqual(state.status, 'rejected');
assert.match(state.rejectedAt, /^\d{4}-\d{2}-\d{2}T/);
assert.deepStrictEqual(state.approvedItems, []);
assert.deepStrictEqual(state.outputs, []);
assert.deepStrictEqual(
  JSON.parse(fs.readFileSync(revisionStateFile, 'utf8')),
  state
);
assert.match(fs.readFileSync(pack.packFile, 'utf8'), /status: rejected/);
assert.match(fs.readFileSync(pack.packFile, 'utf8'), /rejectedAt:/);
assert.strictEqual(fs.readFileSync(sourceFile, 'utf8'), sourceBeforeReject);

const stableFiles = [sourceFile, pack.packFile, pack.stateFile, revisionStateFile];
const beforeRepeat = snapshot(stableFiles);
const repeated = runCli([
  'pack', 'reject', pack.packFile, '--json',
], root, home);
assert.strictEqual(repeated.status, 0, repeated.stderr || repeated.stdout);
const repeatedOutput = JSON.parse(repeated.stdout);
assert.strictEqual(repeatedOutput.status, 'unchanged');
assert.strictEqual(repeatedOutput.result.action, 'reuse');
assertSnapshot(stableFiles, beforeRepeat);

const approvalAfterReject = runCli([
  'pack', 'approve', pack.packFile, '--items', 'L2-01', '--json',
], root, home);
assert.strictEqual(approvalAfterReject.status, 1);
assert.strictEqual(
  JSON.parse(approvalAfterReject.stdout).error.code,
  'PACK_ALREADY_EXISTS'
);
assertSnapshot(stableFiles, beforeRepeat);

const partialSource = path.join(vault, 'L1_原文', 'WeChat', '部分拒绝原文.md');
const partialManifestFile = path.join(root, 'partial-manifest.json');
const partialUrl = 'https://mp.weixin.qq.com/s/pack-reject-partial';
fs.writeFileSync(partialSource, [
  '---',
  'title: 部分拒绝原文',
  `sourceUrl: ${partialUrl}`,
  '---',
  '',
  '已经发布的内容不能被 reject 隐式撤销。',
  '',
].join('\n'));
fs.writeFileSync(partialManifestFile, JSON.stringify({
  schemaVersion: 1,
  sourceFile: partialSource,
  sourceUrl: partialUrl,
  processingGoal: null,
  atomicNotes: [
    {
      id: 'L2-01',
      title: '保留已发布内容',
      claim: '拒绝剩余候选时保留已发布内容。',
      evidence: '已经发布的内容不能被 reject 隐式撤销。',
      boundary: '适用于 partial 加工包。',
      useCases: ['审核'],
    },
    {
      id: 'L2-02',
      title: '拒绝未发布内容',
      claim: '这条候选不应发布。',
      evidence: '已经发布的内容不能被 reject 隐式撤销。',
      boundary: '适用于 partial 加工包。',
      useCases: [],
    },
  ],
  materials: [],
  reviewQuestions: [],
}, null, 2));
const partialCreated = runCli([
  'pack', 'create', '--source', partialSource,
  '--manifest', partialManifestFile, '--json',
], root, home);
assert.strictEqual(
  partialCreated.status,
  0,
  partialCreated.stderr || partialCreated.stdout
);
const partialPack = JSON.parse(partialCreated.stdout).result;
const partialApproved = runCli([
  'pack', 'approve', partialPack.packFile, '--items', 'L2-01', '--json',
], root, home);
assert.strictEqual(
  partialApproved.status,
  0,
  partialApproved.stderr || partialApproved.stdout
);
const partialStateBeforeReject = JSON.parse(
  fs.readFileSync(partialPack.stateFile, 'utf8')
);
const publishedL2 = partialStateBeforeReject.outputs[0].file;
const partialSourceBeforeReject = fs.readFileSync(partialSource, 'utf8');
const publishedContentBeforeReject = fs.readFileSync(publishedL2, 'utf8');
const partialRejected = runCli([
  'pack', 'reject', partialPack.packFile, '--json',
], root, home);
assert.strictEqual(
  partialRejected.status,
  0,
  partialRejected.stderr || partialRejected.stdout
);
const partialRejectedOutput = JSON.parse(partialRejected.stdout);
assert.strictEqual(partialRejectedOutput.status, 'rejected');
assert.deepStrictEqual(partialRejectedOutput.result.approvedItems, ['L2-01']);
assert.deepStrictEqual(partialRejectedOutput.result.publishedFiles, [publishedL2]);
const partialRejectedState = JSON.parse(
  fs.readFileSync(partialPack.stateFile, 'utf8')
);
assert.strictEqual(partialRejectedState.status, 'rejected');
assert.deepStrictEqual(partialRejectedState.approvedItems, ['L2-01']);
assert.strictEqual(partialRejectedState.outputs.length, 1);
assert.strictEqual(fs.readFileSync(partialSource, 'utf8'), partialSourceBeforeReject);
assert.strictEqual(fs.readFileSync(publishedL2, 'utf8'), publishedContentBeforeReject);

console.log('pack reject json tests passed');
