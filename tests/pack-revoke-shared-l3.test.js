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

function writeManifest(file, sourceFile, sourceUrl, processingGoal, materials) {
  fs.writeFileSync(file, JSON.stringify({
    schemaVersion: 1,
    sourceFile,
    sourceUrl,
    processingGoal,
    atomicNotes: [],
    materials,
    reviewQuestions: [],
  }, null, 2));
}

function createPack(manifestFile, sourceFile, root, home) {
  const result = runCli([
    'pack', 'create', '--source', sourceFile, '--manifest', manifestFile, '--json',
  ], root, home);
  assert.strictEqual(result.status, 0, result.stderr || result.stdout);
  return JSON.parse(result.stdout).result;
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

function material(id, title, content) {
  return {
    id,
    kind: 'paraphrase',
    title,
    content,
    sourceSection: '正文',
  };
}

function readState(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function assertActiveAndRevokedAreDisjoint(state) {
  const revoked = new Set(state.revokedItems);
  assert.strictEqual(
    state.approvedItems.some((item) => revoked.has(item)),
    false,
    'approvedItems 必须只表示当前 active，不能与 revokedItems 重叠'
  );
}

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'wechat-notebank-revoke-l3-'));
const home = path.join(root, 'home');
const vault = path.join(root, 'vault');
const sourceFile = path.join(vault, 'L1_原文', 'WeChat', '共享素材撤销原文.md');
const sourceUrl = 'https://mp.weixin.qq.com/s/revoke-shared-materials';
const manifestA = path.join(root, 'manifest-a.json');
const manifestB = path.join(root, 'manifest-b.json');
fs.mkdirSync(path.dirname(sourceFile), { recursive: true });
fs.mkdirSync(home, { recursive: true });
fs.writeFileSync(sourceFile, [
  '---',
  'title: 共享素材撤销原文',
  `sourceUrl: ${sourceUrl}`,
  '---',
  '',
  '同一来源的多个加工目标应该共享一个素材文件。',
  '',
].join('\n'));

writeManifest(manifestA, sourceFile, sourceUrl, '研究', [
  material('L3-01', '研究视角待撤销素材', '这条研究素材会先被撤销。'),
  material('L3-02', '研究视角暂时保留素材', '这条研究素材要在同一包内继续保留。'),
]);
const packA = createPack(manifestA, sourceFile, root, home);
approvePack(packA.packFile, ['L3-01', 'L3-02'], root, home);

const sourceHash = crypto.createHash('sha256').update(sourceUrl).digest('hex');
const l3File = path.join(
  vault,
  'L3_引用素材',
  `共享素材撤销原文-${sourceHash.slice(0, 12)}.md`
);
const materialsStateFile = path.join(
  vault,
  '.alskai-notebank',
  'materials',
  `${sourceHash}.json`
);
const oldPackAHash = readState(packA.stateFile).outputs
  .find((output) => output.kind === 'L3').sha256;

writeManifest(manifestB, sourceFile, sourceUrl, '内容创作', [
  material('L3-01', '创作视角保留素材', '另一个加工目标的贡献不能被连带删除。'),
]);
const packB = createPack(manifestB, sourceFile, root, home);
approvePack(packB.packFile, ['L3-01'], root, home);

let sharedContent = fs.readFileSync(l3File, 'utf8');
assert.match(sharedContent, /研究视角待撤销素材/);
assert.match(sharedContent, /研究视角暂时保留素材/);
assert.match(sharedContent, /创作视角保留素材/);
assert.strictEqual(readState(materialsStateFile).publications.length, 2);
assert.notStrictEqual(
  oldPackAHash,
  crypto.createHash('sha256').update(sharedContent).digest('hex'),
  '第二个 processingGoal 加入后，第一个 pack 的历史 output 哈希应自然过期'
);

