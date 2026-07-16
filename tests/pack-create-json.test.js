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

function createSource(root, sourceUrl) {
  const sourceDirectory = path.join(root, 'vault', 'L1_原文', 'WeChat');
  const sourceFile = path.join(sourceDirectory, '源文章.md');
  fs.mkdirSync(sourceDirectory, { recursive: true });
  const content = [
    '---',
    'title: 源文章',
    `sourceUrl: ${sourceUrl}`,
    '---',
    '',
    '# 源文章',
    '',
    '这是未经加工的原文。',
    '',
  ].join('\n');
  fs.writeFileSync(sourceFile, content);
  return { sourceFile, content };
}

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'wechat-notebank-pack-'));
const home = path.join(root, 'home');
fs.mkdirSync(home, { recursive: true });
const sourceUrl = 'https://mp.weixin.qq.com/s/pack-create';
const { sourceFile, content: originalContent } = createSource(root, sourceUrl);
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

const result = runCli([
  'pack',
  'create',
  '--source',
  sourceFile,
  '--manifest',
  manifestFile,
  '--json',
], root, home);

assert.strictEqual(result.status, 0, result.stderr || result.stdout);
assert.strictEqual(result.stderr, '');
const output = JSON.parse(result.stdout);
const packId = crypto.createHash('sha256')
  .update(`${sourceUrl}\n__general__`)
  .digest('hex');
const vaultRoot = path.join(root, 'vault');
const packFile = path.join(
  vaultRoot,
  'Inbox',
  `源文章-${packId.slice(0, 12)}-r1.md`
);
const stateFile = path.join(
  vaultRoot,
  '.alskai-notebank',
  'packs',
  packId,
  'state.json'
);
const revisionOneStateFile = path.join(
  path.dirname(stateFile),
  'revisions',
  '1.json'
);
assert.deepStrictEqual(output, {
  ok: true,
  command: 'pack.create',
  status: 'created',
  result: {
    action: 'create',
    packId,
    revision: 1,
    status: 'pending',
    sourceFile,
    sourceUrl,
    processingGoal: null,
    packFile,
    stateFile,
  },
});

assert.ok(fs.existsSync(packFile));
assert.ok(fs.existsSync(stateFile));
assert.ok(fs.existsSync(revisionOneStateFile));
const state = JSON.parse(fs.readFileSync(stateFile, 'utf8'));
assert.strictEqual(state.packId, packId);
assert.strictEqual(state.revision, 1);
assert.strictEqual(state.status, 'pending');
assert.deepStrictEqual(state.manifest.atomicNotes, []);
assert.deepStrictEqual(state.manifest.materials, []);
assert.deepStrictEqual(state.manifest.reviewQuestions, []);

const sourceAfter = fs.readFileSync(sourceFile, 'utf8');
assert.ok(sourceAfter.startsWith(originalContent));
assert.match(sourceAfter, /<!-- alskai-notebank:derived:start -->/);
assert.match(
  sourceAfter,
  new RegExp(`\\[\\[Inbox/源文章-${packId.slice(0, 12)}-r1\\|待审核加工包 r1\\]\\]`)
);
assert.match(sourceAfter, /<!-- alskai-notebank:derived:end -->/);
const packContent = fs.readFileSync(packFile, 'utf8');
assert.match(packContent, /status: pending/);
assert.match(packContent, /\[\[L1_原文\/WeChat\/源文章\|源文章\]\]/);

