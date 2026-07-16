const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { createPackCommand } = require('../dist/commands/pack');
const { approvePackCommand } = require('../dist/commands/pack-approve');
const { rejectPackCommand } = require('../dist/commands/pack-reject');
const { revokePackCommand } = require('../dist/commands/pack-revoke');
const {
  commitFileTransaction,
  FileTransactionPreconditionError,
} = require('../dist/lib/file-transaction');

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
        entries.push(`f:${childRelative}:${fs.readFileSync(absolute, 'hex')}`);
      }
    }
  }
  visit(root, '');
  return entries;
}

async function fixture(name, published) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), `wechat-notebank-${name}-`));
  const vault = path.join(root, 'vault');
  const sourceFile = path.join(vault, 'L1_原文', 'WeChat', `${name}.md`);
  const manifestFile = path.join(root, 'manifest.json');
  const sourceUrl = `https://mp.weixin.qq.com/s/${name}`;
  fs.mkdirSync(path.dirname(sourceFile), { recursive: true });
  fs.writeFileSync(sourceFile, [
    '---',
    `title: ${name}`,
    `sourceUrl: ${sourceUrl}`,
    '---',
    '',
    '事务回滚原文。',
    '',
  ].join('\n'));
  fs.writeFileSync(manifestFile, JSON.stringify({
    schemaVersion: 1,
    sourceFile,
    sourceUrl,
    processingGoal: null,
    atomicNotes: [{
      id: 'L2-01',
      title: '事务卡片',
      claim: '任何阶段失败都必须完整恢复。',
      evidence: '事务回滚原文。',
      boundary: '用于事务测试。',
      useCases: ['回滚'],
    }],
    materials: [],
    reviewQuestions: [],
  }, null, 2));
  const pack = await createPackCommand({ sourceFile, manifestFile, json: true });
  if (published) {
    await approvePackCommand({
      packFile: pack.packFile,
      items: ['L2-01'],
      json: true,
    });
  }
  return { root, vault, pack };
}

async function sharedL3Fixture(name) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), `wechat-notebank-${name}-`));
  const vault = path.join(root, 'vault');
  const sourceFile = path.join(vault, 'L1_原文', 'WeChat', `${name}.md`);
  const manifestFile = path.join(root, 'manifest.json');
  const sourceUrl = `https://mp.weixin.qq.com/s/${name}`;
  fs.mkdirSync(path.dirname(sourceFile), { recursive: true });
  fs.writeFileSync(sourceFile, [
    '---',
    `title: ${name}`,
    `sourceUrl: ${sourceUrl}`,
    '---',
    '',
    '共享聚合撤销也必须完整回滚。',
    '',
  ].join('\n'));
  fs.writeFileSync(manifestFile, JSON.stringify({
    schemaVersion: 1,
    sourceFile,
    sourceUrl,
    processingGoal: '事务测试',
    atomicNotes: [],
    materials: [{
      id: 'L3-01',
      kind: 'paraphrase',
      title: '共享事务素材',
      content: '共享聚合撤销也必须完整回滚。',
      sourceSection: '正文',
    }],
    reviewQuestions: [],
  }, null, 2));
  const pack = await createPackCommand({ sourceFile, manifestFile, json: true });
  await approvePackCommand({
    packFile: pack.packFile,
    items: ['L3-01'],
    json: true,
  });
  return { root, vault, pack };
}

