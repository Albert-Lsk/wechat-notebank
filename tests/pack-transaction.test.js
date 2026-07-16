const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { createPackCommand } = require('../dist/commands/pack');

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
        entries.push(
          `f:${childRelative}:${stat.mode & 0o777}:${fs.readFileSync(absolute, 'hex')}`
        );
      }
    }
  }
  visit(root, '');
  return entries;
}

(async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'wechat-notebank-pack-tx-'));
  const vault = path.join(root, 'vault');
  const sourceFile = path.join(vault, 'L1_原文', 'WeChat', '事务原文.md');
  const sourceUrl = 'https://mp.weixin.qq.com/s/pack-transaction';
  const manifestFile = path.join(root, 'manifest.json');
  fs.mkdirSync(path.dirname(sourceFile), { recursive: true });
  fs.writeFileSync(sourceFile, [
    '---',
    'title: 事务原文',
    `sourceUrl: ${sourceUrl}`,
    '---',
    '',
    '事务失败后这段原文必须完全不变。',
    '',
  ].join('\n'));
  fs.writeFileSync(manifestFile, JSON.stringify({
    schemaVersion: 1,
    sourceFile,
    sourceUrl,
    processingGoal: null,
    atomicNotes: [],
    materials: [],
    reviewQuestions: [],
  }, null, 2));
  const before = snapshot(vault);

  await assert.rejects(
    createPackCommand({
      sourceFile,
      manifestFile,
      json: true,
    }, {
      beforeApply(index) {
        if (index === 2) {
          throw new Error('injected commit failure');
        }
      },
    }),
    (error) => error.code === 'TRANSACTION_FAILED' &&
      /injected commit failure/.test(error.message)
  );

  assert.deepStrictEqual(
    snapshot(vault),
    before,
    'failed pack transaction should restore the vault exactly'
  );

  const initial = await createPackCommand({
    sourceFile,
    manifestFile,
    json: true,
  });
  const validState = fs.readFileSync(initial.stateFile, 'utf8');
  fs.writeFileSync(initial.stateFile, '{}\n');
  const corruptState = snapshot(vault);
  await assert.rejects(
    createPackCommand({
      sourceFile,
      manifestFile,
      json: true,
    }),
    (error) => error.code === 'PACK_ALREADY_EXISTS'
  );
  assert.deepStrictEqual(
    snapshot(vault),
    corruptState,
    'corrupt current state should fail without changing the vault'
  );
  fs.writeFileSync(initial.stateFile, validState);
  const revisedManifest = JSON.parse(fs.readFileSync(manifestFile, 'utf8'));
  revisedManifest.atomicNotes = [{
    id: 'L2-01',
    title: '事务边界',
    claim: '修订失败也必须恢复旧版本。',
    evidence: '事务失败后这段原文必须完全不变。',
    boundary: '仅覆盖本地文件事务。',
    useCases: ['回归测试'],
  }];
  fs.writeFileSync(manifestFile, JSON.stringify(revisedManifest, null, 2));
  const beforeRevision = snapshot(vault);

  await assert.rejects(
    createPackCommand({
      sourceFile,
      manifestFile,
      json: true,
    }, {
      beforeApply(index) {
        if (index === 3) {
          throw new Error('injected revision failure');
        }
      },
    }),
    (error) => error.code === 'TRANSACTION_FAILED' &&
      /injected revision failure/.test(error.message)
  );

  assert.deepStrictEqual(
    snapshot(vault),
    beforeRevision,
    'failed revision should restore visible pack, history, current state, and source'
  );

  console.log('pack transaction tests passed');
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
