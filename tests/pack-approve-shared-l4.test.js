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

function writeManifest(file, sourceFile, sourceUrl, processingGoal, question, answer, draft) {
  const manifest = {
    schemaVersion: 1,
    sourceFile,
    sourceUrl,
    processingGoal,
    atomicNotes: [],
    materials: [],
    reviewQuestions: [{ id: 'L4-Q01', question }],
  };
  fs.writeFileSync(file, JSON.stringify(manifest, null, 2));
  return {
    initial: manifest,
    completed: {
      ...manifest,
      reviewAnswers: { 'L4-Q01': answer },
      reviewDraft: draft,
    },
  };
}

function createAndCompletePack(manifestFile, manifests, sourceFile, root, home) {
  fs.writeFileSync(manifestFile, JSON.stringify(manifests.initial, null, 2));
  const created = runCli([
    'pack', 'create', '--source', sourceFile, '--manifest', manifestFile, '--json',
  ], root, home);
  assert.strictEqual(created.status, 0, created.stderr || created.stdout);
  const pack = JSON.parse(created.stdout).result;
  fs.writeFileSync(manifestFile, JSON.stringify(manifests.completed, null, 2));
  const updated = runCli([
    'pack', 'update', pack.packFile, '--manifest', manifestFile, '--json',
  ], root, home);
  assert.strictEqual(updated.status, 0, updated.stderr || updated.stdout);
  return pack;
}

function approvePack(packFile, root, home) {
  return runCli([
    'pack', 'approve', packFile, '--items', 'L4-Q01', '--json',
  ], root, home);
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

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'wechat-notebank-shared-l4-'));
const home = path.join(root, 'home');
const vault = path.join(root, 'vault');
const sourceFile = path.join(vault, 'L1_原文', 'WeChat', '共享复盘原文.md');
const sourceUrl = 'https://mp.weixin.qq.com/s/shared-reflection';
const manifestA = path.join(root, 'manifest-a.json');
const manifestB = path.join(root, 'manifest-b.json');
fs.mkdirSync(path.dirname(sourceFile), { recursive: true });
fs.mkdirSync(home, { recursive: true });
fs.writeFileSync(sourceFile, [
  '---',
  'title: 共享复盘原文',
  `sourceUrl: ${sourceUrl}`,
  '---',
  '',
  '同一篇原文可以按不同目标进行复盘。',
  '',
].join('\n'));

const manifestsA = writeManifest(
  manifestA,
  sourceFile,
  sourceUrl,
  '研究',
  '研究视角下，你学到了什么？',
  '我学到了要分离原始回答与整理结论。',
  '研究时，我会保留原话作为可追溯的证据。'
);
const packA = createAndCompletePack(manifestA, manifestsA, sourceFile, root, home);
const approvedA = approvePack(packA.packFile, root, home);
assert.strictEqual(approvedA.status, 0, approvedA.stderr || approvedA.stdout);

const sourceHash = crypto.createHash('sha256').update(sourceUrl).digest('hex');
const l4File = path.join(
  vault,
  'L4_阅读复盘',
  `共享复盘原文-${sourceHash.slice(0, 12)}.md`
);
const reflectionStateFile = path.join(
  vault,
  '.alskai-notebank',
  'reflections',
  `${sourceHash}.json`
);
assert.strictEqual(fs.existsSync(l4File), true);
const hashAfterA = JSON.parse(fs.readFileSync(packA.stateFile, 'utf8'))
  .outputs.find((output) => output.kind === 'L4').sha256;

const manifestsB = writeManifest(
  manifestB,
  sourceFile,
  sourceUrl,
  '内容创作',
  '创作视角下，你会如何使用它？',
  '我会把已验证的原则变成内容结构。',
  '创作时，我会区分原文事实、用户回答和 Agent 整理。'
);
const packB = createAndCompletePack(manifestB, manifestsB, sourceFile, root, home);
const approvedB = approvePack(packB.packFile, root, home);
assert.strictEqual(approvedB.status, 0, approvedB.stderr || approvedB.stdout);
assert.strictEqual(JSON.parse(approvedB.stdout).result.publishedFiles[0], l4File);
assert.deepStrictEqual(fs.readdirSync(path.dirname(l4File)), [path.basename(l4File)]);

