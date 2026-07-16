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

function snapshot(root) {
  const entries = [];
  function visit(current, relative) {
    for (const name of fs.readdirSync(current).sort()) {
      const absolute = path.join(current, name);
      const childRelative = path.join(relative, name);
      const stat = fs.lstatSync(absolute);
      if (stat.isSymbolicLink()) {
        entries.push(`l:${childRelative}:${fs.readlinkSync(absolute)}`);
      } else if (stat.isDirectory()) {
        entries.push(`d:${childRelative}:${stat.mode & 0o777}`);
        visit(absolute, childRelative);
      } else {
        entries.push(
          `f:${childRelative}:${stat.mode & 0o777}:${fs.readFileSync(absolute, 'hex')}`
        );
      }
    }
  }
  visit(root, '');
  return entries;
}

function reviewManifest(sourceFile, sourceUrl, processingGoal, questions, answers, draft) {
  return {
    schemaVersion: 1,
    sourceFile,
    sourceUrl,
    processingGoal,
    atomicNotes: [],
    materials: [],
    reviewQuestions: questions,
    ...(answers ? { reviewAnswers: answers } : {}),
    ...(draft ? { reviewDraft: draft } : {}),
  };
}

function createCompletedPack(input) {
  fs.writeFileSync(input.manifestFile, JSON.stringify(
    reviewManifest(
      input.sourceFile,
      input.sourceUrl,
      input.processingGoal,
      input.questions
    ),
    null,
    2
  ));
  const created = runCli([
    'pack', 'create', '--source', input.sourceFile,
    '--manifest', input.manifestFile, '--json',
  ], input.root, input.home);
  assert.strictEqual(created.status, 0, created.stderr || created.stdout);
  const pack = JSON.parse(created.stdout).result;

  fs.writeFileSync(input.manifestFile, JSON.stringify(
    reviewManifest(
      input.sourceFile,
      input.sourceUrl,
      input.processingGoal,
      input.questions,
      input.answers,
      input.draft
    ),
    null,
    2
  ));
  const updated = runCli([
    'pack', 'update', pack.packFile, '--manifest', input.manifestFile, '--json',
  ], input.root, input.home);
  assert.strictEqual(updated.status, 0, updated.stderr || updated.stdout);
  return pack;
}

function approvePack(packFile, items, root, home) {
  const result = runCli([
    'pack', 'approve', packFile, '--items', items.join(','), '--json',
  ], root, home);
  assert.strictEqual(result.status, 0, result.stderr || result.stdout);
  return JSON.parse(result.stdout).result;
}

function revokePack(packFile, items, root, home) {
  return runCli([
    'pack', 'revoke', packFile, '--items', items.join(','), '--json',
  ], root, home);
}

function readState(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function publishedRegion(content) {
  return content.split('<!-- alskai-notebank:published:start -->')[1]
    .split('<!-- alskai-notebank:published:end -->')[0];
}

function assertActiveAndRevokedAreDisjoint(state) {
  const revoked = new Set(state.revokedItems);
  assert.strictEqual(
    state.approvedItems.some((item) => revoked.has(item)),
    false,
    'approvedItems 必须只表示当前 active，不能与 revokedItems 重叠'
  );
}

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'wechat-notebank-revoke-l4-'));
const home = path.join(root, 'home');
const vault = path.join(root, 'vault');
const sourceFile = path.join(vault, 'L1_原文', 'WeChat', '共享复盘撤销原文.md');
const sourceUrl = 'https://mp.weixin.qq.com/s/revoke-shared-reflections';
const manifestA = path.join(root, 'manifest-a.json');
const manifestB = path.join(root, 'manifest-b.json');
const questionIds = ['L4-Q01', 'L4-Q02'];
fs.mkdirSync(path.dirname(sourceFile), { recursive: true });
fs.mkdirSync(home, { recursive: true });
fs.writeFileSync(sourceFile, [
  '---',
  'title: 共享复盘撤销原文',
  `sourceUrl: ${sourceUrl}`,
  '---',
  '',
  '同一来源的多个加工目标应该共享一个复盘文件。',
  '',
].join('\n'));

const questionsA = [
  { id: 'L4-Q01', question: '研究目标下，最重要的证据是什么？' },
  { id: 'L4-Q02', question: '研究目标下，如何验证这条结论？' },
];
const packA = createCompletedPack({
  root,
  home,
  manifestFile: manifestA,
  sourceFile,
  sourceUrl,
  processingGoal: '研究',
  questions: questionsA,
  answers: {
    'L4-Q01': '研究回答一：证据必须能回到原文。',
    'L4-Q02': '研究回答二：验证时要保留原始输入。',
  },
  draft: '研究整理稿：可追溯性与真实输入共同构成验证基础。',
});
approvePack(packA.packFile, questionIds, root, home);

