const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const projectRoot = path.resolve(__dirname, '..');
const cliPath = path.join(projectRoot, 'dist', 'index.js');

function runInvalidManifest(manifest, sourceOverride) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'wechat-notebank-manifest-'));
  const home = path.join(root, 'home');
  const sourceFile = path.join(root, 'vault', 'L1_原文', 'WeChat', '原文.md');
  const manifestFile = path.join(root, 'manifest.json');
  const sourceUrl = 'https://mp.weixin.qq.com/s/manifest-validation';
  fs.mkdirSync(path.dirname(sourceFile), { recursive: true });
  fs.mkdirSync(home, { recursive: true });
  const sourceContent = sourceOverride || [
    '---',
    'title: 原文',
    `sourceUrl: ${sourceUrl}`,
    '---',
    '',
    '正文中存在的原句。',
    '',
  ].join('\n');
  fs.writeFileSync(sourceFile, sourceContent);
  fs.writeFileSync(manifestFile, JSON.stringify({
    schemaVersion: 1,
    sourceFile,
    sourceUrl,
    processingGoal: null,
    atomicNotes: [],
    materials: [],
    reviewQuestions: [],
    ...manifest,
  }, null, 2));
  const result = spawnSync(process.execPath, [
    cliPath,
    'pack', 'create',
    '--source', sourceFile,
    '--manifest', manifestFile,
    '--json',
  ], {
    cwd: root,
    encoding: 'utf8',
    env: { ...process.env, HOME: home },
  });
  return { result, root, sourceFile, sourceContent };
}

const duplicateIds = runInvalidManifest({
  atomicNotes: [
    {
      id: 'L2-01',
      title: '观点一',
      claim: '观点一',
      evidence: '证据一',
      boundary: '边界一',
      useCases: [],
    },
    {
      id: 'L2-01',
      title: '观点二',
      claim: '观点二',
      evidence: '证据二',
      boundary: '边界二',
      useCases: [],
    },
  ],
});
assert.strictEqual(duplicateIds.result.status, 1);
const duplicateOutput = JSON.parse(duplicateIds.result.stdout);
assert.strictEqual(duplicateOutput.error.code, 'MANIFEST_INVALID');
assert.match(duplicateOutput.error.message, /L2-01|重复/);
assert.strictEqual(
  fs.readFileSync(duplicateIds.sourceFile, 'utf8'),
  duplicateIds.sourceContent
);
assert.strictEqual(fs.existsSync(path.join(duplicateIds.root, 'vault', 'Inbox')), false);
assert.strictEqual(
  fs.existsSync(path.join(duplicateIds.root, 'vault', '.alskai-notebank')),
  false
);

const missingQuote = runInvalidManifest({
  materials: [{
    id: 'L3-01',
    kind: 'quote',
    title: '不存在的原句',
    content: '这句话不在原文里。',
    sourceSection: '正文',
  }],
});
assert.strictEqual(missingQuote.result.status, 1);
const missingQuoteOutput = JSON.parse(missingQuote.result.stdout);
assert.strictEqual(missingQuoteOutput.error.code, 'QUOTE_NOT_FOUND');
assert.match(missingQuoteOutput.error.message, /L3-01|原文/);
assert.strictEqual(
  fs.readFileSync(missingQuote.sourceFile, 'utf8'),
  missingQuote.sourceContent
);
assert.strictEqual(fs.existsSync(path.join(missingQuote.root, 'vault', 'Inbox')), false);

const invalidQuestion = runInvalidManifest({
  reviewQuestions: [{
    id: 'QUESTION-1',
    question: '这个 ID 是否符合 Manifest v1？',
  }],
});
assert.strictEqual(invalidQuestion.result.status, 1);
const invalidQuestionOutput = JSON.parse(invalidQuestion.result.stdout);
assert.strictEqual(invalidQuestionOutput.error.code, 'MANIFEST_INVALID');
assert.match(invalidQuestionOutput.error.message, /L4-Q|reviewQuestions/);

const unknownTopLevel = runInvalidManifest({
  generatedFor: 'ALSKai',
});
assert.strictEqual(unknownTopLevel.result.status, 1);
const unknownTopLevelOutput = JSON.parse(unknownTopLevel.result.stdout);
assert.strictEqual(unknownTopLevelOutput.error.code, 'MANIFEST_INVALID');
assert.match(unknownTopLevelOutput.error.message, /generatedFor|未知字段/);

const malformedSource = runInvalidManifest({}, [
  '---',
  'title: [未闭合',
  '---',
  '',
  '正文中存在的原句。',
].join('\n'));
assert.strictEqual(malformedSource.result.status, 1);
const malformedSourceOutput = JSON.parse(malformedSource.result.stdout);
assert.strictEqual(malformedSourceOutput.error.code, 'MANIFEST_INVALID');
assert.strictEqual(fs.existsSync(path.join(malformedSource.root, 'vault', 'Inbox')), false);

console.log('pack manifest json tests passed');
