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

function fileSnapshot(files) {
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

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'wechat-notebank-l4-'));
const home = path.join(root, 'home');
const vault = path.join(root, 'vault');
const sourceFile = path.join(vault, 'L1_原文', 'WeChat', '复盘发布原文.md');
const manifestFile = path.join(root, 'manifest.json');
const sourceUrl = 'https://mp.weixin.qq.com/s/l4-publication';
fs.mkdirSync(path.dirname(sourceFile), { recursive: true });
fs.mkdirSync(home, { recursive: true });
fs.writeFileSync(sourceFile, [
  '---',
  'title: 复盘发布原文',
  `sourceUrl: ${sourceUrl}`,
  '---',
  '',
  '真实回答是阅读复盘的起点。',
  '',
].join('\n'));

const initialManifest = {
  schemaVersion: 1,
  sourceFile,
  sourceUrl,
  processingGoal: '验证 L4 审批',
  atomicNotes: [{
    id: 'L2-01',
    title: '先保留原话',
    claim: '复盘必须先保留用户的原始回答。',
    evidence: '真实回答是阅读复盘的起点。',
    boundary: '适用于需要可追溯的阅读复盘。',
    useCases: ['个人学习'],
  }],
  materials: [],
  reviewQuestions: [
    { id: 'L4-Q01', question: '这篇文章改变了你的什么理解？' },
    { id: 'L4-Q02', question: '你准备采取什么行动？' },
  ],
};
fs.writeFileSync(manifestFile, JSON.stringify(initialManifest, null, 2));

const created = runCli([
  'pack', 'create', '--source', sourceFile, '--manifest', manifestFile, '--json',
], root, home);
assert.strictEqual(created.status, 0, created.stderr || created.stdout);
const pack = JSON.parse(created.stdout).result;

const l2Approved = runCli([
  'pack', 'approve', pack.packFile, '--items', 'L2-01', '--json',
], root, home);
assert.strictEqual(l2Approved.status, 0, l2Approved.stderr || l2Approved.stdout);
assert.strictEqual(JSON.parse(l2Approved.stdout).result.status, 'partial');

const revisionStateFile = path.join(path.dirname(pack.stateFile), 'revisions', '1.json');
const stableFiles = [sourceFile, pack.packFile, pack.stateFile, revisionStateFile];
const beforeNoAnswer = fileSnapshot(stableFiles);
const noAnswerApproval = runCli([
  'pack', 'approve', pack.packFile,
  '--items', 'L4-Q01,L4-Q02',
  '--json',
], root, home);
assert.strictEqual(noAnswerApproval.status, 1);
assert.strictEqual(JSON.parse(noAnswerApproval.stdout).error.code, 'MANIFEST_INVALID');
assertSnapshot(stableFiles, beforeNoAnswer);

const partialManifest = {
  ...initialManifest,
  reviewAnswers: {
    'L4-Q01': '我意识到，整理稿不能代替我当时的原话。',
  },
  reviewDraft: '我希望把原话和后续整理分层保存。',
};
fs.writeFileSync(manifestFile, JSON.stringify(partialManifest, null, 2));
const partialUpdate = runCli([
  'pack', 'update', pack.packFile, '--manifest', manifestFile, '--json',
], root, home);
assert.strictEqual(partialUpdate.status, 0, partialUpdate.stderr || partialUpdate.stdout);
assert.strictEqual(JSON.parse(partialUpdate.stdout).result.status, 'partial');

const beforePartialAnswer = fileSnapshot(stableFiles);
const partialApproval = runCli([
  'pack', 'approve', pack.packFile,
  '--items', 'L4-Q01,L4-Q02',
  '--json',
], root, home);
assert.strictEqual(partialApproval.status, 1);
assert.strictEqual(JSON.parse(partialApproval.stdout).error.code, 'MANIFEST_INVALID');
assertSnapshot(stableFiles, beforePartialAnswer);

const completeManifest = {
  ...partialManifest,
  reviewAnswers: {
    ...partialManifest.reviewAnswers,
    'L4-Q02': '我会在每次阅读后先记录原话，再让 Agent 整理。',
  },
  reviewDraft: '这次阅读让我形成了一条可执行规则：先锁定原始回答，再生成明确标记的 Agent 整理稿。',
};
fs.writeFileSync(manifestFile, JSON.stringify(completeManifest, null, 2));
const completeUpdate = runCli([
  'pack', 'update', pack.packFile, '--manifest', manifestFile, '--json',
], root, home);
assert.strictEqual(completeUpdate.status, 0, completeUpdate.stderr || completeUpdate.stdout);

const beforePartialSelection = fileSnapshot(stableFiles);
const partialSelection = runCli([
  'pack', 'approve', pack.packFile,
  '--items', 'L4-Q01',
  '--json',
], root, home);
assert.strictEqual(partialSelection.status, 1);
assert.strictEqual(JSON.parse(partialSelection.stdout).error.code, 'MANIFEST_INVALID');
assertSnapshot(stableFiles, beforePartialSelection);

