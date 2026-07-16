const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { createPackCommand } = require('../dist/commands/pack');
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
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'wechat-notebank-approve-tx-'));
  const vault = path.join(root, 'vault');
  const sourceFile = path.join(vault, 'L1_原文', 'WeChat', '审批事务原文.md');
  const manifestFile = path.join(root, 'manifest.json');
  const sourceUrl = 'https://mp.weixin.qq.com/s/pack-approve-transaction';
  fs.mkdirSync(path.dirname(sourceFile), { recursive: true });
  fs.writeFileSync(sourceFile, [
    '---',
    'title: 审批事务原文',
    `sourceUrl: ${sourceUrl}`,
    '---',
    '',
    '审批事务中的原文引用。',
    '',
  ].join('\n'));
  fs.writeFileSync(manifestFile, JSON.stringify({
    schemaVersion: 1,
    sourceFile,
    sourceUrl,
    processingGoal: null,
    atomicNotes: [{
      id: 'L2-01',
      title: '事务观点',
      claim: '审批发布必须原子完成。',
      evidence: '审批事务中的原文引用。',
      boundary: '适用于本地知识库写入。',
      useCases: ['事务测试'],
    }],
    materials: [{
      id: 'L3-01',
      kind: 'quote',
      title: '事务引用',
      content: '审批事务中的原文引用。',
      sourceSection: '正文',
    }],
    reviewQuestions: [],
  }, null, 2));

  const created = await createPackCommand({ sourceFile, manifestFile, json: true });
  const before = snapshot(vault);

  for (let failureIndex = 0; failureIndex < 7; failureIndex++) {
    await assert.rejects(
      approvePackCommand({
        packFile: created.packFile,
        items: ['L2-01', 'L3-01'],
        json: true,
      }, {
        beforeApply(index) {
          if (index === failureIndex) {
            throw new Error(`injected approve failure ${failureIndex}`);
          }
        },
      }),
      (error) => error.code === 'TRANSACTION_FAILED' &&
        error.message.includes(`injected approve failure ${failureIndex}`)
    );
    assert.deepStrictEqual(
      snapshot(vault),
      before,
      `approval failure at write ${failureIndex} should restore the vault`
    );
  }

  for (let failureIndex = 0; failureIndex < 7; failureIndex++) {
    await assert.rejects(
      approvePackCommand({
        packFile: created.packFile,
        items: ['L2-01', 'L3-01'],
        json: true,
      }, {
        afterBackup(index) {
          if (index === failureIndex) {
            throw new Error(`injected approve backup failure ${failureIndex}`);
          }
        },
      }),
      (error) => error.code === 'TRANSACTION_FAILED' &&
        error.message.includes(`injected approve backup failure ${failureIndex}`)
    );
    assert.deepStrictEqual(
      snapshot(vault),
      before,
      `approval failure after backup ${failureIndex} should restore the vault`
    );
  }

  await approvePackCommand({
    packFile: created.packFile,
    items: ['L2-01', 'L3-01'],
    json: true,
  });
  const secondManifestFile = path.join(root, 'second-manifest.json');
  fs.writeFileSync(secondManifestFile, JSON.stringify({
    schemaVersion: 1,
    sourceFile,
    sourceUrl,
    processingGoal: '第二个加工目标',
    atomicNotes: [],
    materials: [{
      id: 'L3-01',
      kind: 'paraphrase',
      title: '第二份事务素材',
      content: '共享素材包更新也必须原子完成。',
      sourceSection: '正文',
    }],
    reviewQuestions: [],
  }, null, 2));
  const second = await createPackCommand({
    sourceFile,
    manifestFile: secondManifestFile,
    json: true,
  });
  const beforeSharedUpdate = snapshot(vault);
  const sharedL3File = JSON.parse(fs.readFileSync(created.stateFile, 'utf8'))
    .outputs.find((output) => output.kind === 'L3').file;
  const sharedL3BeforeRace = fs.readFileSync(sharedL3File, 'utf8');
  await assert.rejects(
    approvePackCommand({
      packFile: second.packFile,
      items: ['L3-01'],
      json: true,
    }, {
      beforeApply(index) {
        if (index === 0) {
          fs.writeFileSync(sharedL3File, `${sharedL3BeforeRace}\n用户并发修改。\n`);
        }
      },
    }),
    (error) => error.code === 'DERIVED_FILE_MODIFIED'
  );
  assert.strictEqual(
    fs.readFileSync(sharedL3File, 'utf8'),
    `${sharedL3BeforeRace}\n用户并发修改。\n`
  );
  fs.writeFileSync(sharedL3File, sharedL3BeforeRace);
  assert.deepStrictEqual(snapshot(vault), beforeSharedUpdate);

  for (let failureIndex = 0; failureIndex < 6; failureIndex++) {
    await assert.rejects(
      approvePackCommand({
        packFile: second.packFile,
        items: ['L3-01'],
        json: true,
      }, {
        beforeApply(index) {
          if (index === failureIndex) {
            throw new Error(`injected shared L3 failure ${failureIndex}`);
          }
        },
      }),
      (error) => error.code === 'TRANSACTION_FAILED' &&
        error.message.includes(`injected shared L3 failure ${failureIndex}`)
    );
    assert.deepStrictEqual(
      snapshot(vault),
      beforeSharedUpdate,
      `shared L3 failure at write ${failureIndex} should restore every pack state`
    );
  }

  for (let failureIndex = 0; failureIndex < 6; failureIndex++) {
    await assert.rejects(
      approvePackCommand({
        packFile: second.packFile,
        items: ['L3-01'],
        json: true,
      }, {
        afterBackup(index) {
          if (index === failureIndex) {
            throw new Error(`injected shared L3 backup failure ${failureIndex}`);
          }
        },
      }),
      (error) => error.code === 'TRANSACTION_FAILED' &&
        error.message.includes(`injected shared L3 backup failure ${failureIndex}`)
    );
    assert.deepStrictEqual(
      snapshot(vault),
      beforeSharedUpdate,
      `shared L3 backup failure at write ${failureIndex} should restore every pack state`
    );
  }

  console.log('pack approve transaction tests passed');
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
