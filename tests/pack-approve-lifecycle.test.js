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

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'wechat-notebank-lifecycle-'));
const home = path.join(root, 'home');
const vault = path.join(root, 'vault');
const sourceFile = path.join(vault, 'L1_原文', 'WeChat', '生命周期原文.md');
const manifestFile = path.join(root, 'manifest.json');
const sourceUrl = 'https://mp.weixin.qq.com/s/pack-lifecycle';
fs.mkdirSync(path.dirname(sourceFile), { recursive: true });
fs.mkdirSync(home, { recursive: true });
fs.writeFileSync(sourceFile, [
  '---',
  'title: 生命周期原文',
  `sourceUrl: ${sourceUrl}`,
  '---',
  '',
  '这是一段生命周期原文。',
  '',
].join('\n'));
const manifest = {
  schemaVersion: 1,
  sourceFile,
  sourceUrl,
  processingGoal: null,
  atomicNotes: [{
    id: 'L2-01',
    title: '生命周期观点',
    claim: '发布状态不应阻断后续修订。',
    evidence: '这是一段生命周期原文。',
    boundary: '适用于当前加工包。',
    useCases: ['状态测试'],
  }],
  materials: [],
  reviewQuestions: [{
    id: 'L4-Q01',
    question: '你准备如何应用这个观点？',
  }],
};
fs.writeFileSync(manifestFile, JSON.stringify(manifest, null, 2));

const created = runCli([
  'pack', 'create', '--source', sourceFile, '--manifest', manifestFile, '--json',
], root, home);
assert.strictEqual(created.status, 0, created.stderr || created.stdout);
const createdOutput = JSON.parse(created.stdout);
const { packFile, stateFile } = createdOutput.result;

const approved = runCli([
  'pack', 'approve', packFile, '--items', 'L2-01', '--json',
], root, home);
assert.strictEqual(approved.status, 0, approved.stderr || approved.stdout);
const approvedOutput = JSON.parse(approved.stdout);
assert.strictEqual(approvedOutput.status, 'partial');
assert.strictEqual(approvedOutput.result.status, 'partial');
assert.strictEqual(fs.existsSync(path.join(vault, 'L4_阅读复盘')), false);

const beforeL4Attempt = [sourceFile, packFile, stateFile].map(
  (file) => [file, fs.readFileSync(file, 'utf8')]
);
const l4Attempt = runCli([
  'pack', 'approve', packFile, '--items', 'L4-Q01', '--json',
], root, home);
assert.strictEqual(l4Attempt.status, 1);
assert.strictEqual(JSON.parse(l4Attempt.stdout).error.code, 'MANIFEST_INVALID');
for (const [file, content] of beforeL4Attempt) {
  assert.strictEqual(fs.readFileSync(file, 'utf8'), content);
}
assert.strictEqual(fs.existsSync(path.join(vault, 'L4_阅读复盘')), false);

const repeatedCreate = runCli([
  'pack', 'create', '--source', sourceFile, '--manifest', manifestFile, '--json',
], root, home);
assert.strictEqual(repeatedCreate.status, 0, repeatedCreate.stderr || repeatedCreate.stdout);
const repeatedOutput = JSON.parse(repeatedCreate.stdout);
assert.strictEqual(repeatedOutput.status, 'unchanged');
assert.strictEqual(repeatedOutput.result.status, 'partial');
assert.strictEqual(repeatedOutput.result.packFile, packFile);

const revisedManifest = {
  ...manifest,
  atomicNotes: [{
    ...manifest.atomicNotes[0],
    title: '修订后的生命周期观点',
    claim: '已发布状态也允许保留历史并创建新修订。',
  }],
};
fs.writeFileSync(manifestFile, JSON.stringify(revisedManifest, null, 2));
const revised = runCli([
  'pack', 'create', '--source', sourceFile, '--manifest', manifestFile, '--json',
], root, home);
assert.strictEqual(revised.status, 0, revised.stderr || revised.stdout);
const revisedOutput = JSON.parse(revised.stdout);
assert.strictEqual(revisedOutput.status, 'revised');
assert.strictEqual(revisedOutput.result.revision, 2);
assert.strictEqual(revisedOutput.result.status, 'pending');
const oldRevisionState = JSON.parse(fs.readFileSync(
  path.join(path.dirname(stateFile), 'revisions', '1.json'),
  'utf8'
));
assert.strictEqual(oldRevisionState.status, 'superseded');
assert.deepStrictEqual(oldRevisionState.approvedItems, ['L2-01']);
assert.strictEqual(oldRevisionState.outputs.length, 1);
assert.strictEqual(fs.existsSync(oldRevisionState.outputs[0].file), true);

