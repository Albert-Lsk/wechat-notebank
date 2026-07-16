const assert = require('assert');
const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const projectRoot = path.resolve(__dirname, '..');
const cliPath = path.join(projectRoot, 'dist', 'index.js');

function runCli(args, cwdPath, homePath, extraEnv = {}) {
  return spawnSync(process.execPath, [cliPath, ...args], {
    cwd: cwdPath,
    encoding: 'utf8',
    env: { ...process.env, HOME: homePath, ...extraEnv },
  });
}

function runDoctor(cwdPath, homePath, chromePath) {
  const statements = [
    "Object.defineProperty(process, 'platform', { value: 'darwin' });",
    "Object.defineProperty(process, 'arch', { value: 'arm64' });",
    `process.argv = [process.execPath, ${JSON.stringify(cliPath)}, 'doctor', '--json'];`,
    `require(${JSON.stringify(cliPath)});`,
  ];
  return spawnSync(process.execPath, ['-e', statements.join('')], {
    cwd: cwdPath,
    encoding: 'utf8',
    env: {
      ...process.env,
      HOME: homePath,
      WECHAT_NOTEBANK_CHROME_PATH: chromePath,
    },
  });
}

function snapshot(directory) {
  const entries = [];
  function visit(current, relative) {
    for (const name of fs.readdirSync(current).sort()) {
      const absolute = path.join(current, name);
      const childRelative = path.join(relative, name);
      const stat = fs.lstatSync(absolute);
      if (stat.isSymbolicLink()) {
        entries.push(`l:${childRelative}:${stat.mtimeMs}:${fs.readlinkSync(absolute)}`);
      } else if (stat.isDirectory()) {
        entries.push(`d:${childRelative}:${stat.mode & 0o777}:${stat.mtimeMs}`);
        visit(absolute, childRelative);
      } else {
        entries.push(
          `f:${childRelative}:${stat.mode & 0o777}:${stat.mtimeMs}:` +
          fs.readFileSync(absolute, 'hex')
        );
      }
    }
  }
  visit(directory, '');
  return entries;
}

function assertCommand(result, label) {
  assert.strictEqual(result.status, 0, `${label}: ${result.stderr || result.stdout}`);
  assert.strictEqual(result.stderr, '', label);
  return JSON.parse(result.stdout).result;
}

function writeManifest(file, manifest) {
  fs.writeFileSync(file, `${JSON.stringify(manifest, null, 2)}\n`);
}

function createCompletedPack(input) {
  const manifestFile = path.join(input.root, `${input.name}.json`);
  const initialManifest = {
    schemaVersion: 1,
    sourceFile: input.sourceFile,
    sourceUrl: input.sourceUrl,
    processingGoal: input.processingGoal,
    atomicNotes: input.atomicNotes,
    materials: input.materials,
    reviewQuestions: input.reviewQuestions,
  };
  writeManifest(manifestFile, initialManifest);
  const created = assertCommand(runCli([
    'pack', 'create',
    '--source', input.sourceFile,
    '--manifest', manifestFile,
    '--json',
  ], input.root, input.home), `${input.name} create`);

  const completeManifest = {
    ...initialManifest,
    reviewAnswers: Object.fromEntries(input.reviewQuestions.map(
      (question) => [question.id, `${input.processingGoal}：我的原始回答。`]
    )),
    reviewDraft: `${input.processingGoal}：Agent 整理稿。`,
  };
  writeManifest(manifestFile, completeManifest);
  assertCommand(runCli([
    'pack', 'update', created.packFile,
    '--manifest', manifestFile,
    '--json',
  ], input.root, input.home), `${input.name} update`);

  const itemIds = [
    ...input.atomicNotes.map((item) => item.id),
    ...input.materials.map((item) => item.id),
    ...input.reviewQuestions.map((item) => item.id),
  ];
  assertCommand(runCli([
    'pack', 'approve', created.packFile,
    '--items', itemIds.join(','),
    '--json',
  ], input.root, input.home), `${input.name} approve`);
  return created;
}

