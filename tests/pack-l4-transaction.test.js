const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { createPackCommand } = require('../dist/commands/pack');
const { updatePackCommand } = require('../dist/commands/pack-update');
const { approvePackCommand } = require('../dist/commands/pack-approve');

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
        entries.push(`f:${childRelative}:${stat.mode & 0o777}:${fs.readFileSync(absolute, 'hex')}`);
      }
    }
  }
  visit(root, '');
  return entries;
}

(async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'wechat-notebank-l4-tx-'));
  const vault = path.join(root, 'vault');
  const sourceFile = path.join(vault, 'L1_原文', 'WeChat', 'L4 事务原文.md');
  const initialManifestFile = path.join(root, 'initial-manifest.json');
  const completedManifestFile = path.join(root, 'completed-manifest.json');
  const sourceUrl = 'https://mp.weixin.qq.com/s/l4-transaction';
  fs.mkdirSync(path.dirname(sourceFile), { recursive: true });
  fs.writeFileSync(sourceFile, [
    '---',
    'title: L4 事务原文',
    `sourceUrl: ${sourceUrl}`,
    '---',
    '',
    'L4 的回答、发布与链接必须原子更新。',
    '',
  ].join('\n'));
  const initialManifest = {
    schemaVersion: 1,
    sourceFile,
    sourceUrl,
    processingGoal: null,
    atomicNotes: [],
    materials: [],
    reviewQuestions: [{
      id: 'L4-Q01',
      question: '你将如何验证这个结论？',
    }],
  };
  const completedManifest = {
    ...initialManifest,
    reviewAnswers: {
      'L4-Q01': '我会通过故障注入确认所有文件一起回滚。',
    },
    reviewDraft: '通过每个写入阶段的故障注入，验证 L4 更新与发布的原子性。',
  };
  fs.writeFileSync(initialManifestFile, JSON.stringify(initialManifest, null, 2));
  fs.writeFileSync(completedManifestFile, JSON.stringify(completedManifest, null, 2));

  const created = await createPackCommand({
    sourceFile,
    manifestFile: initialManifestFile,
    json: true,
  });
  const beforeUpdate = snapshot(vault);

  for (let failureIndex = 0; failureIndex < 3; failureIndex++) {
    await assert.rejects(
      updatePackCommand({
        packFile: created.packFile,
        manifestFile: completedManifestFile,
        json: true,
      }, {
        beforeApply(index) {
          if (index === failureIndex) {
            throw new Error(`injected L4 update failure ${failureIndex}`);
          }
        },
      }),
      (error) => error.code === 'TRANSACTION_FAILED' &&
        error.message.includes(`injected L4 update failure ${failureIndex}`)
    );
    assert.deepStrictEqual(
      snapshot(vault),
      beforeUpdate,
      `L4 update failure at write ${failureIndex} should restore the vault`
    );
  }

  for (let failureIndex = 0; failureIndex < 3; failureIndex++) {
    await assert.rejects(
      updatePackCommand({
        packFile: created.packFile,
        manifestFile: completedManifestFile,
        json: true,
      }, {
        afterBackup(index) {
          if (index === failureIndex) {
            throw new Error(`injected L4 update backup failure ${failureIndex}`);
          }
        },
      }),
      (error) => error.code === 'TRANSACTION_FAILED' &&
        error.message.includes(`injected L4 update backup failure ${failureIndex}`)
    );
    assert.deepStrictEqual(
      snapshot(vault),
      beforeUpdate,
      `L4 update backup failure at write ${failureIndex} should restore the vault`
    );
  }

  await updatePackCommand({
    packFile: created.packFile,
    manifestFile: completedManifestFile,
    json: true,
  });
  const beforeApproval = snapshot(vault);

  for (let failureIndex = 0; failureIndex < 6; failureIndex++) {
    await assert.rejects(
      approvePackCommand({
        packFile: created.packFile,
        items: ['L4-Q01'],
        json: true,
      }, {
        beforeApply(index) {
          if (index === failureIndex) {
            throw new Error(`injected L4 approval failure ${failureIndex}`);
          }
        },
      }),
      (error) => error.code === 'TRANSACTION_FAILED' &&
        error.message.includes(`injected L4 approval failure ${failureIndex}`)
    );
    assert.deepStrictEqual(
      snapshot(vault),
      beforeApproval,
      `L4 approval failure at write ${failureIndex} should restore the vault`
    );
  }

  for (let failureIndex = 0; failureIndex < 6; failureIndex++) {
    await assert.rejects(
      approvePackCommand({
        packFile: created.packFile,
        items: ['L4-Q01'],
        json: true,
      }, {
        afterBackup(index) {
          if (index === failureIndex) {
            throw new Error(`injected L4 approval backup failure ${failureIndex}`);
          }
        },
      }),
      (error) => error.code === 'TRANSACTION_FAILED' &&
        error.message.includes(`injected L4 approval backup failure ${failureIndex}`)
    );
    assert.deepStrictEqual(
      snapshot(vault),
      beforeApproval,
      `L4 approval backup failure at write ${failureIndex} should restore the vault`
    );
  }

  let concurrentL4File;
  const manualContent = '用户并发创建的 L4，必须保留。\n';
  await assert.rejects(
    approvePackCommand({
      packFile: created.packFile,
      items: ['L4-Q01'],
      json: true,
    }, {
      beforeApply(index, target) {
        if (index === 0) {
          concurrentL4File = target;
          fs.mkdirSync(path.dirname(target), { recursive: true });
          fs.writeFileSync(target, manualContent);
        }
      },
    }),
    (error) => error.code === 'DERIVED_FILE_MODIFIED'
  );
  assert.strictEqual(fs.readFileSync(concurrentL4File, 'utf8'), manualContent);
  fs.rmSync(concurrentL4File);
  fs.rmdirSync(path.dirname(concurrentL4File));
  assert.deepStrictEqual(snapshot(vault), beforeApproval);

  console.log('pack L4 transaction tests passed');
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
