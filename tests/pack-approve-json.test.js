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

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'wechat-notebank-approve-'));
const home = path.join(root, 'home');
const vault = path.join(root, 'vault');
const sourceFile = path.join(vault, 'L1_原文', 'WeChat', '审批原文.md');
const manifestFile = path.join(root, 'manifest.json');
const sourceUrl = 'https://mp.weixin.qq.com/s/pack-approve';
fs.mkdirSync(path.dirname(sourceFile), { recursive: true });
fs.mkdirSync(home, { recursive: true });
fs.writeFileSync(sourceFile, [
  '---',
  'title: 审批原文',
  `sourceUrl: ${sourceUrl}`,
  '---',
  '',
  '# 审批原文',
  '',
  '原文中的可核对引用。',
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
      title: '被批准的观点',
      claim: '知识资产需要先审核再发布。',
      evidence: '原文中的可核对引用。',
      boundary: '适用于需要人工把关的内容。',
      useCases: ['研究笔记', '内容创作'],
    },
    {
      id: 'L2-02',
      title: '未批准的观点',
      claim: '这条不应落盘。',
      evidence: '原文中的可核对引用。',
      boundary: '仅用于测试。',
      useCases: [],
    },
  ],
  materials: [
    {
      id: 'L3-01',
      kind: 'quote',
      title: '未批准引用',
      content: '原文中的可核对引用。',
      sourceSection: '正文',
    },
    {
      id: 'L3-02',
      kind: 'paraphrase',
      title: '被批准转述',
      content: '发布前需要经过用户审核。',
      sourceSection: '正文',
    },
  ],
  reviewQuestions: [],
}, null, 2));

const createResult = runCli([
  'pack', 'create',
  '--source', sourceFile,
  '--manifest', manifestFile,
  '--json',
], root, home);
assert.strictEqual(createResult.status, 0, createResult.stderr || createResult.stdout);
const createOutput = JSON.parse(createResult.stdout);
const { packFile, stateFile, packId } = createOutput.result;

const approveResult = runCli([
  'pack', 'approve', packFile,
  '--items', 'L2-01,L3-02',
  '--json',
], root, home);
assert.strictEqual(approveResult.status, 0, approveResult.stderr || approveResult.stdout);
assert.strictEqual(approveResult.stderr, '');
const approveOutput = JSON.parse(approveResult.stdout);
assert.strictEqual(approveOutput.ok, true);
assert.strictEqual(approveOutput.command, 'pack.approve');
assert.strictEqual(approveOutput.status, 'partial');
assert.strictEqual(approveOutput.result.action, 'publish');
assert.strictEqual(approveOutput.result.packId, packId);
assert.strictEqual(approveOutput.result.revision, 1);
assert.strictEqual(approveOutput.result.status, 'partial');
assert.deepStrictEqual(approveOutput.result.approvedItems, ['L2-01', 'L3-02']);

const packPrefix = packId.slice(0, 12);
const sourcePrefix = crypto.createHash('sha256').update(sourceUrl).digest('hex').slice(0, 12);
const l2File = path.join(
  vault,
  'L2_原子卡片',
  `审批原文-${packPrefix}-r1-L2-01.md`
);
const skippedL2File = path.join(
  vault,
  'L2_原子卡片',
  `审批原文-${packPrefix}-r1-L2-02.md`
);
const l3File = path.join(
  vault,
  'L3_引用素材',
  `审批原文-${sourcePrefix}.md`
);
assert.deepStrictEqual(approveOutput.result.publishedFiles, [l2File, l3File]);
assert.strictEqual(fs.existsSync(l2File), true);
assert.strictEqual(fs.existsSync(skippedL2File), false);
assert.strictEqual(fs.existsSync(l3File), true);

const l2Content = fs.readFileSync(l2File, 'utf8');
assert.match(l2Content, /itemId: L2-01/);
assert.match(l2Content, /知识资产需要先审核再发布/);
assert.match(l2Content, /\[\[L1_原文\/WeChat\/审批原文\|审批原文\]\]/);
assert.match(l2Content, new RegExp(`\\[\\[Inbox/审批原文-${packPrefix}-r1\\|待审核加工包 r1\\]\\]`));

const l3Content = fs.readFileSync(l3File, 'utf8');
assert.match(l3Content, /itemIds:\n\s+- L3-02/);
assert.match(l3Content, /L3-02 · 被批准转述/);
assert.doesNotMatch(l3Content, /L3-01 · 未批准引用/);
assert.match(l3Content, /\[\[L1_原文\/WeChat\/审批原文\|审批原文\]\]/);

const state = JSON.parse(fs.readFileSync(stateFile, 'utf8'));
assert.strictEqual(state.status, 'partial');
assert.deepStrictEqual(state.approvedItems, ['L2-01', 'L3-02']);
assert.strictEqual(state.outputs.length, 2);
for (const output of state.outputs) {
  assert.match(output.sha256, /^[a-f0-9]{64}$/);
  assert.strictEqual(
    output.sha256,
    crypto.createHash('sha256').update(fs.readFileSync(output.file, 'utf8')).digest('hex')
  );
}
assert.deepStrictEqual(
  JSON.parse(fs.readFileSync(path.join(path.dirname(stateFile), 'revisions', '1.json'), 'utf8')),
  state
);