function preserveFile(file) {
  const stat = fs.statSync(file);
  const content = fs.readFileSync(file);
  return () => {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, content);
    fs.chmodSync(file, stat.mode & 0o777);
    fs.utimesSync(file, stat.atime, stat.mtime);
  };
}

function checkById(output, id, expectedPath) {
  const check = output.result.checks.find((candidate) => candidate.id === id);
  assert.ok(check, `missing doctor check: ${id}`);
  assert.strictEqual(check.status, 'warning', id);
  assert.ok(
    check.message.includes(expectedPath),
    `${id} should identify ${expectedPath}: ${check.message}`
  );
  return check;
}

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'wechat-notebank-doctor-pack-'));
const home = path.join(root, 'home');
const vault = path.join(root, 'vault');
const sourceFile = path.join(vault, 'L1_原文', 'WeChat', '完整性原文.md');
const sourceUrl = 'https://mp.weixin.qq.com/s/doctor-pack-integrity';
const chromePath = path.join(root, 'Google Chrome');
fs.mkdirSync(path.dirname(sourceFile), { recursive: true });
fs.mkdirSync(home, { recursive: true });
fs.writeFileSync(chromePath, '');
fs.chmodSync(chromePath, 0o755);
fs.writeFileSync(sourceFile, [
  '---',
  'title: 完整性原文',
  `sourceUrl: ${sourceUrl}`,
  '---',
  '',
  '共享加工必须保留可核对的原文依据。',
  '',
].join('\n'));
const configFile = path.join(home, '.config', 'alskai-notebank', 'config.json');
fs.mkdirSync(path.dirname(configFile), { recursive: true });
fs.writeFileSync(configFile, `${JSON.stringify({ archivePath: vault }, null, 2)}\n`);

const packA = createCompletedPack({
  root,
  home,
  name: 'manifest-a',
  sourceFile,
  sourceUrl,
  processingGoal: '研究',
  atomicNotes: [{
    id: 'L2-01',
    title: '保留依据',
    claim: '加工结果必须可追溯。',
    evidence: '共享加工必须保留可核对的原文依据。',
    boundary: '适用于需要人工审核的知识加工。',
    useCases: ['研究'],
  }],
  materials: [{
    id: 'L3-01',
    kind: 'quote',
    title: '研究素材',
    content: '共享加工必须保留可核对的原文依据。',
    sourceSection: '正文',
  }],
  reviewQuestions: [{ id: 'L4-Q01', question: '你会如何使用这条依据？' }],
});
const packB = createCompletedPack({
  root,
  home,
  name: 'manifest-b',
  sourceFile,
  sourceUrl,
  processingGoal: '创作',
  atomicNotes: [],
  materials: [{
    id: 'L3-01',
    kind: 'paraphrase',
    title: '创作素材',
    content: '发布内容前，要保留能回到原文的证据。',
    sourceSection: '正文',
  }],
  reviewQuestions: [{ id: 'L4-Q01', question: '你会如何把它写进文章？' }],
});

const sourceHash = crypto.createHash('sha256').update(sourceUrl).digest('hex');
const stateA = JSON.parse(fs.readFileSync(packA.stateFile, 'utf8'));
const l2Output = stateA.outputs.find((output) => output.kind === 'L2');
const l3Output = stateA.outputs.find((output) => output.kind === 'L3');
const l4Output = stateA.outputs.find((output) => output.kind === 'L4');
const materialsStateFile = path.join(
  vault,
  '.alskai-notebank',
  'materials',
  `${sourceHash}.json`
);
const reflectionsStateFile = path.join(
  vault,
  '.alskai-notebank',
  'reflections',
  `${sourceHash}.json`
);
const materialsState = JSON.parse(fs.readFileSync(materialsStateFile, 'utf8'));
const reflectionsState = JSON.parse(fs.readFileSync(reflectionsStateFile, 'utf8'));
assert.notStrictEqual(
  l3Output.sha256,
  materialsState.sha256,
  'fixture must retain an older pack-local L3 hash after shared aggregation changes'
);
assert.notStrictEqual(
  l4Output.sha256,
  reflectionsState.sha256,
  'fixture must retain an older pack-local L4 hash after shared aggregation changes'
);
const ordinaryInboxNote = path.join(vault, 'Inbox', '随手记.md');
fs.writeFileSync(ordinaryInboxNote, '# 这不是加工包\n');
const patternedInboxNote = path.join(vault, 'Inbox', '会议记录-deadbeefcafe-r1.md');
fs.writeFileSync(patternedInboxNote, '# 普通会议记录\n\n文件名碰巧相似，也不是加工包。\n');

