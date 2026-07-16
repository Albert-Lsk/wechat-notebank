const assert = require('assert');
const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { createPackCommand } = require('../dist/commands/pack');
const { commitFileTransaction } = require('../dist/lib/file-transaction');

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

  for (const failureIndex of [0, 1, 3]) {
    await assert.rejects(
      createPackCommand({ sourceFile, manifestFile, json: true }, {
        beforeApply(index) {
          if (index === failureIndex) {
            throw new Error(`injected initial failure ${failureIndex}`);
          }
        },
      }),
      (error) => error.code === 'TRANSACTION_FAILED' &&
        error.message.includes(`injected initial failure ${failureIndex}`)
    );
    assert.deepStrictEqual(snapshot(vault), before);
  }

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
  const unrelatedFile = path.join(vault, 'Inbox', '用户笔记.md');
  fs.writeFileSync(unrelatedFile, '不能被加工包状态接管。\n');
  const redirectedState = JSON.parse(validState);
  redirectedState.packFile = unrelatedFile;
  fs.writeFileSync(initial.stateFile, JSON.stringify(redirectedState, null, 2));
  const redirectedSnapshot = snapshot(vault);
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
    redirectedSnapshot,
    'current state must not redirect updates to an arbitrary vault file'
  );
  fs.writeFileSync(initial.stateFile, validState);
  fs.rmSync(unrelatedFile);
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

  for (const failureIndex of [0, 1, 2, 4, 5]) {
    await assert.rejects(
      createPackCommand({ sourceFile, manifestFile, json: true }, {
        beforeApply(index) {
          if (index === failureIndex) {
            throw new Error(`injected revision failure ${failureIndex}`);
          }
        },
      }),
      (error) => error.code === 'TRANSACTION_FAILED' &&
        error.message.includes(`injected revision failure ${failureIndex}`)
    );
    assert.deepStrictEqual(snapshot(vault), beforeRevision);
  }

  await assert.rejects(
    createPackCommand({
      sourceFile,
      manifestFile,
      json: true,
    }, {
      afterBackup(index) {
        if (index === 0) {
          throw new Error('injected failure after backup');
        }
      },
    }),
    (error) => error.code === 'TRANSACTION_FAILED' &&
      /injected failure after backup/.test(error.message)
  );

  assert.deepStrictEqual(
    snapshot(vault),
    beforeRevision,
    'failure after moving a backup should restore the original file'
  );

  const orphanRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'wechat-notebank-pack-orphan-'));
  const orphanVault = path.join(orphanRoot, 'vault');
  const orphanSource = path.join(orphanVault, 'L1_原文', 'WeChat', '孤儿原文.md');
  const orphanManifest = path.join(orphanRoot, 'manifest.json');
  const orphanUrl = 'https://mp.weixin.qq.com/s/orphan-pack';
  fs.mkdirSync(path.dirname(orphanSource), { recursive: true });
  fs.writeFileSync(orphanSource, [
    '---',
    'title: 孤儿原文',
    `sourceUrl: ${orphanUrl}`,
    '---',
    '',
    '已有孤儿加工包时不能覆盖。',
    '',
  ].join('\n'));
  fs.writeFileSync(orphanManifest, JSON.stringify({
    schemaVersion: 1,
    sourceFile: orphanSource,
    sourceUrl: orphanUrl,
    processingGoal: null,
    atomicNotes: [],
    materials: [],
    reviewQuestions: [],
  }, null, 2));
  const orphanPackId = crypto.createHash('sha256')
    .update(`${orphanUrl}\n__general__`)
    .digest('hex');
  const orphanPackFile = path.join(
    orphanVault,
    'Inbox',
    `孤儿原文-${orphanPackId.slice(0, 12)}-r1.md`
  );
  fs.mkdirSync(path.dirname(orphanPackFile), { recursive: true });
  fs.writeFileSync(orphanPackFile, '用户已有内容\n');
  const beforeOrphanCreate = snapshot(orphanVault);

  await assert.rejects(
    createPackCommand({
      sourceFile: orphanSource,
      manifestFile: orphanManifest,
      json: true,
    }),
    (error) => error.code === 'PACK_ALREADY_EXISTS'
  );
  assert.deepStrictEqual(
    snapshot(orphanVault),
    beforeOrphanCreate,
    'orphan visible pack should never be overwritten'
  );

  const [concurrentFirst, concurrentSecond] = await Promise.all([
    createPackCommand({ sourceFile, manifestFile, json: true }, {
      beforeApply: async () => {
        await new Promise((resolve) => setTimeout(resolve, 30));
      },
    }),
    createPackCommand({ sourceFile, manifestFile, json: true }),
  ]);
  assert.deepStrictEqual(
    [concurrentFirst.action, concurrentSecond.action].sort(),
    ['reuse', 'revise'],
    'same source URL should serialize concurrent pack creation'
  );
  assert.strictEqual(concurrentFirst.revision, 2);
  assert.strictEqual(concurrentSecond.revision, 2);

  const symlinkRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'wechat-notebank-pack-link-'));
  const symlinkVault = path.join(symlinkRoot, 'vault');
  const symlinkSource = path.join(symlinkVault, 'L1_原文', 'WeChat', '链接原文.md');
  const symlinkManifest = path.join(symlinkRoot, 'manifest.json');
  const symlinkUrl = 'https://mp.weixin.qq.com/s/symlink-pack';
  const externalInbox = path.join(symlinkRoot, 'external-inbox');
  fs.mkdirSync(path.dirname(symlinkSource), { recursive: true });
  fs.mkdirSync(externalInbox);
  fs.symlinkSync(externalInbox, path.join(symlinkVault, 'Inbox'));
  fs.writeFileSync(symlinkSource, [
    '---',
    'title: 链接原文',
    `sourceUrl: ${symlinkUrl}`,
    '---',
    '',
    '符号链接不能把事务写出知识库。',
    '',
  ].join('\n'));
  fs.writeFileSync(symlinkManifest, JSON.stringify({
    schemaVersion: 1,
    sourceFile: symlinkSource,
    sourceUrl: symlinkUrl,
    processingGoal: null,
    atomicNotes: [],
    materials: [],
    reviewQuestions: [],
  }, null, 2));
  const symlinkSourceBefore = fs.readFileSync(symlinkSource, 'utf8');

  await assert.rejects(
    createPackCommand({
      sourceFile: symlinkSource,
      manifestFile: symlinkManifest,
      json: true,
    }),
    (error) => error.code === 'TRANSACTION_FAILED' && /符号链接/.test(error.message)
  );
  assert.deepStrictEqual(fs.readdirSync(externalInbox), []);
  assert.strictEqual(fs.readFileSync(symlinkSource, 'utf8'), symlinkSourceBefore);

  const targetLinkRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'wechat-notebank-pack-target-link-'));
  const targetLinkVault = path.join(targetLinkRoot, 'vault');
  const targetLinkExternal = path.join(targetLinkRoot, 'external.md');
  const targetLink = path.join(targetLinkVault, 'existing.md');
  fs.mkdirSync(targetLinkVault, { recursive: true });
  fs.writeFileSync(targetLinkExternal, '外部文件不能被跟随写入。\n');
  fs.symlinkSync(targetLinkExternal, targetLink);
  await assert.rejects(
    commitFileTransaction(targetLinkVault, [{ target: targetLink, content: '新内容\n' }]),
    /符号链接/
  );
  assert.strictEqual(fs.readFileSync(targetLinkExternal, 'utf8'), '外部文件不能被跟随写入。\n');
  assert.strictEqual(fs.readlinkSync(targetLink), targetLinkExternal);
  const danglingLink = path.join(targetLinkVault, 'dangling.md');
  const danglingDestination = path.join(targetLinkRoot, 'missing.md');
  fs.symlinkSync(danglingDestination, danglingLink);
  await assert.rejects(
    commitFileTransaction(targetLinkVault, [{ target: danglingLink, content: '不能替换悬空链接\n' }]),
    /符号链接/
  );
  assert.strictEqual(fs.readlinkSync(danglingLink), danglingDestination);

  console.log('pack transaction tests passed');
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
