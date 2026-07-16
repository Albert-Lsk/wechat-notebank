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

function writeManifest(
  file,
  sourceFile,
  sourceUrl,
  processingGoal,
  title,
  content,
  kind = 'paraphrase'
) {
  fs.writeFileSync(file, JSON.stringify({
    schemaVersion: 1,
    sourceFile,
    sourceUrl,
    processingGoal,
    atomicNotes: [],
    materials: [{
      id: 'L3-01',
      kind,
      title,
      content,
      sourceSection: '正文',
    }],
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

function approvePack(packFile, root, home) {
  return runCli([
    'pack', 'approve', packFile, '--items', 'L3-01', '--json',
  ], root, home);
}

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'wechat-notebank-shared-l3-'));
const home = path.join(root, 'home');
const vault = path.join(root, 'vault');
const sourceFile = path.join(vault, 'L1_原文', 'WeChat', '共享素材原文.md');
const sourceUrl = 'https://mp.weixin.qq.com/s/shared-materials';
const manifestA = path.join(root, 'manifest-a.json');
const manifestB = path.join(root, 'manifest-b.json');
fs.mkdirSync(path.dirname(sourceFile), { recursive: true });
fs.mkdirSync(home, { recursive: true });
fs.writeFileSync(sourceFile, [
  '---',
  'title: 共享素材原文',
  `sourceUrl: ${sourceUrl}`,
  '---',
  '',
  '同一来源可以按不同目标加工。',
  '',
].join('\n'));

writeManifest(
  manifestA,
  sourceFile,
  sourceUrl,
  '研究',
  '研究视角素材',
  '同一来源可以按不同目标加工。',
  'quote'
);
const packA = createPack(manifestA, sourceFile, root, home);
const approvedA = approvePack(packA.packFile, root, home);
assert.strictEqual(approvedA.status, 0, approvedA.stderr || approvedA.stdout);
const resultA = JSON.parse(approvedA.stdout).result;
assert.strictEqual(resultA.publishedFiles.length, 1);
const sourcePrefix = crypto.createHash('sha256').update(sourceUrl).digest('hex').slice(0, 12);
const l3File = path.join(vault, 'L3_引用素材', `共享素材原文-${sourcePrefix}.md`);
assert.strictEqual(resultA.publishedFiles[0], l3File);
const hashAfterA = JSON.parse(fs.readFileSync(packA.stateFile, 'utf8'))
  .outputs.find((item) => item.kind === 'L3').sha256;

writeManifest(
  manifestB,
  sourceFile,
  sourceUrl,
  '内容创作',
  '创作视角素材',
  '内容创作目标下的观点提炼。'
);
const packB = createPack(manifestB, sourceFile, root, home);

const sourceBeforeQuoteDrift = fs.readFileSync(sourceFile, 'utf8');
fs.writeFileSync(
  sourceFile,
  sourceBeforeQuoteDrift.replace(
    '同一来源可以按不同目标加工。',
    '原文中的既有引用已被用户修改。'
  )
);
const beforeQuoteDriftAttempt = new Map(
  [sourceFile, packA.stateFile, packB.stateFile, packB.packFile, l3File].map(
    (file) => [file, fs.readFileSync(file, 'utf8')]
  )
);
const quoteDriftAttempt = approvePack(packB.packFile, root, home);
assert.strictEqual(quoteDriftAttempt.status, 1);
assert.strictEqual(JSON.parse(quoteDriftAttempt.stdout).error.code, 'QUOTE_NOT_FOUND');
for (const [file, content] of beforeQuoteDriftAttempt) {
  assert.strictEqual(fs.readFileSync(file, 'utf8'), content);
}
fs.writeFileSync(sourceFile, sourceBeforeQuoteDrift);

fs.appendFileSync(l3File, '\n用户手工修改。\n');
const beforeModifiedAttempt = new Map(
  [sourceFile, packA.stateFile, packB.stateFile, packB.packFile, l3File].map(
    (file) => [file, fs.readFileSync(file, 'utf8')]
  )
);
const modifiedAttempt = approvePack(packB.packFile, root, home);
assert.strictEqual(modifiedAttempt.status, 1);
assert.strictEqual(JSON.parse(modifiedAttempt.stdout).error.code, 'DERIVED_FILE_MODIFIED');
for (const [file, content] of beforeModifiedAttempt) {
  assert.strictEqual(fs.readFileSync(file, 'utf8'), content);
}
fs.writeFileSync(l3File, beforeModifiedAttempt.get(l3File).replace('\n用户手工修改。\n', ''));

const approvedB = approvePack(packB.packFile, root, home);
assert.strictEqual(approvedB.status, 0, approvedB.stderr || approvedB.stdout);
const resultB = JSON.parse(approvedB.stdout).result;
assert.strictEqual(resultB.publishedFiles[0], l3File);
assert.deepStrictEqual(fs.readdirSync(path.dirname(l3File)), [path.basename(l3File)]);
let sharedContent = fs.readFileSync(l3File, 'utf8');
assert.match(sharedContent, /研究视角素材/);
assert.match(sharedContent, /创作视角素材/);
assert.match(sharedContent, new RegExp(packA.packId.slice(0, 12)));
assert.match(sharedContent, new RegExp(packB.packId.slice(0, 12)));

const sourceAfterTwoGoals = fs.readFileSync(sourceFile, 'utf8');
assert.strictEqual((sourceAfterTwoGoals.match(/L3 引用素材包/g) || []).length, 1);
for (const packFile of [packA.packFile, packB.packFile]) {
  assert.match(fs.readFileSync(packFile, 'utf8'), new RegExp(sourcePrefix));
}

const currentHash = crypto.createHash('sha256').update(sharedContent).digest('hex');
const stateAfterBForA = JSON.parse(fs.readFileSync(packA.stateFile, 'utf8'));
const stateAfterBForB = JSON.parse(fs.readFileSync(packB.stateFile, 'utf8'));
assert.strictEqual(stateAfterBForA.outputs.find((item) => item.kind === 'L3').sha256, hashAfterA);
assert.strictEqual(stateAfterBForB.outputs.find((item) => item.kind === 'L3').sha256, currentHash);
for (const state of [stateAfterBForA, stateAfterBForB]) {
  assert.strictEqual(state.outputs.find((item) => item.kind === 'L3').file, l3File);
}
const materialsStateFile = path.join(
  vault,
  '.alskai-notebank',
  'materials',
  `${crypto.createHash('sha256').update(sourceUrl).digest('hex')}.json`
);
const materialsStateAfterB = JSON.parse(fs.readFileSync(materialsStateFile, 'utf8'));
assert.strictEqual(materialsStateAfterB.sha256, currentHash);
assert.strictEqual(materialsStateAfterB.publications.length, 2);

writeManifest(
  manifestA,
  sourceFile,
  sourceUrl,
  '研究',
  '修订后的研究素材',
  '研究目标修订后的观点提炼。'
);
const revisedA = createPack(manifestA, sourceFile, root, home);
assert.strictEqual(revisedA.revision, 2);
const approvedRevision = approvePack(revisedA.packFile, root, home);
assert.strictEqual(
  approvedRevision.status,
  0,
  approvedRevision.stderr || approvedRevision.stdout
);
assert.strictEqual(JSON.parse(approvedRevision.stdout).result.publishedFiles[0], l3File);
assert.deepStrictEqual(fs.readdirSync(path.dirname(l3File)), [path.basename(l3File)]);
sharedContent = fs.readFileSync(l3File, 'utf8');
assert.match(sharedContent, /研究视角素材/);
assert.match(sharedContent, /创作视角素材/);
assert.match(sharedContent, /修订后的研究素材/);

const revisedHash = crypto.createHash('sha256').update(sharedContent).digest('hex');
const immutableRevisionOne = JSON.parse(fs.readFileSync(
  path.join(path.dirname(packA.stateFile), 'revisions', '1.json'),
  'utf8'
));
const immutablePackB = JSON.parse(fs.readFileSync(packB.stateFile, 'utf8'));
const currentRevisionTwo = JSON.parse(fs.readFileSync(revisedA.stateFile, 'utf8'));
assert.strictEqual(
  immutableRevisionOne.outputs.find((item) => item.kind === 'L3').sha256,
  hashAfterA
);
assert.strictEqual(
  immutablePackB.outputs.find((item) => item.kind === 'L3').sha256,
  currentHash
);
assert.strictEqual(
  currentRevisionTwo.outputs.find((item) => item.kind === 'L3').sha256,
  revisedHash
);
const materialsStateAfterRevision = JSON.parse(fs.readFileSync(materialsStateFile, 'utf8'));
assert.strictEqual(materialsStateAfterRevision.sha256, revisedHash);
assert.strictEqual(materialsStateAfterRevision.publications.length, 3);

const manifestC = path.join(root, 'manifest-c.json');
writeManifest(
  manifestC,
  sourceFile,
  sourceUrl,
  '教学',
  '教学视角素材',
  '教学目标下的观点提炼。'
);
const packC = createPack(manifestC, sourceFile, root, home);
const revisionOneFile = path.join(path.dirname(packA.stateFile), 'revisions', '1.json');
const revisionOneContent = fs.readFileSync(revisionOneFile, 'utf8');

function assertBrokenHistoryRejected(label) {
  const before = snapshot(vault);
  const result = approvePack(packC.packFile, root, home);
  assert.strictEqual(result.status, 1, `${label}: ${result.stderr || result.stdout}`);
  assert.strictEqual(JSON.parse(result.stdout).error.code, 'PACK_ALREADY_EXISTS');
  assert.deepStrictEqual(snapshot(vault), before, `${label} must not rewrite shared L3`);
}

fs.rmSync(revisionOneFile);
assertBrokenHistoryRejected('missing historical revision');
fs.writeFileSync(revisionOneFile, revisionOneContent);

fs.writeFileSync(revisionOneFile, '{broken json\n');
assertBrokenHistoryRejected('corrupt historical revision');
fs.writeFileSync(revisionOneFile, revisionOneContent);

fs.rmSync(revisionOneFile);
fs.symlinkSync(packB.stateFile, revisionOneFile);
assertBrokenHistoryRejected('symlink historical revision');
fs.rmSync(revisionOneFile);
fs.writeFileSync(revisionOneFile, revisionOneContent);

const materialsStateContent = fs.readFileSync(materialsStateFile, 'utf8');
fs.rmSync(materialsStateFile);
assertBrokenHistoryRejected('missing shared materials state');
fs.writeFileSync(materialsStateFile, materialsStateContent);

fs.writeFileSync(materialsStateFile, '{broken json\n');
assertBrokenHistoryRejected('corrupt shared materials state');
fs.writeFileSync(materialsStateFile, materialsStateContent);

fs.rmSync(materialsStateFile);
fs.symlinkSync(packB.stateFile, materialsStateFile);
assertBrokenHistoryRejected('symlink shared materials state');
fs.rmSync(materialsStateFile);
fs.writeFileSync(materialsStateFile, materialsStateContent);

const driftRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'wechat-notebank-l3-url-drift-'));
const driftHome = path.join(driftRoot, 'home');
const driftVault = path.join(driftRoot, 'vault');
const driftSource = path.join(driftVault, 'L1_原文', 'WeChat', '来源漂移原文.md');
const oldUrl = 'https://mp.weixin.qq.com/s/old-source-identity';
const newUrl = 'https://mp.weixin.qq.com/s/new-source-identity';
const oldManifest = path.join(driftRoot, 'old-manifest.json');
const newManifest = path.join(driftRoot, 'new-manifest.json');
fs.mkdirSync(path.dirname(driftSource), { recursive: true });
fs.mkdirSync(driftHome, { recursive: true });
fs.writeFileSync(driftSource, [
  '---',
  'title: 来源漂移原文',
  `sourceUrl: ${oldUrl}`,
  '---',
  '',
  '来源身份不能在加工包之间漂移。',
  '',
].join('\n'));
writeManifest(
  oldManifest,
  driftSource,
  oldUrl,
  '旧来源目标',
  '旧来源素材',
  '旧来源下的观点提炼。'
);
createPack(oldManifest, driftSource, driftRoot, driftHome);
fs.writeFileSync(
  driftSource,
  fs.readFileSync(driftSource, 'utf8').replace(oldUrl, newUrl)
);
writeManifest(
  newManifest,
  driftSource,
  newUrl,
  '新来源目标',
  '新来源素材',
  '新来源下的观点提炼。'
);
const driftPack = createPack(newManifest, driftSource, driftRoot, driftHome);
const beforeDriftApproval = snapshot(driftVault);
const driftApproval = approvePack(driftPack.packFile, driftRoot, driftHome);
assert.strictEqual(driftApproval.status, 1);
assert.strictEqual(JSON.parse(driftApproval.stdout).error.code, 'PACK_ALREADY_EXISTS');
assert.deepStrictEqual(snapshot(driftVault), beforeDriftApproval);

console.log('pack approve shared L3 tests passed');
