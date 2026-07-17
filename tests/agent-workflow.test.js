const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const projectRoot = path.resolve(__dirname, '..');
const cliPath = path.join(projectRoot, 'dist', 'index.js');
const mockPuppeteerPath = path.join(__dirname, 'helpers', 'mock-puppeteer.js');
const articleFixturePath = path.join(__dirname, 'fixtures', 'wechat-article.html');
const skillRoot = path.join(projectRoot, 'skills', 'alskai-notebank');
const skillEntry = fs.readFileSync(path.join(skillRoot, 'SKILL.md'), 'utf8');
const archiveReference = fs.readFileSync(
  path.join(skillRoot, 'references', 'archive.md'),
  'utf8'
);
const processingReference = fs.readFileSync(
  path.join(skillRoot, 'references', 'processing.md'),
  'utf8'
);
const reviewReference = fs.readFileSync(
  path.join(skillRoot, 'references', 'review.md'),
  'utf8'
);

assert.match(skillEntry, /references\/archive\.md/);
assert.match(skillEntry, /references\/processing\.md/);
assert.match(skillEntry, /references\/review\.md/);
assert.match(archiveReference, /only save[^\n]*autoProcess/i);
assert.match(archiveReference, /when it is `true`[^\n]*only results with status `saved`/i);
assert.match(processingReference, /pack create[^\n]*--json/);
assert.match(reviewReference, /do not run[^\n]*pack approve[^\n]*until/i);

function decideProcessing(fetchOutput, request = {}) {
  if (request.onlySave) {
    return { process: false, processingGoal: null };
  }
  const explicitlyRequested = request.saveAndProcess === true;
  const isSaved = fetchOutput.status === 'saved';
  const isKnownExisting = fetchOutput.status === 'skipped'
    && fetchOutput.result.reason === 'SOURCE_URL_EXISTS';
  const process = explicitlyRequested
    ? isSaved || isKnownExisting
    : isSaved && fetchOutput.result.autoProcess;
  return {
    process,
    processingGoal: request.processingGoal === undefined
      ? fetchOutput.result.processingGoal
      : request.processingGoal,
  };
}

function runCli(args, homePath) {
  return spawnSync(process.execPath, [cliPath, ...args], {
    cwd: homePath,
    encoding: 'utf8',
    env: {
      ...process.env,
      HOME: homePath,
      NODE_OPTIONS: `--require=${mockPuppeteerPath}`,
      WECHAT_NOTEBANK_TEST_HTML_FILE: articleFixturePath,
    },
  });
}

function parseSuccess(result) {
  assert.strictEqual(result.status, 0, result.stderr || result.stdout);
  const output = JSON.parse(result.stdout);
  assert.strictEqual(output.ok, true);
  return output;
}

const defaultHome = fs.mkdtempSync(path.join(os.tmpdir(), 'notebank-agent-default-'));
const defaultArchive = path.join(defaultHome, 'vault', 'L1_原文', 'WeChat');
const defaultFetch = parseSuccess(runCli([
  'fetch',
  'https://mp.weixin.qq.com/s/agent-default-save',
  '--output',
  defaultArchive,
  '--json',
], defaultHome));
assert.strictEqual(defaultFetch.status, 'saved');
assert.strictEqual(defaultFetch.result.autoProcess, false);
assert.strictEqual(defaultFetch.result.processingGoal, null);
assert.deepStrictEqual(decideProcessing(defaultFetch), {
  process: false,
  processingGoal: null,
});
assert.strictEqual(fs.existsSync(defaultFetch.result.savedFile), true);
assert.strictEqual(fs.existsSync(path.join(defaultHome, 'vault', 'Inbox')), false);
assert.strictEqual(
  fs.existsSync(path.join(defaultHome, 'vault', '.alskai-notebank')),
  false
);

const autoHome = fs.mkdtempSync(path.join(os.tmpdir(), 'notebank-agent-auto-'));
const vault = path.join(autoHome, 'vault');
const archivePath = path.join(vault, 'L1_原文', 'WeChat');
fs.writeFileSync(path.join(autoHome, '.wechat-notebank.json'), JSON.stringify({
  name: 'Agent workflow',
  archivePath,
  createdAt: '2026-07-17T00:00:00.000Z',
  processingGoal: '配置中的加工目标',
  autoProcess: true,
}, null, 2));

const autoFetch = parseSuccess(runCli([
  'fetch',
  'https://mp.weixin.qq.com/s/agent-auto-process',
  '--json',
], autoHome));
assert.strictEqual(autoFetch.status, 'saved');
assert.strictEqual(autoFetch.result.autoProcess, true);
assert.strictEqual(autoFetch.result.processingGoal, '配置中的加工目标');
const processingDecision = decideProcessing(autoFetch, {
  processingGoal: '本次请求覆盖后的加工目标',
});
assert.deepStrictEqual(processingDecision, {
  process: true,
  processingGoal: '本次请求覆盖后的加工目标',
});
assert.deepStrictEqual(decideProcessing(autoFetch, { onlySave: true }), {
  process: false,
  processingGoal: null,
});

