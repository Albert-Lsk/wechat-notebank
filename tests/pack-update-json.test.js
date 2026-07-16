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

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'wechat-notebank-pack-update-'));
const home = path.join(root, 'home');
const vault = path.join(root, 'vault');
const sourceFile = path.join(vault, 'L1_原文', 'WeChat', '复盘原文.md');
const initialManifestFile = path.join(root, 'initial-manifest.json');
const updatedManifestFile = path.join(root, 'updated-manifest.json');
const sourceUrl = 'https://mp.weixin.qq.com/s/pack-update-review';
fs.mkdirSync(path.dirname(sourceFile), { recursive: true });
fs.mkdirSync(home, { recursive: true });
fs.writeFileSync(sourceFile, [
  '---',
  'title: 复盘原文',
  `sourceUrl: ${sourceUrl}`,
  '---',
  '',
  '这是用于阅读复盘的原文。',
  '',
].join('\n'));

const initialManifest = {
  schemaVersion: 1,
  sourceFile,
  sourceUrl,
  processingGoal: null,
  atomicNotes: [],
  materials: [],
  reviewQuestions: [
    { id: 'L4-Q01', question: '你从文章中学到了什么？' },
    { id: 'L4-Q02', question: '你会如何应用它？' },
  ],
};
fs.writeFileSync(initialManifestFile, JSON.stringify(initialManifest, null, 2));

const created = runCli([
  'pack', 'create',
  '--source', sourceFile,
  '--manifest', initialManifestFile,
  '--json',
], root, home);
assert.strictEqual(created.status, 0, created.stderr || created.stdout);
const createdOutput = JSON.parse(created.stdout);

const answersOnlyManifest = {
  ...initialManifest,
  reviewAnswers: {
    'L4-Q01': '我学到了，复盘必须建立在真实回答上。',
  },
};
fs.writeFileSync(updatedManifestFile, JSON.stringify(answersOnlyManifest, null, 2));
const answersOnlyUpdate = runCli([
  'pack', 'update', createdOutput.result.packFile,
  '--manifest', updatedManifestFile,
  '--json',
], root, home);
assert.strictEqual(
  answersOnlyUpdate.status,
  0,
  answersOnlyUpdate.stderr || answersOnlyUpdate.stdout
);
const answersOnlyOutput = JSON.parse(answersOnlyUpdate.stdout);
assert.deepStrictEqual(answersOnlyOutput.result.answeredQuestionIds, ['L4-Q01']);
assert.strictEqual(answersOnlyOutput.result.hasReviewDraft, false);
assert.strictEqual(fs.existsSync(path.join(vault, 'L4_阅读复盘')), false);

const updatedManifest = {
  ...answersOnlyManifest,
  reviewDraft: '这篇文章让我确认，阅读复盘应从自己的原始理解出发。',
};
fs.writeFileSync(updatedManifestFile, JSON.stringify(updatedManifest, null, 2));

const updated = runCli([
  'pack', 'update', createdOutput.result.packFile,
  '--manifest', updatedManifestFile,
  '--json',
], root, home);
assert.strictEqual(updated.status, 0, updated.stderr || updated.stdout);
assert.strictEqual(updated.stderr, '');
const updatedOutput = JSON.parse(updated.stdout);
assert.strictEqual(updatedOutput.ok, true);
assert.strictEqual(updatedOutput.command, 'pack.update');
assert.strictEqual(updatedOutput.status, 'updated');
assert.strictEqual(updatedOutput.result.action, 'update');
assert.strictEqual(updatedOutput.result.status, 'pending');
assert.deepStrictEqual(updatedOutput.result.answeredQuestionIds, ['L4-Q01']);
assert.strictEqual(updatedOutput.result.hasReviewDraft, true);

const state = JSON.parse(fs.readFileSync(createdOutput.result.stateFile, 'utf8'));
assert.deepStrictEqual(state.manifest.reviewAnswers, updatedManifest.reviewAnswers);
assert.strictEqual(state.manifest.reviewDraft, updatedManifest.reviewDraft);
assert.deepStrictEqual(
  JSON.parse(fs.readFileSync(
    path.join(path.dirname(createdOutput.result.stateFile), 'revisions', '1.json'),
    'utf8'
  )),
  state
);