const partialRevoke = revokePack(packA.packFile, ['L3-01'], root, home);
assert.strictEqual(
  partialRevoke.status,
  0,
  '共享文件应按当前共享状态校验，不能用 pack A 的旧 output 哈希误报人工修改：' +
    (partialRevoke.stderr || partialRevoke.stdout)
);
const partialResult = JSON.parse(partialRevoke.stdout).result;
assert.strictEqual(partialResult.action, 'revoke');
assert.deepStrictEqual(partialResult.approvedItems, ['L3-02']);
assert.deepStrictEqual(partialResult.revokedItems, ['L3-01']);
sharedContent = fs.readFileSync(l3File, 'utf8');
assert.doesNotMatch(sharedContent, /研究视角待撤销素材/);
assert.match(sharedContent, /研究视角暂时保留素材/);
assert.match(sharedContent, /创作视角保留素材/);
assert.strictEqual(fs.existsSync(materialsStateFile), true);
let packAState = readState(packA.stateFile);
assert.deepStrictEqual(packAState.approvedItems, ['L3-02']);
assert.deepStrictEqual(packAState.revokedItems, ['L3-01']);
assert.deepStrictEqual(
  packAState.outputs.find((output) => output.kind === 'L3').itemIds,
  ['L3-02']
);
assertActiveAndRevokedAreDisjoint(packAState);
let sharedState = readState(materialsStateFile);
assert.strictEqual(sharedState.publications.length, 2);
assert.deepStrictEqual(
  sharedState.publications.find((entry) => entry.packId === packA.packId).itemIds,
  ['L3-02']
);

const removeRestOfPackA = revokePack(packA.packFile, ['L3-02'], root, home);
assert.strictEqual(
  removeRestOfPackA.status,
  0,
  removeRestOfPackA.stderr || removeRestOfPackA.stdout
);
sharedContent = fs.readFileSync(l3File, 'utf8');
assert.doesNotMatch(sharedContent, /研究视角待撤销素材/);
assert.doesNotMatch(sharedContent, /研究视角暂时保留素材/);
assert.match(sharedContent, /创作视角保留素材/);
packAState = readState(packA.stateFile);
assert.deepStrictEqual(packAState.approvedItems, []);
assert.deepStrictEqual(packAState.revokedItems, ['L3-01', 'L3-02']);
assert.strictEqual(packAState.outputs.some((output) => output.kind === 'L3'), false);
assertActiveAndRevokedAreDisjoint(packAState);
sharedState = readState(materialsStateFile);
assert.strictEqual(sharedState.publications.length, 1);
assert.strictEqual(sharedState.publications[0].packId, packB.packId);
assert.strictEqual(
  (fs.readFileSync(sourceFile, 'utf8').match(/L3 引用素材包/g) || []).length,
  1,
  '还有共享贡献时必须保留 source 链'
);

const pristineBOnlyContent = fs.readFileSync(l3File, 'utf8');
fs.appendFileSync(l3File, '\n用户人工修改，撤销不得覆盖。\n');
const beforeModifiedAttempt = snapshot(vault);
const modifiedAttempt = revokePack(packB.packFile, ['L3-01'], root, home);
assert.strictEqual(modifiedAttempt.status, 1);
assert.strictEqual(
  JSON.parse(modifiedAttempt.stdout).error.code,
  'DERIVED_FILE_MODIFIED'
);
assert.deepStrictEqual(snapshot(vault), beforeModifiedAttempt);

fs.writeFileSync(l3File, pristineBOnlyContent);
const lastRevoke = revokePack(packB.packFile, ['L3-01'], root, home);
assert.strictEqual(lastRevoke.status, 0, lastRevoke.stderr || lastRevoke.stdout);
assert.strictEqual(fs.existsSync(l3File), false);
assert.strictEqual(fs.existsSync(materialsStateFile), false);
assert.doesNotMatch(fs.readFileSync(sourceFile, 'utf8'), /L3 引用素材包/);
assert.doesNotMatch(fs.readFileSync(packB.packFile, 'utf8'), /L3 引用素材包/);
const packBState = readState(packB.stateFile);
assert.deepStrictEqual(packBState.approvedItems, []);
assert.deepStrictEqual(packBState.revokedItems, ['L3-01']);
assert.strictEqual(packBState.outputs.some((output) => output.kind === 'L3'), false);
assertActiveAndRevokedAreDisjoint(packBState);

console.log('pack revoke shared L3 tests passed');