(async () => {
  for (const phase of ['beforeApply', 'afterBackup']) {
    for (const index of [0, 1, 2]) {
      const current = await fixture(`reject-tx-${phase}-${index}`, false);
      const before = snapshot(current.vault);
      await assert.rejects(
        rejectPackCommand({ packFile: current.pack.packFile, json: true }, {
          [phase](currentIndex) {
            if (currentIndex === index) {
              throw new Error(`reject ${phase} ${index}`);
            }
          },
        }),
        (error) => error.code === 'TRANSACTION_FAILED' &&
          error.message.includes(`reject ${phase} ${index}`)
      );
      assert.deepStrictEqual(snapshot(current.vault), before);
    }
  }

  for (const phase of ['beforeApply', 'afterBackup']) {
    for (const index of [0, 1, 2, 3, 4]) {
      const current = await fixture(`revoke-tx-${phase}-${index}`, true);
      const before = snapshot(current.vault);
      await assert.rejects(
        revokePackCommand({
          packFile: current.pack.packFile,
          items: ['L2-01'],
          json: true,
        }, {
          [phase](currentIndex) {
            if (currentIndex === index) {
              throw new Error(`revoke ${phase} ${index}`);
            }
          },
        }),
        (error) => error.code === 'TRANSACTION_FAILED' &&
          error.message.includes(`revoke ${phase} ${index}`)
      );
      assert.deepStrictEqual(snapshot(current.vault), before);
    }
  }

  const shared = await sharedL3Fixture('revoke-shared-l3-tx');
  const sharedBefore = snapshot(shared.vault);
  await assert.rejects(
    revokePackCommand({
      packFile: shared.pack.packFile,
      items: ['L3-01'],
      json: true,
    }, {
      afterBackup(index) {
        if (index === 1) {
          throw new Error('shared L3 state failure');
        }
      },
    }),
    (error) => error.code === 'TRANSACTION_FAILED' &&
      error.message.includes('shared L3 state failure')
  );
  assert.deepStrictEqual(
    snapshot(shared.vault),
    sharedBefore,
    '共享文件已删除、共享状态备份后失败时必须整库回滚'
  );

  const concurrent = await fixture('revoke-concurrent-edit', true);
  const state = JSON.parse(fs.readFileSync(concurrent.pack.stateFile, 'utf8'));
  const generated = state.outputs[0].file;
  const humanEdit = `${fs.readFileSync(generated, 'utf8')}\n人工并发编辑。\n`;
  const unchanged = new Map(
    [
      concurrent.pack.packFile,
      concurrent.pack.stateFile,
      path.join(path.dirname(concurrent.pack.stateFile), 'revisions', '1.json'),
      state.manifest.sourceFile,
    ].map((file) => [file, fs.readFileSync(file, 'utf8')])
  );
  await assert.rejects(
    revokePackCommand({
      packFile: concurrent.pack.packFile,
      items: ['L2-01'],
      json: true,
    }, {
      beforeApply(index) {
        if (index === 0) {
          fs.writeFileSync(generated, humanEdit);
        }
      },
    }),
    (error) => error.code === 'DERIVED_FILE_MODIFIED'
  );
  assert.strictEqual(fs.readFileSync(generated, 'utf8'), humanEdit);
  for (const [file, content] of unchanged) {
    assert.strictEqual(fs.readFileSync(file, 'utf8'), content);
  }

  const swapRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'wechat-notebank-parent-swap-'));
  const swapVault = path.join(swapRoot, 'vault');
  const generatedDirectory = path.join(swapVault, 'L2_原子卡片');
  const movedDirectory = path.join(swapVault, 'L2_原子卡片-original');
  const outsideDirectory = path.join(swapRoot, 'outside');
  const target = path.join(generatedDirectory, 'card.md');
  const outsideTarget = path.join(outsideDirectory, 'card.md');
  fs.mkdirSync(generatedDirectory, { recursive: true });
  fs.mkdirSync(outsideDirectory, { recursive: true });
  fs.writeFileSync(target, '相同内容\n');
  fs.writeFileSync(outsideTarget, '相同内容\n');
  await assert.rejects(
    commitFileTransaction(swapVault, [{
      target,
      delete: true,
      expectedContent: '相同内容\n',
    }], {
      beforeApply(index) {
        if (index === 0) {
          fs.renameSync(generatedDirectory, movedDirectory);
          fs.symlinkSync(outsideDirectory, generatedDirectory, 'dir');
        }
      },
    }),
    (error) => error instanceof FileTransactionPreconditionError
  );
  assert.strictEqual(
    fs.readFileSync(outsideTarget, 'utf8'),
    '相同内容\n',
    '父目录被替换时不得删除知识库外文件'
  );
  assert.strictEqual(fs.readFileSync(path.join(movedDirectory, 'card.md'), 'utf8'), '相同内容\n');

  console.log('pack reject/revoke transaction tests passed');
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