const initialSnapshot = {
  source: fs.readFileSync(sourceFile, 'utf8'),
  pack: fs.readFileSync(packFile, 'utf8'),
  state: fs.readFileSync(stateFile, 'utf8'),
  sourceMtime: fs.statSync(sourceFile).mtimeMs,
  packMtime: fs.statSync(packFile).mtimeMs,
  stateMtime: fs.statSync(stateFile).mtimeMs,
};
const repeatedResult = runCli([
  'pack', 'create',
  '--source', sourceFile,
  '--manifest', manifestFile,
  '--json',
], root, home);
assert.strictEqual(repeatedResult.status, 0, repeatedResult.stderr || repeatedResult.stdout);
const repeatedOutput = JSON.parse(repeatedResult.stdout);
assert.strictEqual(repeatedOutput.status, 'unchanged');
assert.strictEqual(repeatedOutput.result.action, 'reuse');
assert.strictEqual(repeatedOutput.result.packId, packId);
assert.strictEqual(repeatedOutput.result.revision, 1);
assert.strictEqual(fs.readFileSync(sourceFile, 'utf8'), initialSnapshot.source);
assert.strictEqual(fs.readFileSync(packFile, 'utf8'), initialSnapshot.pack);
assert.strictEqual(fs.readFileSync(stateFile, 'utf8'), initialSnapshot.state);
assert.strictEqual(fs.statSync(sourceFile).mtimeMs, initialSnapshot.sourceMtime);
assert.strictEqual(fs.statSync(packFile).mtimeMs, initialSnapshot.packMtime);
assert.strictEqual(fs.statSync(stateFile).mtimeMs, initialSnapshot.stateMtime);
assert.strictEqual(
  (initialSnapshot.source.match(/alskai-notebank:derived:start/g) || []).length,
  1
);

const secondGoalManifest = path.join(root, 'manifest-second-goal.json');
fs.writeFileSync(secondGoalManifest, JSON.stringify({
  schemaVersion: 1,
  sourceFile,
  sourceUrl,
  processingGoal: '  另一个研究目标  ',
  atomicNotes: [],
  materials: [],
  reviewQuestions: [],
}, null, 2));
const secondGoalResult = runCli([
  'pack', 'create',
  '--source', sourceFile,
  '--manifest', secondGoalManifest,
  '--json',
], root, home);
assert.strictEqual(secondGoalResult.status, 0, secondGoalResult.stderr || secondGoalResult.stdout);
const secondGoalOutput = JSON.parse(secondGoalResult.stdout);
assert.strictEqual(secondGoalOutput.status, 'created');
assert.strictEqual(secondGoalOutput.result.revision, 1);
assert.notStrictEqual(secondGoalOutput.result.packId, packId);
assert.strictEqual(secondGoalOutput.result.processingGoal, '另一个研究目标');
assert.ok(fs.existsSync(secondGoalOutput.result.packFile));
assert.ok(fs.existsSync(secondGoalOutput.result.stateFile));
const sourceWithTwoGoals = fs.readFileSync(sourceFile, 'utf8');
assert.strictEqual(
  (sourceWithTwoGoals.match(/alskai-notebank:derived:start/g) || []).length,
  1
);
assert.strictEqual(
  (sourceWithTwoGoals.match(/alskai-notebank:derived:end/g) || []).length,
  1
);
assert.match(sourceWithTwoGoals, new RegExp(packId.slice(0, 12)));
assert.match(
  sourceWithTwoGoals,
  new RegExp(secondGoalOutput.result.packId.slice(0, 12))
);
assert.strictEqual(
  fs.readdirSync(path.join(vaultRoot, 'Inbox')).filter((name) => name.endsWith('.md')).length,
  2
);

fs.writeFileSync(manifestFile, JSON.stringify({
  schemaVersion: 1,
  sourceFile,
  sourceUrl,
  processingGoal: null,
  atomicNotes: [{
    id: 'L2-01',
    title: '新修订观点',
    claim: '候选内容变化必须形成新修订。',
    evidence: '保留旧修订，不覆盖历史。',
    boundary: '同一来源与同一目标。',
    useCases: ['审计加工历史'],
  }],
  materials: [],
  reviewQuestions: [],
}, null, 2));
const revisionResult = runCli([
  'pack', 'create',
  '--source', sourceFile,
  '--manifest', manifestFile,
  '--json',
], root, home);
assert.strictEqual(revisionResult.status, 0, revisionResult.stderr || revisionResult.stdout);
const revisionOutput = JSON.parse(revisionResult.stdout);
assert.strictEqual(revisionOutput.status, 'revised');
assert.strictEqual(revisionOutput.result.action, 'revise');
assert.strictEqual(revisionOutput.result.packId, packId);
assert.strictEqual(revisionOutput.result.revision, 2);
assert.match(revisionOutput.result.packFile, /-r2\.md$/);
assert.ok(fs.existsSync(packFile), 'revision 1 visible pack should remain');
assert.ok(fs.existsSync(revisionOutput.result.packFile));
assert.match(fs.readFileSync(packFile, 'utf8'), /status: superseded/);
assert.match(fs.readFileSync(revisionOutput.result.packFile, 'utf8'), /status: pending/);
const revisionOneState = JSON.parse(fs.readFileSync(revisionOneStateFile, 'utf8'));
assert.strictEqual(revisionOneState.status, 'superseded');
const revisionTwoStateFile = path.join(path.dirname(stateFile), 'revisions', '2.json');
assert.ok(fs.existsSync(revisionTwoStateFile));
assert.strictEqual(
  JSON.parse(fs.readFileSync(revisionTwoStateFile, 'utf8')).status,
  'pending'
);
const currentState = JSON.parse(fs.readFileSync(stateFile, 'utf8'));
assert.strictEqual(currentState.revision, 2);
assert.strictEqual(currentState.status, 'pending');
assert.strictEqual(currentState.packFile, revisionOutput.result.packFile);
const sourceWithRevision = fs.readFileSync(sourceFile, 'utf8');
assert.strictEqual(
  (sourceWithRevision.match(/alskai-notebank:derived:start/g) || []).length,
  1
);
assert.match(sourceWithRevision, /-r1\|待审核加工包 r1/);
assert.match(sourceWithRevision, /-r2\|待审核加工包 r2/);

const candidateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'wechat-notebank-candidates-'));
const candidateHome = path.join(candidateRoot, 'home');
fs.mkdirSync(candidateHome, { recursive: true });
const candidateSourceUrl = 'https://mp.weixin.qq.com/s/pack-candidates';
const candidateSource = createSource(candidateRoot, candidateSourceUrl);
fs.appendFileSync(candidateSource.sourceFile, '这句话必须在原文中精确存在。\n');
const candidateManifest = path.join(candidateRoot, 'manifest.json');
fs.writeFileSync(candidateManifest, JSON.stringify({
  schemaVersion: 1,
  sourceFile: candidateSource.sourceFile,
  sourceUrl: candidateSourceUrl,
  processingGoal: '  为团队沉淀可复用的研究方法  ',
  atomicNotes: [{
    id: 'L2-01',
    title: '保留原始证据',
    claim: '知识加工必须能回到原始证据。',
    evidence: '原文保留并建立双链。',
    boundary: '只适用于可访问且已归档的来源。',
    useCases: ['研究复盘', '内容写作'],
  }],
  materials: [{
    id: 'L3-01',
    kind: 'quote',
    title: '原文金句',
    content: '这句话必须在原文中精确存在。',
    sourceSection: '源文章',
  }],
  reviewQuestions: [{
    id: 'L4-Q01',
    question: '这篇文章会改变你的哪一个行动？',
  }],
}, null, 2));

const candidateResult = runCli([
  'pack', 'create',
  '--source', candidateSource.sourceFile,
  '--manifest', candidateManifest,
  '--json',
], candidateRoot, candidateHome);
assert.strictEqual(
  candidateResult.status,
  0,
  candidateResult.stderr || candidateResult.stdout
);
const candidateOutput = JSON.parse(candidateResult.stdout);
assert.strictEqual(
  candidateOutput.result.processingGoal,
  '为团队沉淀可复用的研究方法'
);
const candidateState = JSON.parse(fs.readFileSync(
  candidateOutput.result.stateFile,
  'utf8'
));
assert.strictEqual(
  candidateState.manifest.processingGoal,
  '为团队沉淀可复用的研究方法'
);
assert.strictEqual(candidateState.manifest.atomicNotes[0].id, 'L2-01');
assert.strictEqual(candidateState.manifest.materials[0].kind, 'quote');
assert.strictEqual(candidateState.manifest.reviewQuestions[0].id, 'L4-Q01');
const candidatePack = fs.readFileSync(candidateOutput.result.packFile, 'utf8');
for (const expectedText of [
  'L2-01',
  '保留原始证据',
  '知识加工必须能回到原始证据。',
  '只适用于可访问且已归档的来源。',
  '研究复盘',
  'L3-01',
  '原文金句',
  '这句话必须在原文中精确存在。',
  'L4-Q01',
  '这篇文章会改变你的哪一个行动？',
]) {
  assert.match(candidatePack, new RegExp(expectedText));
}

console.log('pack create json tests passed');