const sourceContent = fs.readFileSync(sourceFile, 'utf8');
assert.match(sourceContent, new RegExp(`\\[\\[L2_原子卡片/审批原文-${packPrefix}-r1-L2-01\\|L2-01 · 被批准的观点\\]\\]`));
assert.doesNotMatch(sourceContent, /L2-02 · 未批准的观点/);
assert.match(sourceContent, new RegExp(`\\[\\[L3_引用素材/审批原文-${sourcePrefix}\\|L3 引用素材包\\]\\]`));

const visiblePack = fs.readFileSync(packFile, 'utf8');
assert.match(visiblePack, /status: partial/);
assert.match(visiblePack, /approvedItems:\n\s+- L2-01\n\s+- L3-02/);
assert.match(visiblePack, /## 已发布内容/);
assert.match(visiblePack, /L2-01 · 被批准的观点/);
assert.match(visiblePack, /L3 引用素材包/);

const originalL3Content = fs.readFileSync(l3File, 'utf8');
fs.appendFileSync(l3File, '\n用户手工补充，不能被自动覆盖。\n');
const beforeModifiedApproval = new Map(
  [sourceFile, packFile, stateFile, l2File, l3File].map(
    (file) => [file, fs.readFileSync(file, 'utf8')]
  )
);
const modifiedResult = runCli([
  'pack', 'approve', packFile,
  '--items', 'L2-02,L3-01',
  '--json',
], root, home);
assert.strictEqual(modifiedResult.status, 1);
const modifiedOutput = JSON.parse(modifiedResult.stdout);
assert.strictEqual(modifiedOutput.error.code, 'DERIVED_FILE_MODIFIED');
for (const [file, expected] of beforeModifiedApproval) {
  assert.strictEqual(fs.readFileSync(file, 'utf8'), expected);
}
assert.strictEqual(fs.existsSync(skippedL2File), false);
fs.writeFileSync(l3File, originalL3Content);

const sourceBeforeQuoteDrift = fs.readFileSync(sourceFile, 'utf8');
fs.writeFileSync(
  sourceFile,
  sourceBeforeQuoteDrift.replace('原文中的可核对引用。', '原文引用已被用户修改。')
);
const beforeQuoteDriftApproval = new Map(
  [sourceFile, packFile, stateFile, l2File, l3File].map(
    (file) => [file, fs.readFileSync(file, 'utf8')]
  )
);
const quoteDriftResult = runCli([
  'pack', 'approve', packFile,
  '--items', 'L2-02,L3-01',
  '--json',
], root, home);
assert.strictEqual(quoteDriftResult.status, 1);
assert.strictEqual(JSON.parse(quoteDriftResult.stdout).error.code, 'QUOTE_NOT_FOUND');
for (const [file, expected] of beforeQuoteDriftApproval) {
  assert.strictEqual(fs.readFileSync(file, 'utf8'), expected);
}
assert.strictEqual(fs.existsSync(skippedL2File), false);
fs.writeFileSync(sourceFile, sourceBeforeQuoteDrift);

const completeResult = runCli([
  'pack', 'approve', packFile,
  '--items', 'L2-02,L3-01',
  '--json',
], root, home);
assert.strictEqual(completeResult.status, 0, completeResult.stderr || completeResult.stdout);
const completeOutput = JSON.parse(completeResult.stdout);
assert.strictEqual(completeOutput.status, 'approved');
assert.strictEqual(completeOutput.result.action, 'publish');
assert.strictEqual(completeOutput.result.status, 'approved');
assert.deepStrictEqual(
  completeOutput.result.approvedItems,
  ['L2-01', 'L2-02', 'L3-01', 'L3-02']
);
assert.strictEqual(fs.existsSync(skippedL2File), true);
const completeL3Content = fs.readFileSync(l3File, 'utf8');
assert.match(completeL3Content, /L3-01 · 未批准引用/);
assert.match(completeL3Content, /L3-02 · 被批准转述/);
const completeState = JSON.parse(fs.readFileSync(stateFile, 'utf8'));
assert.strictEqual(completeState.status, 'approved');
assert.deepStrictEqual(completeState.outputs.find((item) => item.kind === 'L3').itemIds, [
  'L3-01',
  'L3-02',
]);
assert.match(fs.readFileSync(packFile, 'utf8'), /status: approved/);
assert.strictEqual(
  (fs.readFileSync(sourceFile, 'utf8').match(/L3 引用素材包/g) || []).length,
  1
);

const idempotentFiles = [sourceFile, packFile, stateFile, l2File, skippedL2File, l3File];
const beforeRepeat = new Map(idempotentFiles.map((file) => [file, {
  content: fs.readFileSync(file, 'utf8'),
  mtimeMs: fs.statSync(file).mtimeMs,
}]));
const repeatResult = runCli([
  'pack', 'approve', packFile,
  '--items', 'L2-02,L3-01',
  '--json',
], root, home);
assert.strictEqual(repeatResult.status, 0, repeatResult.stderr || repeatResult.stdout);
const repeatOutput = JSON.parse(repeatResult.stdout);
assert.strictEqual(repeatOutput.status, 'unchanged');
assert.strictEqual(repeatOutput.result.action, 'reuse');
assert.strictEqual(repeatOutput.result.status, 'approved');
for (const file of idempotentFiles) {
  assert.strictEqual(fs.readFileSync(file, 'utf8'), beforeRepeat.get(file).content);
  assert.strictEqual(fs.statSync(file).mtimeMs, beforeRepeat.get(file).mtimeMs);
}

console.log('pack approve json tests passed');