function doctorReadOnly(label) {
  const before = snapshot(root);
  const result = runDoctor(root, home, chromePath);
  assert.strictEqual(result.status, 0, `${label}: ${result.stderr || result.stdout}`);
  const output = JSON.parse(result.stdout);
  assert.deepStrictEqual(snapshot(root), before, `${label}: doctor must be read-only`);
  return output;
}

const healthy = doctorReadOnly('healthy L2/L3/L4');
const healthyIntegrity = healthy.result.checks.find(
  (check) => check.id === 'integrity'
);
assert.ok(healthyIntegrity, 'healthy archive must emit the integrity summary check');
assert.strictEqual(
  healthyIntegrity.status,
  'passed'
);
assert.ok(
  !healthy.result.checks.some(
    (check) => check.id.startsWith('integrity:') && check.status === 'warning'
  ),
  'healthy generated files, links, and shared aggregates must not warn'
);

const restoreSourceIdentity = preserveFile(sourceFile);
fs.writeFileSync(
  sourceFile,
  fs.readFileSync(sourceFile, 'utf8').replace(
    `sourceUrl: ${sourceUrl}`,
    'sourceUrl: https://mp.weixin.qq.com/s/manual-drift'
  )
);
checkById(
  doctorReadOnly('source identity drift'),
  `integrity:pack:${packA.packId}:r1:source-state`,
  sourceFile
);
restoreSourceIdentity();

const restoreVisibleMetadata = preserveFile(packA.packFile);
fs.writeFileSync(
  packA.packFile,
  fs.readFileSync(packA.packFile, 'utf8').replace(
    /^createdAt: .+$/m,
    'createdAt: 2099-01-01T00:00:00.000Z'
  )
);
checkById(
  doctorReadOnly('visible pack metadata drift'),
  `integrity:pack:${packA.packId}:r1:state:visible`,
  packA.packFile
);
restoreVisibleMetadata();

const restoreMissingL2 = preserveFile(l2Output.file);
fs.rmSync(l2Output.file);
checkById(
  doctorReadOnly('missing generated L2'),
  `integrity:pack:${packA.packId}:r1:output:L2-01`,
  l2Output.file
);
restoreMissingL2();

const restoreL2Backlink = preserveFile(l2Output.file);
const l2SourceBacklink = fs.readFileSync(l2Output.file, 'utf8')
  .split('\n')
  .find((line) => line.startsWith('原文：[['));
assert.ok(l2SourceBacklink, 'fixture L2 must contain a source backlink');
fs.writeFileSync(
  l2Output.file,
  fs.readFileSync(l2Output.file, 'utf8').replace(l2SourceBacklink, l2SourceBacklink.slice(0, -2))
);
checkById(
  doctorReadOnly('malformed L2 reverse link'),
  `integrity:pack:${packA.packId}:r1:output-links:L2-01`,
  l2Output.file
);
restoreL2Backlink();

const restoreSharedL3 = preserveFile(l3Output.file);
fs.appendFileSync(l3Output.file, '\n人工修改导致当前共享哈希漂移。\n');
checkById(
  doctorReadOnly('shared L3 hash drift'),
  `integrity:shared:L3:${sourceHash}`,
  l3Output.file
);
restoreSharedL3();

const sourceLinkLine = fs.readFileSync(sourceFile, 'utf8')
  .split('\n')
  .find((line) => line.includes('L2-01 · 保留依据'));
assert.ok(sourceLinkLine, 'fixture source must contain the exact L2 backlink');
const restoreSourceLink = preserveFile(sourceFile);
fs.writeFileSync(
  sourceFile,
  fs.readFileSync(sourceFile, 'utf8').replace(`${sourceLinkLine}\n`, '')
);
checkById(
  doctorReadOnly('missing source backlink'),
  `integrity:pack:${packA.packId}:r1:source-link:L2-01`,
  sourceFile
);
restoreSourceLink();