const changedSource = fs.readFileSync(sourceFile, 'utf8').replace(
  sourceUrl,
  'https://mp.weixin.qq.com/s/another-source'
);
fs.writeFileSync(sourceFile, changedSource);
const beforeSourceMismatch = [
  sourceFile,
  revisedOutput.result.packFile,
  revisedOutput.result.stateFile,
].map((file) => [file, fs.readFileSync(file, 'utf8')]);
const sourceMismatch = runCli([
  'pack', 'approve', revisedOutput.result.packFile, '--items', 'L2-01', '--json',
], root, home);
assert.strictEqual(sourceMismatch.status, 1);
assert.strictEqual(JSON.parse(sourceMismatch.stdout).error.code, 'MANIFEST_INVALID');
for (const [file, content] of beforeSourceMismatch) {
  assert.strictEqual(fs.readFileSync(file, 'utf8'), content);
}

const errorRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'wechat-notebank-approve-errors-'));
const errorHome = path.join(errorRoot, 'home');
const errorVault = path.join(errorRoot, 'vault');
const errorSource = path.join(errorVault, 'L1_原文', 'WeChat', '错误边界原文.md');
const errorManifest = path.join(errorRoot, 'manifest.json');
const errorUrl = 'https://mp.weixin.qq.com/s/pack-approve-errors';
fs.mkdirSync(path.dirname(errorSource), { recursive: true });
fs.mkdirSync(errorHome, { recursive: true });
fs.writeFileSync(errorSource, [
  '---',
  'title: 错误边界原文',
  `sourceUrl: ${errorUrl}`,
  '---',
  '',
  '错误边界也要返回稳定机器码。',
  '',
].join('\n'));
fs.writeFileSync(errorManifest, JSON.stringify({
  schemaVersion: 1,
  sourceFile: errorSource,
  sourceUrl: errorUrl,
  processingGoal: null,
  atomicNotes: [{
    id: 'L2-01',
    title: '错误边界',
    claim: '运行时文件错误不能伪装成参数错误。',
    evidence: '错误边界也要返回稳定机器码。',
    boundary: '适用于加工包审批。',
    useCases: ['Agent 编排'],
  }],
  materials: [],
  reviewQuestions: [],
}, null, 2));
const errorCreated = runCli([
  'pack', 'create', '--source', errorSource, '--manifest', errorManifest, '--json',
], errorRoot, errorHome);
assert.strictEqual(errorCreated.status, 0, errorCreated.stderr || errorCreated.stdout);
const errorPack = JSON.parse(errorCreated.stdout).result;
const errorSourceContent = fs.readFileSync(errorSource, 'utf8');
const errorPackContent = fs.readFileSync(errorPack.packFile, 'utf8');
const errorStateContent = fs.readFileSync(errorPack.stateFile, 'utf8');

fs.rmSync(errorSource);
const missingSource = runCli([
  'pack', 'approve', errorPack.packFile, '--items', 'L2-01', '--json',
], errorRoot, errorHome);
assert.strictEqual(missingSource.status, 1);
assert.strictEqual(JSON.parse(missingSource.stdout).error.code, 'MANIFEST_INVALID');
assert.strictEqual(fs.readFileSync(errorPack.packFile, 'utf8'), errorPackContent);
assert.strictEqual(fs.readFileSync(errorPack.stateFile, 'utf8'), errorStateContent);
fs.writeFileSync(errorSource, errorSourceContent);

fs.writeFileSync(errorPack.packFile, '---\ninvalid: [\n---\n');
const corruptPack = runCli([
  'pack', 'approve', errorPack.packFile, '--items', 'L2-01', '--json',
], errorRoot, errorHome);
assert.strictEqual(corruptPack.status, 1);
assert.strictEqual(JSON.parse(corruptPack.stdout).error.code, 'PACK_ALREADY_EXISTS');
assert.strictEqual(fs.readFileSync(errorPack.packFile, 'utf8'), '---\ninvalid: [\n---\n');
assert.strictEqual(fs.readFileSync(errorSource, 'utf8'), errorSourceContent);
assert.strictEqual(fs.readFileSync(errorPack.stateFile, 'utf8'), errorStateContent);

console.log('pack approve lifecycle tests passed');
