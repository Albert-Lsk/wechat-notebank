const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const projectRoot = path.resolve(__dirname, '..');
const readme = fs.readFileSync(path.join(projectRoot, 'README.md'), 'utf8');
const { validateInitialManifest, validateQuotes } = require(
  path.join(projectRoot, 'dist', 'lib', 'pack-manifest.js')
);
const cliPath = path.join(projectRoot, 'dist', 'index.js');

// README 中的 ```json 围栏块
const jsonBlocks = [...readme.matchAll(/```json\n([\s\S]*?)\n```/g)]
  .map((match) => match[1]);

// 1. 提取示例 manifest（含 L2/L3/L4 候选的完整示例），交给真实校验器（dist 构建产物）校验
const manifestBlock = jsonBlocks.find(
  (block) => block.includes('"schemaVersion"') && block.includes('"useCases"')
);
assert.ok(manifestBlock, 'README 应包含一份可复制的示例 manifest JSON');
const manifest = JSON.parse(manifestBlock);
assert.deepStrictEqual(Object.keys(manifest), [
  'schemaVersion',
  'sourceFile',
  'sourceUrl',
  'processingGoal',
  'atomicNotes',
  'materials',
  'reviewQuestions',
]);
validateInitialManifest(manifest, path.resolve(manifest.sourceFile));

// 2. 示例中的 quote 内容必须能被真实校验函数精确命中
const quote = manifest.materials[0];
assert.strictEqual(quote.kind, 'quote');
validateQuotes(manifest.materials, `${quote.content}\n`);

// 3. 用构建产物 CLI 端到端跑一遍示例 manifest，断言创建成功
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'readme-manifest-'));
const home = path.join(root, 'home');
fs.mkdirSync(home, { recursive: true });
const sourceDirectory = path.join(root, 'WeChatArticles', 'L1_原文', 'WeChat');
fs.mkdirSync(sourceDirectory, { recursive: true });
const sourceFile = path.join(sourceDirectory, '示例原文.md');
fs.writeFileSync(sourceFile, [
  '---',
  'title: 示例原文',
  `sourceUrl: ${manifest.sourceUrl}`,
  '---',
  '',
  quote.content,
  '',
].join('\n'));
const manifestFile = path.join(root, 'manifest.json');
fs.writeFileSync(manifestFile, JSON.stringify(
  { ...manifest, sourceFile },
  null,
  2
));
const success = spawnSync(process.execPath, [
  cliPath, 'pack', 'create',
  '--source', sourceFile,
  '--manifest', manifestFile,
  '--json',
], { cwd: root, encoding: 'utf8', env: { ...process.env, HOME: home } });
assert.strictEqual(success.status, 0, success.stderr || success.stdout);
const successOutput = JSON.parse(success.stdout);
assert.strictEqual(successOutput.ok, true);
assert.strictEqual(successOutput.command, 'pack.create');
assert.strictEqual(successOutput.result.sourceUrl, manifest.sourceUrl);
assert.strictEqual(successOutput.result.processingGoal, manifest.processingGoal);
assert.ok(fs.existsSync(successOutput.result.packFile));

// 4. 未命中的引用会被真实 CLI 拒收，报错形态与 README 展示的一致
const failureBlock = jsonBlocks.find((block) => block.includes('"QUOTE_NOT_FOUND"'));
assert.ok(failureBlock, 'README 应展示 QUOTE_NOT_FOUND 的报错形态');
const readmeFailure = JSON.parse(failureBlock);
const tamperedFile = path.join(root, 'manifest-tampered.json');
fs.writeFileSync(tamperedFile, JSON.stringify({
  ...manifest,
  sourceFile,
  materials: [{
    ...quote,
    content: '这句引文没有出现在原文里。',
  }],
}, null, 2));
const failure = spawnSync(process.execPath, [
  cliPath, 'pack', 'create',
  '--source', sourceFile,
  '--manifest', tamperedFile,
  '--json',
], { cwd: root, encoding: 'utf8', env: { ...process.env, HOME: home } });
assert.strictEqual(failure.status, 1);
const actualFailure = JSON.parse(failure.stdout);
assert.deepStrictEqual(actualFailure, {
  ok: false,
  command: 'pack.create',
  status: 'failed',
  error: {
    code: 'QUOTE_NOT_FOUND',
    message: `直接引用 ${quote.id} 未在原文中精确命中`,
  },
});
assert.deepStrictEqual(readmeFailure, actualFailure);

// 5. 字段表与精确命中说明必须留在文档里
for (const field of [
  'schemaVersion',
  'sourceFile',
  'sourceUrl',
  'processingGoal',
  'atomicNotes',
  'materials',
  'reviewQuestions',
  'claim',
  'evidence',
  'boundary',
  'useCases',
  'kind',
  'sourceSection',
]) {
  assert.match(readme, new RegExp(`\`${field}\``));
}
assert.match(readme, /原文精确命中/);
assert.match(readme, /QUOTE_NOT_FOUND/);

console.log('readme manifest example tests passed');