const restoreMovedSourceLink = preserveFile(sourceFile);
const sourceWithManagedLink = fs.readFileSync(sourceFile, 'utf8');
fs.writeFileSync(
  sourceFile,
  `${sourceWithManagedLink.replace(`${sourceLinkLine}\n`, '')}\n${sourceLinkLine}\n`
);
checkById(
  doctorReadOnly('source backlink outside managed region'),
  `integrity:pack:${packA.packId}:r1:source-link:L2-01`,
  sourceFile
);
restoreMovedSourceLink();

const restoreSourceMarker = preserveFile(sourceFile);
fs.writeFileSync(
  sourceFile,
  fs.readFileSync(sourceFile, 'utf8').replace(
    '<!-- alskai-notebank:derived:start -->',
    '<!-- 人工删除了 derived start marker -->'
  )
);
checkById(
  doctorReadOnly('source managed region marker drift'),
  `integrity:pack:${packA.packId}:r1:source-links`,
  sourceFile
);
restoreSourceMarker();

const restoreExtraSourceLink = preserveFile(sourceFile);
fs.writeFileSync(
  sourceFile,
  fs.readFileSync(sourceFile, 'utf8').replace(
    '<!-- alskai-notebank:derived:end -->',
    '* [[不存在的旧卡片]]\n<!-- alskai-notebank:derived:end -->'
  )
);
checkById(
  doctorReadOnly('extra noncanonical source link'),
  `integrity:pack:${packA.packId}:r1:source-links`,
  sourceFile
);
restoreExtraSourceLink();

const sourcePackLink = fs.readFileSync(sourceFile, 'utf8')
  .split('\n')
  .find((line) => line.includes(path.basename(packA.packFile, '.md')) &&
    line.startsWith('- 待审核加工包：'));
assert.ok(sourcePackLink, 'fixture source must link to pack A');
const restoreSourcePackLink = preserveFile(sourceFile);
fs.writeFileSync(
  sourceFile,
  fs.readFileSync(sourceFile, 'utf8').replace(`${sourcePackLink}\n`, '')
);
checkById(
  doctorReadOnly('missing source to pack link'),
  `integrity:pack:${packA.packId}:r1:source-link:pack`,
  sourceFile
);
restoreSourcePackLink();

const packLinkLine = fs.readFileSync(packA.packFile, 'utf8')
  .split('\n')
  .find(
    (line) => line.startsWith('- L2 原子卡片：') &&
      line.includes('L2-01 · 保留依据')
  );
assert.ok(packLinkLine, 'fixture pack must contain the exact L2 link');
const restorePackLink = preserveFile(packA.packFile);
fs.writeFileSync(
  packA.packFile,
  fs.readFileSync(packA.packFile, 'utf8').replace(`${packLinkLine}\n`, '')
);
checkById(
  doctorReadOnly('missing pack link'),
  `integrity:pack:${packA.packId}:r1:pack-link:L2-01`,
  packA.packFile
);
restorePackLink();

const restoreMovedPackLink = preserveFile(packA.packFile);
const packWithManagedLink = fs.readFileSync(packA.packFile, 'utf8');
fs.writeFileSync(
  packA.packFile,
  `${packWithManagedLink.replace(`${packLinkLine}\n`, '')}\n${packLinkLine}\n`
);
checkById(
  doctorReadOnly('pack link outside managed region'),
  `integrity:pack:${packA.packId}:r1:pack-link:L2-01`,
  packA.packFile
);
restoreMovedPackLink();

const restoreExtraPackLink = preserveFile(packA.packFile);
fs.writeFileSync(
  packA.packFile,
  fs.readFileSync(packA.packFile, 'utf8').replace(
    '<!-- alskai-notebank:published:end -->',
    '* [[不存在的旧发布]]\n<!-- alskai-notebank:published:end -->'
  )
);
checkById(
  doctorReadOnly('extra noncanonical pack link'),
  `integrity:pack:${packA.packId}:r1:pack-links`,
  packA.packFile
);
restoreExtraPackLink();