let sharedContent = fs.readFileSync(l4File, 'utf8');
assert.match(sharedContent, /研究视角下/);
assert.match(sharedContent, /创作视角下/);
assert.match(sharedContent, /可追溯的证据/);
assert.match(sharedContent, /变成内容结构/);
assert.match(sharedContent, new RegExp(packA.packId.slice(0, 12)));
assert.match(sharedContent, new RegExp(packB.packId.slice(0, 12)));
assert.strictEqual(
  (fs.readFileSync(sourceFile, 'utf8').match(/- L4 阅读复盘：/g) || []).length,
  1
);
for (const packFile of [packA.packFile, packB.packFile]) {
  assert.match(fs.readFileSync(packFile, 'utf8'), new RegExp(sourceHash.slice(0, 12)));
}

const currentHash = crypto.createHash('sha256').update(sharedContent).digest('hex');
const stateAAfterB = JSON.parse(fs.readFileSync(packA.stateFile, 'utf8'));
const stateBAfterB = JSON.parse(fs.readFileSync(packB.stateFile, 'utf8'));
assert.strictEqual(stateAAfterB.outputs.find((item) => item.kind === 'L4').sha256, hashAfterA);
assert.strictEqual(stateBAfterB.outputs.find((item) => item.kind === 'L4').sha256, currentHash);
const reflectionStateAfterB = JSON.parse(fs.readFileSync(reflectionStateFile, 'utf8'));
assert.strictEqual(reflectionStateAfterB.sha256, currentHash);
assert.strictEqual(reflectionStateAfterB.publications.length, 2);

const revisedManifestsA = writeManifest(
  manifestA,
  sourceFile,
  sourceUrl,
  '研究',
  '修订后，你认为最重要的原则是什么？',
  '最重要的原则是永久保留真实输入。',
  '修订后的研究复盘继续以用户原话为事实基础。'
);
const revisedA = createAndCompletePack(
  manifestA,
  revisedManifestsA,
  sourceFile,
  root,
  home
);
assert.strictEqual(revisedA.revision, 2);
const approvedRevision = approvePack(revisedA.packFile, root, home);
assert.strictEqual(
  approvedRevision.status,
  0,
  approvedRevision.stderr || approvedRevision.stdout
);
assert.strictEqual(JSON.parse(approvedRevision.stdout).result.publishedFiles[0], l4File);
sharedContent = fs.readFileSync(l4File, 'utf8');
assert.match(sharedContent, /永久保留真实输入/);
assert.strictEqual((sharedContent.match(/## 加工包/g) || []).length, 3);

const revisionOne = JSON.parse(fs.readFileSync(
  path.join(path.dirname(packA.stateFile), 'revisions', '1.json'),
  'utf8'
));
assert.strictEqual(revisionOne.status, 'superseded');
assert.strictEqual(revisionOne.outputs.find((item) => item.kind === 'L4').sha256, hashAfterA);
assert.strictEqual(
  JSON.parse(fs.readFileSync(reflectionStateFile, 'utf8')).publications.length,
  3
);

const manifestC = path.join(root, 'manifest-c.json');
const manifestsC = writeManifest(
  manifestC,
  sourceFile,
  sourceUrl,
  '教学',
  '你会如何把它教给别人？',
  '我会先展示原话与整理稿的区别。',
  '教学时先展示事实层，再说明表达层。'
);
const packC = createAndCompletePack(manifestC, manifestsC, sourceFile, root, home);
fs.appendFileSync(l4File, '\n用户人工补充，不能被覆盖。\n');
const beforeModifiedApproval = snapshot(vault);
const modifiedApproval = approvePack(packC.packFile, root, home);
assert.strictEqual(modifiedApproval.status, 1);
assert.strictEqual(JSON.parse(modifiedApproval.stdout).error.code, 'DERIVED_FILE_MODIFIED');
assert.deepStrictEqual(snapshot(vault), beforeModifiedApproval);

console.log('pack approve shared L4 tests passed');