const sourceHash = crypto.createHash('sha256').update(sourceUrl).digest('hex');
const l4File = path.join(
  vault,
  'L4_阅读复盘',
  `共享复盘撤销原文-${sourceHash.slice(0, 12)}.md`
);
const reflectionStateFile = path.join(
  vault,
  '.alskai-notebank',
  'reflections',
  `${sourceHash}.json`
);
const oldPackAHash = readState(packA.stateFile).outputs
  .find((output) => output.kind === 'L4').sha256;

const questionsB = [
  { id: 'L4-Q01', question: '创作目标下，应该保留什么？' },
  { id: 'L4-Q02', question: '创作目标下，应该如何表达？' },
];
const packB = createCompletedPack({
  root,
  home,
  manifestFile: manifestB,
  sourceFile,
  sourceUrl,
  processingGoal: '内容创作',
  questions: questionsB,
  answers: {
    'L4-Q01': '创作回答一：保留事实、回答和整理稿的边界。',
    'L4-Q02': '创作回答二：把证据放在观点之前。',
  },
  draft: '创作整理稿：表达可以变化，但证据链不能消失。',
});
approvePack(packB.packFile, questionIds, root, home);

let sharedContent = fs.readFileSync(l4File, 'utf8');
assert.match(sharedContent, /研究整理稿/);
assert.match(sharedContent, /创作整理稿/);
assert.strictEqual(readState(reflectionStateFile).publications.length, 2);
assert.notStrictEqual(
  oldPackAHash,
  crypto.createHash('sha256').update(sharedContent).digest('hex'),
  '第二个 processingGoal 加入后，第一个 pack 的历史 output 哈希应自然过期'
);

const beforePartialAttempt = snapshot(vault);
const partialAttempt = revokePack(packA.packFile, ['L4-Q01'], root, home);
assert.strictEqual(partialAttempt.status, 1);
assert.strictEqual(JSON.parse(partialAttempt.stdout).error.code, 'MANIFEST_INVALID');
assert.deepStrictEqual(
  snapshot(vault),
  beforePartialAttempt,
  'L4 少撤一个问题时必须整笔拒绝且零改动'
);

const revokePackA = revokePack(packA.packFile, questionIds, root, home);
assert.strictEqual(
  revokePackA.status,
  0,
  '共享文件应按当前共享状态校验，不能用 pack A 的旧 output 哈希误报人工修改：' +
    (revokePackA.stderr || revokePackA.stdout)
);
sharedContent = fs.readFileSync(l4File, 'utf8');
assert.doesNotMatch(sharedContent, /研究回答一/);
assert.doesNotMatch(sharedContent, /研究整理稿/);
assert.match(sharedContent, /创作回答一/);
assert.match(sharedContent, /创作整理稿/);
assert.strictEqual(fs.existsSync(reflectionStateFile), true);
const packAState = readState(packA.stateFile);
assert.deepStrictEqual(packAState.approvedItems, []);
assert.deepStrictEqual(packAState.revokedItems, questionIds);
assert.strictEqual(packAState.outputs.some((output) => output.kind === 'L4'), false);
assertActiveAndRevokedAreDisjoint(packAState);
const sharedState = readState(reflectionStateFile);
assert.strictEqual(sharedState.publications.length, 1);
assert.strictEqual(sharedState.publications[0].packId, packB.packId);
assert.strictEqual(
  (fs.readFileSync(sourceFile, 'utf8').match(/- L4 阅读复盘：/g) || []).length,
  1,
  '还有共享贡献时必须保留 source 链'
);

const pristineBOnlyContent = fs.readFileSync(l4File, 'utf8');
fs.appendFileSync(l4File, '\n用户人工修改，撤销不得覆盖。\n');
const beforeModifiedAttempt = snapshot(vault);
const modifiedAttempt = revokePack(packB.packFile, questionIds, root, home);
assert.strictEqual(modifiedAttempt.status, 1);
assert.strictEqual(
  JSON.parse(modifiedAttempt.stdout).error.code,
  'DERIVED_FILE_MODIFIED'
);
assert.deepStrictEqual(snapshot(vault), beforeModifiedAttempt);

fs.writeFileSync(l4File, pristineBOnlyContent);
const lastRevoke = revokePack(packB.packFile, questionIds, root, home);
assert.strictEqual(lastRevoke.status, 0, lastRevoke.stderr || lastRevoke.stdout);
assert.strictEqual(fs.existsSync(l4File), false);
assert.strictEqual(fs.existsSync(reflectionStateFile), false);
assert.doesNotMatch(fs.readFileSync(sourceFile, 'utf8'), /- L4 阅读复盘：/);
assert.doesNotMatch(
  publishedRegion(fs.readFileSync(packB.packFile, 'utf8')),
  /L4 阅读复盘/
);
const packBState = readState(packB.stateFile);
assert.deepStrictEqual(packBState.approvedItems, []);
assert.deepStrictEqual(packBState.revokedItems, questionIds);
assert.strictEqual(packBState.outputs.some((output) => output.kind === 'L4'), false);
assertActiveAndRevokedAreDisjoint(packBState);

console.log('pack revoke shared L4 tests passed');