const packSourceLink = fs.readFileSync(packA.packFile, 'utf8')
  .split('\n')
  .find((line) => line.startsWith('原文：[['));
assert.ok(packSourceLink, 'fixture pack must contain the source reverse link');
const restorePackSourceLink = preserveFile(packA.packFile);
fs.writeFileSync(
  packA.packFile,
  fs.readFileSync(packA.packFile, 'utf8').replace(
    packSourceLink,
    packSourceLink.slice(0, -2)
  )
);
checkById(
  doctorReadOnly('malformed pack source reverse link'),
  `integrity:pack:${packA.packId}:r1:pack-link:source`,
  packA.packFile
);
restorePackSourceLink();

const restoreCurrentState = preserveFile(packA.stateFile);
fs.rmSync(packA.stateFile);
checkById(
  doctorReadOnly('missing current state'),
  `integrity:pack:${packA.packId}:r1:state`,
  packA.stateFile
);
restoreCurrentState();

const revisionStateFile = path.join(
  path.dirname(packA.stateFile),
  'revisions',
  '1.json'
);
const restoreDriftedState = preserveFile(packA.stateFile);
const driftedState = JSON.parse(fs.readFileSync(packA.stateFile, 'utf8'));
driftedState.updatedAt = '2099-01-01T00:00:00.000Z';
fs.writeFileSync(packA.stateFile, `${JSON.stringify(driftedState, null, 2)}\n`);
const stateDriftCheck = checkById(
  doctorReadOnly('current revision drift'),
  `integrity:pack:${packA.packId}:r1:state`,
  packA.stateFile
);
assert.ok(
  stateDriftCheck.message.includes(revisionStateFile),
  `state drift should identify both snapshots: ${stateDriftCheck.message}`
);
restoreDriftedState();

const misplacedRevisionStateFile = path.join(
  path.dirname(revisionStateFile),
  '2.json'
);
fs.renameSync(revisionStateFile, misplacedRevisionStateFile);
checkById(
  doctorReadOnly('revision snapshot filename drift'),
  `integrity:pack:${packA.packId}:r2:state`,
  misplacedRevisionStateFile
);
fs.renameSync(misplacedRevisionStateFile, revisionStateFile);

const zeroPaddedRevisionStateFile = path.join(
  path.dirname(revisionStateFile),
  '01.json'
);
fs.renameSync(revisionStateFile, zeroPaddedRevisionStateFile);
checkById(
  doctorReadOnly('noncanonical revision snapshot filename'),
  `integrity:pack:${packA.packId}:r1:state`,
  zeroPaddedRevisionStateFile
);
fs.renameSync(zeroPaddedRevisionStateFile, revisionStateFile);

const materialsDirectory = path.dirname(materialsStateFile);
const materialsDirectoryBackup = path.join(
  path.dirname(materialsDirectory),
  'materials-real'
);
fs.renameSync(materialsDirectory, materialsDirectoryBackup);
fs.symlinkSync(materialsDirectoryBackup, materialsDirectory, 'dir');
checkById(
  doctorReadOnly('shared state parent symlink'),
  `integrity:shared:L3:${sourceHash}`,
  materialsStateFile
);
fs.rmSync(materialsDirectory);
fs.renameSync(materialsDirectoryBackup, materialsDirectory);

const packsRoot = path.join(vault, '.alskai-notebank', 'packs');
const packsBackup = path.join(vault, '.alskai-notebank', 'packs-backup');
const externalPacks = path.join(root, 'external-packs');
fs.renameSync(packsRoot, packsBackup);
fs.mkdirSync(externalPacks);
fs.writeFileSync(path.join(externalPacks, 'untrusted.json'), '{}\n');
fs.symlinkSync(externalPacks, packsRoot, 'dir');
checkById(
  doctorReadOnly('untrusted packs scan root'),
  'integrity:scan:packs',
  packsRoot
);
fs.rmSync(packsRoot);
fs.renameSync(packsBackup, packsRoot);

console.log('doctor pack integrity tests passed');