const approved = runCli([
  'pack', 'approve', pack.packFile,
  '--items', 'L4-Q01,L4-Q02',
  '--json',
], root, home);
assert.strictEqual(approved.status, 0, approved.stderr || approved.stdout);
assert.strictEqual(approved.stderr, '');
const approvedOutput = JSON.parse(approved.stdout);
assert.strictEqual(approvedOutput.ok, true);
assert.strictEqual(approvedOutput.command, 'pack.approve');
assert.strictEqual(approvedOutput.status, 'approved');
assert.strictEqual(approvedOutput.result.action, 'publish');
assert.strictEqual(approvedOutput.result.status, 'approved');
assert.deepStrictEqual(approvedOutput.result.approvedItems, [
  'L2-01',
  'L4-Q01',
  'L4-Q02',
]);

const sourcePrefix = crypto.createHash('sha256').update(sourceUrl).digest('hex').slice(0, 12);
const l4File = path.join(
  vault,
  'L4_阅读复盘',
  `复盘发布原文-${sourcePrefix}.md`
);
assert.strictEqual(fs.existsSync(l4File), true);
assert.strictEqual(approvedOutput.result.publishedFiles.includes(l4File), true);
assert.deepStrictEqual(fs.readdirSync(path.dirname(l4File)), [path.basename(l4File)]);

const l4Content = fs.readFileSync(l4File, 'utf8');
assert.match(l4Content, /layer: L4/);
assert.match(l4Content, /## 用户原始回答/);
assert.match(l4Content, /整理稿不能代替我当时的原话/);
assert.match(l4Content, /每次阅读后先记录原话/);
assert.match(l4Content, /## Agent 整理稿/);
assert.match(l4Content, /先锁定原始回答/);
assert.match(l4Content, /\[\[L1_原文\/WeChat\/复盘发布原文\|复盘发布原文\]\]/);
assert.match(l4Content, new RegExp(`\\[\\[Inbox/复盘发布原文-${pack.packId.slice(0, 12)}-r1\\|`));

const state = JSON.parse(fs.readFileSync(pack.stateFile, 'utf8'));
assert.strictEqual(state.status, 'approved');
const l4Output = state.outputs.find((output) => output.kind === 'L4');
assert.deepStrictEqual(l4Output.itemIds, ['L4-Q01', 'L4-Q02']);
assert.strictEqual(l4Output.file, l4File);
assert.strictEqual(
  l4Output.sha256,
  crypto.createHash('sha256').update(l4Content).digest('hex')
);

const sourceContent = fs.readFileSync(sourceFile, 'utf8');
const packContent = fs.readFileSync(pack.packFile, 'utf8');
assert.match(sourceContent, new RegExp(`\\[\\[L4_阅读复盘/复盘发布原文-${sourcePrefix}\\|L4 阅读复盘\\]\\]`));
assert.match(packContent, new RegExp(`\\[\\[L4_阅读复盘/复盘发布原文-${sourcePrefix}\\|L4 阅读复盘\\]\\]`));
assert.match(packContent, /status: approved/);

const idempotentFiles = [sourceFile, pack.packFile, pack.stateFile, revisionStateFile, l4File];
const beforeRepeat = fileSnapshot(idempotentFiles);
const repeatedApproval = runCli([
  'pack', 'approve', pack.packFile,
  '--items', 'L4-Q01,L4-Q02',
  '--json',
], root, home);
assert.strictEqual(
  repeatedApproval.status,
  0,
  repeatedApproval.stderr || repeatedApproval.stdout
);
const repeatedOutput = JSON.parse(repeatedApproval.stdout);
assert.strictEqual(repeatedOutput.status, 'unchanged');
assert.strictEqual(repeatedOutput.result.action, 'reuse');
assertSnapshot(idempotentFiles, beforeRepeat);

const changedPublishedManifest = {
  ...completeManifest,
  reviewDraft: '这是发布后试图覆盖的整理稿。',
};
fs.writeFileSync(manifestFile, JSON.stringify(changedPublishedManifest, null, 2));
const beforePublishedUpdate = fileSnapshot(idempotentFiles);
const publishedUpdate = runCli([
  'pack', 'update', pack.packFile, '--manifest', manifestFile, '--json',
], root, home);
assert.strictEqual(publishedUpdate.status, 1);
assert.strictEqual(JSON.parse(publishedUpdate.stdout).error.code, 'MANIFEST_INVALID');
assertSnapshot(idempotentFiles, beforePublishedUpdate);

const corruptedState = JSON.parse(fs.readFileSync(pack.stateFile, 'utf8'));
delete corruptedState.manifest.reviewAnswers;
delete corruptedState.manifest.reviewDraft;
fs.writeFileSync(pack.stateFile, `${JSON.stringify(corruptedState, null, 2)}\n`);
const corruptedPublishedState = runCli([
  'pack', 'approve', pack.packFile,
  '--items', 'L4-Q01,L4-Q02',
  '--json',
], root, home);
assert.strictEqual(corruptedPublishedState.status, 1);
assert.strictEqual(
  JSON.parse(corruptedPublishedState.stdout).error.code,
  'PACK_ALREADY_EXISTS'
);

console.log('pack L4 json tests passed');