const visiblePack = fs.readFileSync(createdOutput.result.packFile, 'utf8');
assert.match(visiblePack, /## 用户原始回答/);
assert.match(visiblePack, /L4-Q01/);
assert.match(visiblePack, /我学到了，复盘必须建立在真实回答上/);
assert.match(visiblePack, /## Agent 整理稿/);
assert.match(visiblePack, /阅读复盘应从自己的原始理解出发/);
assert.strictEqual(fs.existsSync(path.join(vault, 'L4_阅读复盘')), false);

const revisionStateFile = path.join(
  path.dirname(createdOutput.result.stateFile),
  'revisions',
  '1.json'
);
const updateFiles = [createdOutput.result.packFile, createdOutput.result.stateFile, revisionStateFile];
const beforeRepeat = new Map(updateFiles.map((file) => [file, {
  content: fs.readFileSync(file, 'utf8'),
  mtimeMs: fs.statSync(file).mtimeMs,
}]));
const repeatedUpdate = runCli([
  'pack', 'update', createdOutput.result.packFile,
  '--manifest', updatedManifestFile,
  '--json',
], root, home);
assert.strictEqual(repeatedUpdate.status, 0, repeatedUpdate.stderr || repeatedUpdate.stdout);
const repeatedOutput = JSON.parse(repeatedUpdate.stdout);
assert.strictEqual(repeatedOutput.status, 'unchanged');
assert.strictEqual(repeatedOutput.result.action, 'reuse');
for (const file of updateFiles) {
  assert.strictEqual(fs.readFileSync(file, 'utf8'), beforeRepeat.get(file).content);
  assert.strictEqual(fs.statSync(file).mtimeMs, beforeRepeat.get(file).mtimeMs);
}

const rewrittenAnswerManifest = {
  ...updatedManifest,
  reviewAnswers: {
    'L4-Q01': '这是被改写的回答，不应被接受。',
  },
};
fs.writeFileSync(updatedManifestFile, JSON.stringify(rewrittenAnswerManifest, null, 2));
const beforeRewriteAttempt = new Map(updateFiles.map(
  (file) => [file, fs.readFileSync(file, 'utf8')]
));
const rewriteAttempt = runCli([
  'pack', 'update', createdOutput.result.packFile,
  '--manifest', updatedManifestFile,
  '--json',
], root, home);
assert.strictEqual(rewriteAttempt.status, 1);
assert.strictEqual(JSON.parse(rewriteAttempt.stdout).error.code, 'MANIFEST_INVALID');
for (const file of updateFiles) {
  assert.strictEqual(fs.readFileSync(file, 'utf8'), beforeRewriteAttempt.get(file));
}

const completedManifest = {
  ...updatedManifest,
  reviewAnswers: {
    ...updatedManifest.reviewAnswers,
    'L4-Q02': '我会先保留原话，再让 Agent 整理成可复用的表达。',
  },
  reviewDraft: '我的应用原则是：原话作为事实层保留，Agent 整理稿作为表达层单独存放。',
};
fs.writeFileSync(updatedManifestFile, JSON.stringify(completedManifest, null, 2));
const completedUpdate = runCli([
  'pack', 'update', createdOutput.result.packFile,
  '--manifest', updatedManifestFile,
  '--json',
], root, home);
assert.strictEqual(completedUpdate.status, 0, completedUpdate.stderr || completedUpdate.stdout);
const completedOutput = JSON.parse(completedUpdate.stdout);
assert.strictEqual(completedOutput.status, 'updated');
assert.deepStrictEqual(completedOutput.result.answeredQuestionIds, ['L4-Q01', 'L4-Q02']);
const completedState = JSON.parse(fs.readFileSync(createdOutput.result.stateFile, 'utf8'));
assert.strictEqual(
  completedState.manifest.reviewAnswers['L4-Q01'],
  updatedManifest.reviewAnswers['L4-Q01']
);
assert.strictEqual(
  completedState.manifest.reviewAnswers['L4-Q02'],
  completedManifest.reviewAnswers['L4-Q02']
);

fs.writeFileSync(initialManifestFile, JSON.stringify(initialManifest, null, 2));
const repeatedCreate = runCli([
  'pack', 'create',
  '--source', sourceFile,
  '--manifest', initialManifestFile,
  '--json',
], root, home);
assert.strictEqual(repeatedCreate.status, 0, repeatedCreate.stderr || repeatedCreate.stdout);
const repeatedCreateOutput = JSON.parse(repeatedCreate.stdout);
assert.strictEqual(repeatedCreateOutput.status, 'unchanged');
assert.strictEqual(repeatedCreateOutput.result.action, 'reuse');
assert.strictEqual(repeatedCreateOutput.result.revision, 1);
assert.strictEqual(repeatedCreateOutput.result.packFile, createdOutput.result.packFile);

console.log('pack update json tests passed');
