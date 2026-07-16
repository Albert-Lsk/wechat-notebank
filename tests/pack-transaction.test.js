const assert = require('assert');
const crypto = require('crypto');
const fs = require('fs');
const fsExtra = require('fs-extra');
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

  const preconditionTarget = path.join(targetLinkVault, 'precondition.md');
  fs.writeFileSync(preconditionTarget, '用户在命令读取后写入的内容。\n');
  await assert.rejects(
    commitFileTransaction(targetLinkVault, [{
      target: preconditionTarget,
      content: '命令准备写入的内容。\n',
      expectedContent: '命令此前读到的旧内容。\n',
    }]),
    (error) => error.code === 'TRANSACTION_TARGET_CONFLICT' &&
      /命令读取时的内容不一致/.test(error.message)
  );
  assert.strictEqual(
    fs.readFileSync(preconditionTarget, 'utf8'),
    '用户在命令读取后写入的内容。\n'
  );

  const replacementRaceTarget = path.join(targetLinkVault, 'replacement-race.md');
  fs.writeFileSync(replacementRaceTarget, '命令读取到的内容。\n');
  await assert.rejects(
    commitFileTransaction(targetLinkVault, [{
      target: replacementRaceTarget,
      content: '命令准备写入的内容。\n',
      expectedContent: '命令读取到的内容。\n',
    }], {
      beforeApply() {
        fs.writeFileSync(replacementRaceTarget, '用户在替换前刚写入的内容。\n');
      },
    }),
    (error) => error.code === 'TRANSACTION_TARGET_CONFLICT' &&
      /替换前发生变化/.test(error.message)
  );
  assert.strictEqual(
    fs.readFileSync(replacementRaceTarget, 'utf8'),
    '用户在替换前刚写入的内容。\n'
  );

  const rollbackRaceA = path.join(targetLinkVault, 'rollback-race-a.md');
  const rollbackRaceB = path.join(targetLinkVault, 'rollback-race-b.md');
  fs.writeFileSync(rollbackRaceA, 'A 原始内容。\n');
  fs.writeFileSync(rollbackRaceB, 'B 原始内容。\n');
  await assert.rejects(
    commitFileTransaction(targetLinkVault, [
      { target: rollbackRaceA, content: 'A 事务内容。\n' },
      { target: rollbackRaceB, content: 'B 事务内容。\n' },
    ], {
      beforeApply(index) {
        if (index === 1) {
          fs.writeFileSync(rollbackRaceA, 'A 用户并发修改。\n');
          throw new Error('后续写入失败');
        }
      },
    }),
    (error) => /自动恢复失败/.test(error.message) && /冲突副本保留/.test(error.message)
  );
  assert.strictEqual(fs.readFileSync(rollbackRaceA, 'utf8'), 'A 原始内容。\n');
  assert.strictEqual(fs.readFileSync(rollbackRaceB, 'utf8'), 'B 原始内容。\n');
  const transactionRoot = path.join(targetLinkVault, '.alskai-notebank', 'transactions');
  const retainedTransactions = fs.readdirSync(transactionRoot);
  assert.strictEqual(retainedTransactions.length, 1);
  const conflictFile = path.join(
    transactionRoot,
    retainedTransactions[0],
    'conflicts',
    '0'
  );
  assert.strictEqual(fs.readFileSync(conflictFile, 'utf8'), 'A 用户并发修改。\n');
  await commitFileTransaction(targetLinkVault, []);
  assert.strictEqual(
    fs.readFileSync(conflictFile, 'utf8'),
    'A 用户并发修改。\n',
    'subsequent recovery must retain conflict evidence from a conflicted transaction'
  );

  const finalCheckA = path.join(targetLinkVault, 'final-check-a.md');
  const finalCheckB = path.join(targetLinkVault, 'final-check-b.md');
  fs.writeFileSync(finalCheckA, 'A 最终校验前内容。\n');
  fs.writeFileSync(finalCheckB, 'B 最终校验前内容。\n');
  const retainedBeforeFinalCheck = new Set(fs.readdirSync(transactionRoot));
  await assert.rejects(
    commitFileTransaction(targetLinkVault, [
      { target: finalCheckA, content: 'A 最终事务内容。\n' },
      { target: finalCheckB, content: 'B 最终事务内容。\n' },
    ], {
      beforeApply(index) {
        if (index === 1) {
          fs.writeFileSync(finalCheckA, 'A 在后续写入期间被用户修改。\n');
        }
      },
    }),
    (error) => /自动恢复失败/.test(error.message) && /冲突副本保留/.test(error.message)
  );
  assert.strictEqual(fs.readFileSync(finalCheckA, 'utf8'), 'A 最终校验前内容。\n');
  assert.strictEqual(fs.readFileSync(finalCheckB, 'utf8'), 'B 最终校验前内容。\n');
  const retainedAfterFinalCheck = fs.readdirSync(transactionRoot);
  const finalCheckTransaction = retainedAfterFinalCheck.find(
    (entry) => !retainedBeforeFinalCheck.has(entry)
  );
  assert.ok(finalCheckTransaction);
  assert.strictEqual(
    fs.readFileSync(
      path.join(transactionRoot, finalCheckTransaction, 'conflicts', '0'),
      'utf8'
    ),
    'A 在后续写入期间被用户修改。\n'
  );

  const rollbackWindowA = path.join(targetLinkVault, 'rollback-window-a.md');
  const rollbackWindowB = path.join(targetLinkVault, 'rollback-window-b.md');
  fs.writeFileSync(rollbackWindowA, 'A 回滚窗口原始内容。\n');
  fs.writeFileSync(rollbackWindowB, 'B 回滚窗口原始内容。\n');
  const retainedBeforeRollbackWindow = new Set(fs.readdirSync(transactionRoot));
  const originalReadFile = fsExtra.readFile;
  let injectedRollbackWindowEdit = false;
  fsExtra.readFile = async function patchedReadFile(file, ...args) {
    const result = await originalReadFile.call(this, file, ...args);
    if (
      !injectedRollbackWindowEdit &&
      String(file).includes(`${path.sep}rollback${path.sep}0`)
    ) {
      injectedRollbackWindowEdit = true;
      fs.writeFileSync(rollbackWindowA, 'A 在回滚比较后被用户修改。\n');
    }
    return result;
  };
  try {
    await assert.rejects(
      commitFileTransaction(targetLinkVault, [
        { target: rollbackWindowA, content: 'A 回滚窗口事务内容。\n' },
        { target: rollbackWindowB, content: 'B 回滚窗口事务内容。\n' },
      ], {
        beforeApply(index) {
          if (index === 1) {
            throw new Error('触发回滚窗口');
          }
        },
      }),
      (error) => /自动恢复失败/.test(error.message) && /冲突副本保留/.test(error.message)
    );
  } finally {
    fsExtra.readFile = originalReadFile;
  }
  assert.strictEqual(injectedRollbackWindowEdit, true);
  assert.strictEqual(fs.readFileSync(rollbackWindowA, 'utf8'), 'A 回滚窗口原始内容。\n');
  assert.strictEqual(fs.readFileSync(rollbackWindowB, 'utf8'), 'B 回滚窗口原始内容。\n');
  const rollbackWindowTransaction = fs.readdirSync(transactionRoot).find(
    (entry) => !retainedBeforeRollbackWindow.has(entry)
  );
  assert.ok(rollbackWindowTransaction);
  assert.strictEqual(
    fs.readFileSync(
      path.join(transactionRoot, rollbackWindowTransaction, 'conflicts', '0-late'),
      'utf8'
    ),
    'A 在回滚比较后被用户修改。\n'
  );

  const atomicInstallTarget = path.join(targetLinkVault, 'atomic-install.md');
  fs.writeFileSync(atomicInstallTarget, '原子安装前的内容。\n');
  const retainedBeforeAtomicInstall = new Set(fs.readdirSync(transactionRoot));
  const originalLink = fsExtra.link;
  let injectedAtomicInstallEdit = false;
  fsExtra.link = async function patchedLink(source, target, ...args) {
    if (
      !injectedAtomicInstallEdit &&
      String(source).includes(`${path.sep}staged${path.sep}0`)
    ) {
      injectedAtomicInstallEdit = true;
      fs.writeFileSync(target, '原子安装瞬间的用户内容。\n');
    }
    return originalLink.call(this, source, target, ...args);
  };
  try {
    await assert.rejects(
      commitFileTransaction(targetLinkVault, [{
        target: atomicInstallTarget,
        content: '事务准备安装的内容。\n',
      }]),
      (error) => /自动恢复失败/.test(error.message) && /冲突副本保留/.test(error.message)
    );
  } finally {
    fsExtra.link = originalLink;
  }
  assert.strictEqual(injectedAtomicInstallEdit, true);
  assert.strictEqual(fs.readFileSync(atomicInstallTarget, 'utf8'), '原子安装前的内容。\n');
  const atomicInstallTransaction = fs.readdirSync(transactionRoot).find(
    (entry) => !retainedBeforeAtomicInstall.has(entry)
  );
  assert.ok(atomicInstallTransaction);
  assert.strictEqual(
    fs.readFileSync(
      path.join(transactionRoot, atomicInstallTransaction, 'conflicts', '0-late'),
      'utf8'
    ),
    '原子安装瞬间的用户内容。\n'
  );

  const atomicRestoreA = path.join(targetLinkVault, 'atomic-restore-a.md');
  const atomicRestoreB = path.join(targetLinkVault, 'atomic-restore-b.md');
  fs.writeFileSync(atomicRestoreA, 'A 原子恢复前内容。\n');
  fs.writeFileSync(atomicRestoreB, 'B 原子恢复前内容。\n');
  const retainedBeforeAtomicRestore = new Set(fs.readdirSync(transactionRoot));
  let injectedAtomicRestoreEdit = false;
  fsExtra.link = async function patchedRestoreLink(source, target, ...args) {
    if (
      !injectedAtomicRestoreEdit &&
      String(source).includes(`${path.sep}backup${path.sep}0`)
    ) {
      injectedAtomicRestoreEdit = true;
      fs.writeFileSync(target, 'A 原子恢复瞬间的用户内容。\n');
    }
    return originalLink.call(this, source, target, ...args);
  };
  try {
    await assert.rejects(
      commitFileTransaction(targetLinkVault, [
        { target: atomicRestoreA, content: 'A 原子恢复事务内容。\n' },
        { target: atomicRestoreB, content: 'B 原子恢复事务内容。\n' },
      ], {
        beforeApply(index) {
          if (index === 1) {
            throw new Error('触发原子恢复');
          }
        },
      }),
      (error) => /自动恢复失败/.test(error.message) && /冲突副本保留/.test(error.message)
    );
  } finally {
    fsExtra.link = originalLink;
  }
  assert.strictEqual(injectedAtomicRestoreEdit, true);
  assert.strictEqual(fs.readFileSync(atomicRestoreA, 'utf8'), 'A 原子恢复前内容。\n');
  assert.strictEqual(fs.readFileSync(atomicRestoreB, 'utf8'), 'B 原子恢复前内容。\n');
  const atomicRestoreTransaction = fs.readdirSync(transactionRoot).find(
    (entry) => !retainedBeforeAtomicRestore.has(entry)
  );
  assert.ok(atomicRestoreTransaction);
  assert.strictEqual(
    fs.readFileSync(
      path.join(transactionRoot, atomicRestoreTransaction, 'conflicts', '0-restore'),
      'utf8'
    ),
    'A 原子恢复瞬间的用户内容。\n'
  );

  console.log('pack transaction tests passed');
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