const manifestFile = path.join(autoHome, 'manifest.json');
const initialManifest = {
  schemaVersion: 1,
  sourceFile: autoFetch.result.savedFile,
  sourceUrl: autoFetch.result.sourceUrl,
  processingGoal: processingDecision.processingGoal,
  atomicNotes: [{
    id: 'L2-01',
    title: '保存与加工职责分离',
    claim: '自动加工只创建待审核内容，不代表用户批准发布。',
    evidence: '这是一篇用于验证 CLI 保存行为的文章。',
    boundary: '适用于启用 autoProcess 的已保存文章。',
    useCases: ['知识库审核'],
  }],
  materials: [],
  reviewQuestions: [
    { id: 'L4-Q01', question: '这篇文章改变了你的什么理解？' },
    { id: 'L4-Q02', question: '你准备采取什么行动？' },
  ],
};
fs.writeFileSync(manifestFile, JSON.stringify(initialManifest, null, 2));

const created = parseSuccess(runCli([
  'pack',
  'create',
  '--source',
  autoFetch.result.savedFile,
  '--manifest',
  manifestFile,
  '--json',
], autoHome));
assert.strictEqual(created.status, 'created');
assert.strictEqual(created.result.status, 'pending');
assert.strictEqual(
  created.result.processingGoal,
  '本次请求覆盖后的加工目标'
);
assert.strictEqual(fs.existsSync(created.result.packFile), true);
assert.strictEqual(fs.existsSync(path.join(vault, 'L2_原子卡片')), false);
assert.strictEqual(fs.existsSync(path.join(vault, 'L4_阅读复盘')), false);

const duplicateFetch = parseSuccess(runCli([
  'fetch',
  'https://mp.weixin.qq.com/s/agent-auto-process',
  '--json',
], autoHome));
assert.strictEqual(duplicateFetch.status, 'skipped');
assert.strictEqual(duplicateFetch.result.reason, 'SOURCE_URL_EXISTS');
assert.strictEqual(duplicateFetch.result.savedFile, autoFetch.result.savedFile);
assert.deepStrictEqual(decideProcessing(duplicateFetch), {
  process: false,
  processingGoal: '配置中的加工目标',
});
const duplicateDecision = decideProcessing(duplicateFetch, {
  saveAndProcess: true,
  processingGoal: '同一原文的第二个目标',
});
assert.strictEqual(duplicateDecision.process, true);
const secondGoalManifestFile = path.join(autoHome, 'manifest-second-goal.json');
fs.writeFileSync(secondGoalManifestFile, JSON.stringify({
  ...initialManifest,
  processingGoal: duplicateDecision.processingGoal,
}, null, 2));
const secondGoalPack = parseSuccess(runCli([
  'pack',
  'create',
  '--source',
  duplicateFetch.result.savedFile,
  '--manifest',
  secondGoalManifestFile,
  '--json',
], autoHome));
assert.strictEqual(secondGoalPack.status, 'created');
assert.strictEqual(secondGoalPack.result.status, 'pending');
assert.notStrictEqual(secondGoalPack.result.packId, created.result.packId);

const partialApproval = parseSuccess(runCli([
  'pack',
  'approve',
  created.result.packFile,
  '--items',
  'L2-01',
  '--json',
], autoHome));
assert.strictEqual(partialApproval.status, 'partial');
assert.deepStrictEqual(partialApproval.result.approvedItems, ['L2-01']);
const l2File = partialApproval.result.publishedFiles[0];
assert.strictEqual(fs.existsSync(l2File), true);

const stateBeforeAnswers = JSON.parse(fs.readFileSync(created.result.stateFile, 'utf8'));
const answeredManifest = {
  ...stateBeforeAnswers.manifest,
  reviewAnswers: {
    'L4-Q01': '我确认自动加工只应生成候选，最终发布必须由我决定。',
    'L4-Q02': '以后我会先检查稳定 ID，再明确选择要发布的内容。',
  },
  reviewDraft: 'Agent 整理稿：将自动加工与人工审批保持为两个独立步骤。',
};
fs.writeFileSync(manifestFile, JSON.stringify(answeredManifest, null, 2));
const updated = parseSuccess(runCli([
  'pack',
  'update',
  created.result.packFile,
  '--manifest',
  manifestFile,
  '--json',
], autoHome));
assert.strictEqual(updated.status, 'updated');
assert.deepStrictEqual(updated.result.answeredQuestionIds, ['L4-Q01', 'L4-Q02']);
assert.strictEqual(updated.result.hasReviewDraft, true);

const l4Approval = parseSuccess(runCli([
  'pack',
  'approve',
  created.result.packFile,
  '--items',
  'L4-Q01,L4-Q02',
  '--json',
], autoHome));
assert.strictEqual(l4Approval.status, 'approved');
assert.deepStrictEqual(l4Approval.result.approvedItems, [
  'L2-01',
  'L4-Q01',
  'L4-Q02',
]);
const l4File = l4Approval.result.publishedFiles.find(
  (file) => file.includes(`${path.sep}L4_阅读复盘${path.sep}`)
);
assert.ok(l4File);
assert.match(fs.readFileSync(l4File, 'utf8'), /我确认自动加工只应生成候选/);
assert.match(fs.readFileSync(l4File, 'utf8'), /Agent 整理稿/);

const revoked = parseSuccess(runCli([
  'pack',
  'revoke',
  created.result.packFile,
  '--items',
  'L2-01',
  '--json',
], autoHome));
assert.strictEqual(revoked.status, 'revoked');
assert.deepStrictEqual(revoked.result.revokedItems, ['L2-01']);
assert.deepStrictEqual(revoked.result.approvedItems, ['L4-Q01', 'L4-Q02']);
assert.deepStrictEqual(revoked.result.removedFiles, [l2File]);
assert.strictEqual(fs.existsSync(l2File), false);
assert.strictEqual(fs.existsSync(l4File), true);

console.log('agent workflow tests passed');
