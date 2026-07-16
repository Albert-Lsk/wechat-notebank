const assert = require('assert');
const fs = require('fs');
const fse = require('fs-extra');
const os = require('os');
const path = require('path');
const { spawn, spawnSync } = require('child_process');
const { commitFileTransaction } = require('../dist/lib/file-transaction');
const { createPackCommand } = require('../dist/commands/pack');
const { approvePackCommand } = require('../dist/commands/pack-approve');
const { revokePackCommand } = require('../dist/commands/pack-revoke');

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function observe(child) {
  let stdout = '';
  let stderr = '';
  child.stdout?.on('data', (chunk) => { stdout += chunk; });
  child.stderr?.on('data', (chunk) => { stderr += chunk; });
  return new Promise((resolve, reject) => {
    child.once('error', reject);
    child.once('exit', (code, signal) => resolve({ code, signal, stdout, stderr }));
  });
}

async function waitForMarker(marker, child, timeoutMs = 5000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (fs.existsSync(marker)) return;
    if (child.exitCode !== null || child.signalCode !== null) {
      throw new Error(`child exited before marker: ${child.exitCode}/${child.signalCode}`);
    }
    await delay(10);
  }
  throw new Error(`timed out waiting for ${marker}`);
}

(async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'wechat-notebank-tx-recovery-'));
  const vault = path.join(root, 'vault');
  const target = path.join(vault, 'L2_原子卡片', '待恢复.md');
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, '进程终止后必须恢复。\n');

  const transactionModule = path.join(
    path.resolve(__dirname, '..'),
    'dist',
    'lib',
    'file-transaction.js'
  );
  const script = [
    `const { commitFileTransaction } = require(${JSON.stringify(transactionModule)});`,
    `commitFileTransaction(${JSON.stringify(vault)}, [{`,
    `target: ${JSON.stringify(target)},`,
    "delete: true, expectedContent: '进程终止后必须恢复。\\n'",
    '}], { afterBackup() { process.kill(process.pid, \'SIGKILL\'); } });',
  ].join('\n');
  const killed = spawnSync(process.execPath, ['-e', script], { encoding: 'utf8' });
  assert.strictEqual(killed.signal, 'SIGKILL', killed.stderr || killed.stdout);
  assert.strictEqual(fs.existsSync(target), false, 'fixture must stop after moving the backup');

  await commitFileTransaction(vault, []);

  assert.strictEqual(fs.readFileSync(target, 'utf8'), '进程终止后必须恢复。\n');
  const transactionsRoot = path.join(vault, '.alskai-notebank', 'transactions');
  if (fs.existsSync(transactionsRoot)) {
    assert.deepStrictEqual(fs.readdirSync(transactionsRoot), []);
  }

  const retryVault = path.join(root, 'retry-vault');
  const sourceFile = path.join(retryVault, 'L1_原文', 'WeChat', '命令重试恢复.md');
  const manifestFile = path.join(root, 'retry-manifest.json');
  const sourceUrl = 'https://mp.weixin.qq.com/s/retry-interrupted-revoke';
  fs.mkdirSync(path.dirname(sourceFile), { recursive: true });
  fs.writeFileSync(sourceFile, [
    '---',
    'title: 命令重试恢复',
    `sourceUrl: ${sourceUrl}`,
    '---',
    '',
    '命令必须先恢复中断事务再读取状态。',
    '',
  ].join('\n'));
  fs.writeFileSync(manifestFile, JSON.stringify({
    schemaVersion: 1,
    sourceFile,
    sourceUrl,
    processingGoal: null,
    atomicNotes: [{
      id: 'L2-01',
      title: '重试恢复',
      claim: '重试必须先恢复。',
      evidence: '命令必须先恢复中断事务再读取状态。',
      boundary: '用于中断恢复测试。',
      useCases: ['事务恢复'],
    }],
    materials: [],
    reviewQuestions: [],
  }, null, 2));
  const pack = await createPackCommand({ sourceFile, manifestFile, json: true });
  await approvePackCommand({
    packFile: pack.packFile,
    items: ['L2-01'],
    json: true,
  });
  const revokeModule = path.join(
    path.resolve(__dirname, '..'),
    'dist',
    'commands',
    'pack-revoke.js'
  );
  const interruptedRevoke = [
    `const { revokePackCommand } = require(${JSON.stringify(revokeModule)});`,
    'revokePackCommand({',
    `packFile: ${JSON.stringify(pack.packFile)},`,
    "items: ['L2-01'], json: true",
    '}, { afterBackup(index) {',
    "if (index === 4) process.kill(process.pid, 'SIGKILL');",
    '} });',
  ].join('\n');
  const killedRevoke = spawnSync(process.execPath, ['-e', interruptedRevoke], {
    encoding: 'utf8',
  });
  assert.strictEqual(
    killedRevoke.signal,
    'SIGKILL',
    killedRevoke.stderr || killedRevoke.stdout
  );

  const retried = await revokePackCommand({
    packFile: pack.packFile,
    items: ['L2-01'],
    json: true,
  });
  assert.strictEqual(
    retried.action,
    'revoke',
    '同一 pack 命令重试必须先回滚 prepared 事务，不能直接返回 reuse'
  );
  assert.strictEqual(retried.status, 'revoked');
  assert.deepStrictEqual(retried.approvedItems, []);

  const moveWindowRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'tx-move-window-'));
  const moveWindowVault = path.join(moveWindowRoot, 'vault');
  const moveWindowParent = path.join(moveWindowVault, 'L2_原子卡片');
  const savedParent = path.join(moveWindowVault, 'L2_原子卡片-original');
  const outside = path.join(moveWindowRoot, 'outside');
  const moveWindowTarget = path.join(moveWindowParent, 'card.md');
  const outsideTarget = path.join(outside, 'card.md');
  fs.mkdirSync(moveWindowParent, { recursive: true });
  fs.mkdirSync(outside, { recursive: true });
  fs.writeFileSync(moveWindowTarget, 'vault original\n');
  fs.writeFileSync(outsideTarget, 'outside must survive\n');
  const realMove = fse.move;
  let swapped = false;
  fse.move = async function patchedMove(source, destination, ...rest) {
    if (!swapped && path.resolve(source) === path.resolve(moveWindowTarget)) {
      swapped = true;
      fs.renameSync(moveWindowParent, savedParent);
      fs.symlinkSync(outside, moveWindowParent, 'dir');
    }
    return realMove.call(this, source, destination, ...rest);
  };
  let moveWindowError;
  try {
    await commitFileTransaction(moveWindowVault, [{
      target: moveWindowTarget,
      delete: true,
      expectedContent: 'vault original\n',
    }]);
  } catch (error) {
    moveWindowError = error;
  } finally {
    fse.move = realMove;
  }
  assert.ok(swapped, 'fixture must replace the parent inside fs.move window');
  assert.ok(moveWindowError, 'transaction must reject the parent swap');
  assert.strictEqual(fs.readFileSync(outsideTarget, 'utf8'), 'outside must survive\n');
  assert.strictEqual(
    fs.readFileSync(path.join(savedParent, 'card.md'), 'utf8'),
    'vault original\n'
  );

  const missingParentRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'tx-missing-parent-'));
  const missingParentVault = path.join(missingParentRoot, 'vault');
  const missingParent = path.join(missingParentVault, 'L2_原子卡片');
  const missingOutside = path.join(missingParentRoot, 'outside');
  const missingTarget = path.join(missingParent, 'new.md');
  const missingOutsideTarget = path.join(missingOutside, 'new.md');
  fs.mkdirSync(missingParentVault, { recursive: true });
  fs.mkdirSync(missingOutside, { recursive: true });
  await assert.rejects(commitFileTransaction(missingParentVault, [{
    target: missingTarget,
    content: 'must stay inside vault\n',
    expectAbsent: true,
  }], {
    afterBackup() {
      fs.rmSync(missingParent, { recursive: true });
      fs.symlinkSync(missingOutside, missingParent, 'dir');
    },
  }));
  assert.strictEqual(fs.existsSync(missingOutsideTarget), false);

  const activeRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'tx-owner-tz-'));
  const activeVault = path.join(activeRoot, 'vault');
  const activeTarget = path.join(activeVault, 'L2_原子卡片', 'active.md');
  const paused = path.join(activeRoot, 'a-paused');
  const resume = path.join(activeRoot, 'a-resume');
  fs.mkdirSync(path.dirname(activeTarget), { recursive: true });
  fs.writeFileSync(activeTarget, 'active transaction original\n');
  const activeScript = `
    const fs = require('fs');
    const { commitFileTransaction } = require(${JSON.stringify(transactionModule)});
    commitFileTransaction(${JSON.stringify(activeVault)}, [{
      target: ${JSON.stringify(activeTarget)},
      delete: true,
      expectedContent: 'active transaction original\\n'
    }], {
      async afterBackup() {
        fs.writeFileSync(${JSON.stringify(paused)}, 'paused');
        while (!fs.existsSync(${JSON.stringify(resume)})) {
          await new Promise((resolve) => setTimeout(resolve, 10));
        }
      }
    }).then(() => process.exit(0)).catch((error) => {
      console.error(error);
      process.exit(41);
    });
  `;
  const activeChild = spawn(process.execPath, ['-e', activeScript], {
    env: { ...process.env, TZ: 'UTC' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const activeOutcomePromise = observe(activeChild);
  await waitForMarker(paused, activeChild);
  const recoveryScript = `
    const { commitFileTransaction } = require(${JSON.stringify(transactionModule)});
    commitFileTransaction(${JSON.stringify(activeVault)}, []).catch((error) => {
      console.error(error);
      process.exitCode = 42;
    });
  `;
  let recoveryAttempt;
  let targetExistsDuringActive;
  try {
    recoveryAttempt = spawnSync(process.execPath, ['-e', recoveryScript], {
      env: { ...process.env, TZ: 'Asia/Shanghai' },
      encoding: 'utf8',
    });
    targetExistsDuringActive = fs.existsSync(activeTarget);
  } finally {
    fs.writeFileSync(resume, 'resume');
  }
  const activeOutcome = await activeOutcomePromise;
  assert.strictEqual(recoveryAttempt.status, 0, recoveryAttempt.stderr || recoveryAttempt.stdout);
  assert.strictEqual(targetExistsDuringActive, false);
  assert.strictEqual(activeOutcome.code, 0, activeOutcome.stderr || activeOutcome.stdout);
  assert.strictEqual(fs.existsSync(activeTarget), false);

  const editRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'tx-recovery-edit-'));
  const editVault = path.join(editRoot, 'vault');
  const editTarget = path.join(editVault, 'L2_原子卡片', 'new.md');
  fs.mkdirSync(path.dirname(editTarget), { recursive: true });
  const interruptedWriter = `
    const path = require('path');
    const fse = require('fs-extra');
    const realUnlink = fse.unlink;
    fse.unlink = async function(candidate, ...rest) {
      if (typeof candidate === 'string' &&
          candidate.includes(path.sep + 'staged' + path.sep + '0')) {
        process.kill(process.pid, 'SIGKILL');
      }
      return realUnlink.call(this, candidate, ...rest);
    };
    const { commitFileTransaction } = require(${JSON.stringify(transactionModule)});
    commitFileTransaction(${JSON.stringify(editVault)}, [{
      target: ${JSON.stringify(editTarget)},
      content: 'transaction content\\n',
      expectAbsent: true
    }]);
  `;
  const killedWriter = spawnSync(process.execPath, ['-e', interruptedWriter], {
    encoding: 'utf8',
  });
  assert.strictEqual(killedWriter.signal, 'SIGKILL', killedWriter.stderr || killedWriter.stdout);
  assert.strictEqual(fs.readFileSync(editTarget, 'utf8'), 'transaction content\n');
  const humanContent = 'human concurrent edit\n';
  const realRecoveryMove = fse.move;
  let editInjected = false;
  fse.move = async function patchedRecoveryMove(source, destination, ...rest) {
    if (
      !editInjected &&
      path.resolve(source) === path.resolve(editTarget) &&
      String(destination).includes('recovery-quarantine')
    ) {
      editInjected = true;
      fs.writeFileSync(editTarget, humanContent);
    }
    return realRecoveryMove.call(this, source, destination, ...rest);
  };
  try {
    await commitFileTransaction(editVault, []).catch(() => {});
  } finally {
    fse.move = realRecoveryMove;
  }
  assert.ok(editInjected, 'fixture must edit the target during recovery claim');
  assert.strictEqual(fs.readFileSync(editTarget, 'utf8'), humanContent);
  assert.ok(
    fs.readdirSync(path.join(editVault, '.alskai-notebank', 'transactions'))
      .every((entry) => !entry.startsWith('.recovering-')),
    'a failed recovery must persistently release its active claim'
  );

  const doubleRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'tx-double-recovery-'));
  const doubleVault = path.join(doubleRoot, 'vault');
  const doubleTarget = path.join(doubleVault, 'L2_原子卡片', 'restore.md');
  const recoveryPaused = path.join(doubleRoot, 'b-paused');
  const recoveryResume = path.join(doubleRoot, 'b-resume');
  fs.mkdirSync(path.dirname(doubleTarget), { recursive: true });
  fs.writeFileSync(doubleTarget, 'must be restored once\n');
  const deadTransaction = `
    const { commitFileTransaction } = require(${JSON.stringify(transactionModule)});
    commitFileTransaction(${JSON.stringify(doubleVault)}, [{
      target: ${JSON.stringify(doubleTarget)},
      delete: true,
      expectedContent: 'must be restored once\\n'
    }], { afterBackup() { process.kill(process.pid, 'SIGKILL'); } });
  `;
  const killedDouble = spawnSync(process.execPath, ['-e', deadTransaction], {
    encoding: 'utf8',
  });
  assert.strictEqual(killedDouble.signal, 'SIGKILL', killedDouble.stderr || killedDouble.stdout);
  const pausedRecovery = `
    const fs = require('fs');
    const path = require('path');
    const fse = require('fs-extra');
    const realLink = fse.link;
    let paused = false;
    fse.link = async function(source, destination, ...rest) {
      if (!paused && path.resolve(destination) === path.resolve(${JSON.stringify(doubleTarget)})) {
        paused = true;
        fs.writeFileSync(${JSON.stringify(recoveryPaused)}, 'paused');
        while (!fs.existsSync(${JSON.stringify(recoveryResume)})) {
          await new Promise((resolve) => setTimeout(resolve, 10));
        }
      }
      return realLink.call(this, source, destination, ...rest);
    };
    const { commitFileTransaction } = require(${JSON.stringify(transactionModule)});
    commitFileTransaction(${JSON.stringify(doubleVault)}, []).then(() => process.exit(0)).catch((error) => {
      console.error(error);
      process.exit(51);
    });
  `;
  const recoveryChild = spawn(process.execPath, ['-e', pausedRecovery], {
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const recoveryOutcomePromise = observe(recoveryChild);
  await waitForMarker(recoveryPaused, recoveryChild);
  const secondRecovery = `
    const { commitFileTransaction } = require(${JSON.stringify(transactionModule)});
    commitFileTransaction(${JSON.stringify(doubleVault)}, []).catch((error) => {
      console.error(error);
      process.exitCode = 52;
    });
  `;
  let secondAttempt;
  let doubleTargetDuringRecovery;
  try {
    secondAttempt = spawnSync(process.execPath, ['-e', secondRecovery], { encoding: 'utf8' });
    doubleTargetDuringRecovery = fs.existsSync(doubleTarget);
  } finally {
    fs.writeFileSync(recoveryResume, 'resume');
  }
  const recoveryOutcome = await recoveryOutcomePromise;
  assert.strictEqual(secondAttempt.status, 0, secondAttempt.stderr || secondAttempt.stdout);
  assert.strictEqual(doubleTargetDuringRecovery, false);
  assert.strictEqual(recoveryOutcome.code, 0, recoveryOutcome.stderr || recoveryOutcome.stdout);
  assert.strictEqual(fs.readFileSync(doubleTarget, 'utf8'), 'must be restored once\n');

  const inodeRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'tx-written-inode-'));
  const inodeVault = path.join(inodeRoot, 'vault');
  const inodeTarget = path.join(inodeVault, 'L2_原子卡片', 'same-content.md');
  fs.mkdirSync(path.dirname(inodeTarget), { recursive: true });
  const killedBeforeInstall = `
    const { commitFileTransaction } = require(${JSON.stringify(transactionModule)});
    commitFileTransaction(${JSON.stringify(inodeVault)}, [{
      target: ${JSON.stringify(inodeTarget)},
      content: 'same bytes, different inode\\n',
      expectAbsent: true
    }], { afterBackup() { process.kill(process.pid, 'SIGKILL'); } });
  `;
  const beforeInstallOutcome = spawnSync(process.execPath, ['-e', killedBeforeInstall], {
    encoding: 'utf8',
  });
  assert.strictEqual(
    beforeInstallOutcome.signal,
    'SIGKILL',
    beforeInstallOutcome.stderr || beforeInstallOutcome.stdout
  );
  assert.strictEqual(fs.existsSync(inodeTarget), false);
  fs.writeFileSync(inodeTarget, 'same bytes, different inode\n');
  await assert.rejects(
    commitFileTransaction(inodeVault, []),
    /被其他操作替换/,
    'same bytes from a different inode must never be deleted as transaction output'
  );
  assert.strictEqual(fs.readFileSync(inodeTarget, 'utf8'), 'same bytes, different inode\n');
  const inodeTransactions = path.join(inodeVault, '.alskai-notebank', 'transactions');
  assert.ok(
    fs.readdirSync(inodeTransactions).some((entry) => entry.startsWith('.pending-')),
    'failed recovery must retain an inactive pending snapshot'
  );
  fs.rmSync(inodeTarget);
  await commitFileTransaction(inodeVault, []);
  assert.strictEqual(
    fs.existsSync(inodeTransactions) ? fs.readdirSync(inodeTransactions).length : 0,
    0,
    'a stale recovery claim owned by the same long-running PID must be retried'
  );

  const quarantineRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'tx-quarantine-crash-'));
  const quarantineVault = path.join(quarantineRoot, 'vault');
  const quarantineTarget = path.join(quarantineVault, 'L2_原子卡片', 'human-edit.md');
  fs.mkdirSync(path.dirname(quarantineTarget), { recursive: true });
  const killedInstalledWriter = `
    const path = require('path');
    const fse = require('fs-extra');
    const realUnlink = fse.unlink;
    fse.unlink = async function(candidate, ...rest) {
      if (String(candidate).includes(path.sep + 'staged' + path.sep + '0')) {
        process.kill(process.pid, 'SIGKILL');
      }
      return realUnlink.call(this, candidate, ...rest);
    };
    const { commitFileTransaction } = require(${JSON.stringify(transactionModule)});
    commitFileTransaction(${JSON.stringify(quarantineVault)}, [{
      target: ${JSON.stringify(quarantineTarget)},
      content: 'transaction output\\n',
      expectAbsent: true
    }]);
  `;
  const installedWriterOutcome = spawnSync(process.execPath, ['-e', killedInstalledWriter], {
    encoding: 'utf8',
  });
  assert.strictEqual(
    installedWriterOutcome.signal,
    'SIGKILL',
    installedWriterOutcome.stderr || installedWriterOutcome.stdout
  );
  assert.strictEqual(fs.readFileSync(quarantineTarget, 'utf8'), 'transaction output\n');
  const humanAfterClaim = 'human edit inside quarantine window\n';
  const killedRecoveryScript = `
    const path = require('path');
    const fs = require('fs');
    const fse = require('fs-extra');
    const realMove = fse.move;
    let injected = false;
    fse.move = async function(source, destination, ...rest) {
      if (!injected &&
          path.resolve(source) === path.resolve(${JSON.stringify(quarantineTarget)}) &&
          String(destination).includes('recovery-quarantine')) {
        injected = true;
        fs.writeFileSync(source, ${JSON.stringify(humanAfterClaim)});
        await realMove.call(this, source, destination, ...rest);
        process.kill(process.pid, 'SIGKILL');
      }
      return realMove.call(this, source, destination, ...rest);
    };
    const { commitFileTransaction } = require(${JSON.stringify(transactionModule)});
    commitFileTransaction(${JSON.stringify(quarantineVault)}, []);
  `;
  const killedRecoveryOutcome = spawnSync(process.execPath, ['-e', killedRecoveryScript], {
    encoding: 'utf8',
  });
  assert.strictEqual(
    killedRecoveryOutcome.signal,
    'SIGKILL',
    killedRecoveryOutcome.stderr || killedRecoveryOutcome.stdout
  );
  assert.strictEqual(fs.existsSync(quarantineTarget), false);
  await assert.rejects(commitFileTransaction(quarantineVault, []), /人工修改/);
  assert.strictEqual(
    fs.readFileSync(quarantineTarget, 'utf8'),
    humanAfterClaim,
    'a crash after quarantine must not lose the human edit'
  );

  const reusedPidRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'tx-reused-pid-'));
  const reusedPidVault = path.join(reusedPidRoot, 'vault');
  const reusedPidTarget = path.join(reusedPidVault, 'L2_原子卡片', 'restore.md');
  fs.mkdirSync(path.dirname(reusedPidTarget), { recursive: true });
  fs.writeFileSync(reusedPidTarget, 'restore despite a live reused PID\n');
  const deadOwnerScript = `
    const { commitFileTransaction } = require(${JSON.stringify(transactionModule)});
    commitFileTransaction(${JSON.stringify(reusedPidVault)}, [{
      target: ${JSON.stringify(reusedPidTarget)},
      delete: true,
      expectedContent: 'restore despite a live reused PID\\n'
    }], { afterBackup() { process.kill(process.pid, 'SIGKILL'); } });
  `;
  const deadOwnerOutcome = spawnSync(process.execPath, ['-e', deadOwnerScript], {
    encoding: 'utf8',
  });
  assert.strictEqual(deadOwnerOutcome.signal, 'SIGKILL');
  const reusedPidTransactions = path.join(reusedPidVault, '.alskai-notebank', 'transactions');
  const deadOwnerTransaction = path.join(
    reusedPidTransactions,
    fs.readdirSync(reusedPidTransactions)[0]
  );
  const deadOwnerJournal = path.join(deadOwnerTransaction, 'journal.json');
  const sleeper = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], {
    stdio: 'ignore',
  });
  try {
    await delay(50);
    const journal = JSON.parse(fs.readFileSync(deadOwnerJournal, 'utf8'));
    journal.owner = {
      pid: sleeper.pid,
      processStartedAt: 'a different process start identity',
    };
    fs.writeFileSync(deadOwnerJournal, `${JSON.stringify(journal, null, 2)}\n`);
    await commitFileTransaction(reusedPidVault, []);
  } finally {
    sleeper.kill('SIGTERM');
  }
  assert.strictEqual(
    fs.readFileSync(reusedPidTarget, 'utf8'),
    'restore despite a live reused PID\n',
    'a live PID with a different start identity must not own the dead transaction'
  );

  const legacyRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'tx-legacy-no-journal-'));
  const legacyVault = path.join(legacyRoot, 'vault');
  const legacyTarget = path.join(legacyVault, 'L2_原子卡片', 'legacy.md');
  const legacyTransaction = path.join(
    legacyVault,
    '.alskai-notebank',
    'transactions',
    '2147483647-00000000-0000-4000-8000-000000000000'
  );
  const legacyBackup = path.join(legacyTransaction, 'backup', '0');
  fs.mkdirSync(path.dirname(legacyTarget), { recursive: true });
  fs.mkdirSync(path.dirname(legacyBackup), { recursive: true });
  fs.writeFileSync(legacyBackup, 'legacy original only exists in backup\n');
  await assert.rejects(
    commitFileTransaction(legacyVault, []),
    /旧版无日志事务快照/,
    'a legacy journal-less snapshot must block instead of being recursively deleted'
  );
  assert.strictEqual(fs.existsSync(legacyTarget), false);
  assert.strictEqual(
    fs.readFileSync(legacyBackup, 'utf8'),
    'legacy original only exists in backup\n'
  );

  const rootSwapRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'tx-root-swap-'));
  const rootSwapVault = path.join(rootSwapRoot, 'vault');
  const rootSwapTransactions = path.join(rootSwapVault, '.alskai-notebank', 'transactions');
  const savedTransactions = path.join(rootSwapVault, '.alskai-notebank', 'transactions-saved');
  const outsideTransactions = path.join(rootSwapRoot, 'outside-transactions');
  const outsideCandidateName = [
    '2147483647',
    '0'.repeat(64),
    '00000000-0000-4000-8000-000000000001',
  ].join('-');
  const outsideCandidate = path.join(outsideTransactions, outsideCandidateName);
  const outsideMarker = path.join(outsideCandidate, 'must-survive.txt');
  fs.mkdirSync(rootSwapTransactions, { recursive: true });
  fs.mkdirSync(outsideCandidate, { recursive: true });
  fs.writeFileSync(outsideMarker, 'outside directory must survive\n');
  const realRecoveryReaddir = fse.readdir;
  let swappedRecoveryRoot = false;
  fse.readdir = async function patchedRecoveryReaddir(candidate, ...rest) {
    if (!swappedRecoveryRoot && path.resolve(candidate) === path.resolve(rootSwapTransactions)) {
      swappedRecoveryRoot = true;
      fs.renameSync(rootSwapTransactions, savedTransactions);
      fs.symlinkSync(outsideTransactions, rootSwapTransactions, 'dir');
    }
    return realRecoveryReaddir.call(this, candidate, ...rest);
  };
  let rootSwapError;
  try {
    await commitFileTransaction(rootSwapVault, []);
  } catch (error) {
    rootSwapError = error;
  } finally {
    fse.readdir = realRecoveryReaddir;
    if (fs.lstatSync(rootSwapTransactions).isSymbolicLink()) {
      fs.unlinkSync(rootSwapTransactions);
      fs.renameSync(savedTransactions, rootSwapTransactions);
    }
  }
  assert.ok(swappedRecoveryRoot, 'fixture must replace the transactions root after lstat');
  assert.ok(rootSwapError, 'recovery must reject a replaced transactions root');
  assert.strictEqual(fs.readFileSync(outsideMarker, 'utf8'), 'outside directory must survive\n');

  const recoveryLinkRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'tx-recovery-link-swap-'));
  const recoveryLinkVault = path.join(recoveryLinkRoot, 'vault');
  const recoveryLinkParent = path.join(recoveryLinkVault, 'L2_原子卡片');
  const savedRecoveryLinkParent = path.join(recoveryLinkVault, 'L2_原子卡片-saved');
  const recoveryLinkOutside = path.join(recoveryLinkRoot, 'outside');
  const recoveryLinkTarget = path.join(recoveryLinkParent, 'restore.md');
  const recoveryLinkOutsideTarget = path.join(recoveryLinkOutside, 'restore.md');
  fs.mkdirSync(recoveryLinkParent, { recursive: true });
  fs.mkdirSync(recoveryLinkOutside, { recursive: true });
  fs.writeFileSync(recoveryLinkTarget, 'backup must remain authoritative\n');
  const deadRecoveryLink = `
    const { commitFileTransaction } = require(${JSON.stringify(transactionModule)});
    commitFileTransaction(${JSON.stringify(recoveryLinkVault)}, [{
      target: ${JSON.stringify(recoveryLinkTarget)},
      delete: true,
      expectedContent: 'backup must remain authoritative\\n'
    }], { afterBackup() { process.kill(process.pid, 'SIGKILL'); } });
  `;
  const deadRecoveryLinkOutcome = spawnSync(process.execPath, ['-e', deadRecoveryLink], {
    encoding: 'utf8',
  });
  assert.strictEqual(deadRecoveryLinkOutcome.signal, 'SIGKILL');
  const realRecoveryLink = fse.link;
  let swappedRecoveryLinkParent = false;
  fse.link = async function patchedRecoveryLink(source, destination, ...rest) {
    if (
      !swappedRecoveryLinkParent &&
      path.resolve(destination) === path.resolve(recoveryLinkTarget)
    ) {
      swappedRecoveryLinkParent = true;
      fs.renameSync(recoveryLinkParent, savedRecoveryLinkParent);
      fs.symlinkSync(recoveryLinkOutside, recoveryLinkParent, 'dir');
    }
    return realRecoveryLink.call(this, source, destination, ...rest);
  };
  let recoveryLinkError;
  try {
    await commitFileTransaction(recoveryLinkVault, []);
  } catch (error) {
    recoveryLinkError = error;
  } finally {
    fse.link = realRecoveryLink;
  }
  assert.ok(swappedRecoveryLinkParent, 'fixture must replace the recovery target parent');
  assert.ok(recoveryLinkError, 'recovery must reject a parent swap during hard-link install');
  assert.strictEqual(
    fs.existsSync(recoveryLinkOutsideTarget),
    false,
    'recovery must remove an accidentally installed external hard link'
  );
  const recoverySnapshots = fs.readdirSync(
    path.join(recoveryLinkVault, '.alskai-notebank', 'transactions')
  );
  assert.ok(recoverySnapshots.length > 0, 'failed recovery must retain its source snapshot');
  assert.ok(
    recoverySnapshots.some((snapshot) =>
      fs.existsSync(path.join(
        recoveryLinkVault,
        '.alskai-notebank',
        'transactions',
        snapshot,
        'backup',
        '0'
      ))
    ),
    'the authoritative backup must remain after failed install verification'
  );

  const rollbackLinkRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'tx-rollback-link-swap-'));
  const rollbackLinkVault = path.join(rollbackLinkRoot, 'vault');
  const rollbackLinkParent = path.join(rollbackLinkVault, 'Managed');
  const savedRollbackLinkParent = path.join(rollbackLinkVault, 'Managed-saved');
  const rollbackLinkOutside = path.join(rollbackLinkRoot, 'outside');
  const rollbackLinkA = path.join(rollbackLinkParent, 'a.md');
  const rollbackLinkB = path.join(rollbackLinkParent, 'b.md');
  const rollbackLinkOutsideA = path.join(rollbackLinkOutside, 'a.md');
  fs.mkdirSync(rollbackLinkParent, { recursive: true });
  fs.mkdirSync(rollbackLinkOutside, { recursive: true });
  fs.writeFileSync(rollbackLinkA, 'A rollback original\n');
  fs.writeFileSync(rollbackLinkB, 'B rollback original\n');
  const realRollbackLink = fse.link;
  let swappedRollbackLinkParent = false;
  fse.link = async function patchedRollbackLink(source, destination, ...rest) {
    if (
      !swappedRollbackLinkParent &&
      String(source).includes(`${path.sep}backup${path.sep}0`) &&
      path.resolve(destination) === path.resolve(rollbackLinkA)
    ) {
      swappedRollbackLinkParent = true;
      fs.renameSync(rollbackLinkParent, savedRollbackLinkParent);
      fs.symlinkSync(rollbackLinkOutside, rollbackLinkParent, 'dir');
    }
    return realRollbackLink.call(this, source, destination, ...rest);
  };
  let rollbackLinkError;
  try {
    await commitFileTransaction(rollbackLinkVault, [
      { target: rollbackLinkA, content: 'A transaction output\n' },
      { target: rollbackLinkB, content: 'B transaction output\n' },
    ], {
      beforeApply(index) {
        if (index === 1) throw new Error('trigger rollback hard-link restore');
      },
    });
  } catch (error) {
    rollbackLinkError = error;
  } finally {
    fse.link = realRollbackLink;
  }
  assert.ok(swappedRollbackLinkParent, 'fixture must replace the rollback target parent');
  assert.ok(rollbackLinkError, 'rollback must reject a parent swap during hard-link install');
  assert.strictEqual(fs.existsSync(rollbackLinkOutsideA), false);
  const rollbackSnapshots = fs.readdirSync(
    path.join(rollbackLinkVault, '.alskai-notebank', 'transactions')
  );
  assert.ok(
    rollbackSnapshots.some((snapshot) =>
      fs.existsSync(path.join(
        rollbackLinkVault,
        '.alskai-notebank',
        'transactions',
        snapshot,
        'backup',
        '0'
      ))
    ),
    'rollback must retain the authoritative backup when install verification fails'
  );

  const backupAuthRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'tx-backup-auth-'));
  const backupAuthVault = path.join(backupAuthRoot, 'vault');
  const backupAuthTarget = path.join(backupAuthVault, 'L2_原子卡片', 'restore.md');
  fs.mkdirSync(path.dirname(backupAuthTarget), { recursive: true });
  fs.writeFileSync(backupAuthTarget, 'trusted original bytes\n');
  const backupAuthDeadTransaction = `
    const { commitFileTransaction } = require(${JSON.stringify(transactionModule)});
    commitFileTransaction(${JSON.stringify(backupAuthVault)}, [{
      target: ${JSON.stringify(backupAuthTarget)},
      delete: true,
      expectedContent: 'trusted original bytes\\n'
    }], { afterBackup() { process.kill(process.pid, 'SIGKILL'); } });
  `;
  const backupAuthDeadOutcome = spawnSync(
    process.execPath,
    ['-e', backupAuthDeadTransaction],
    { encoding: 'utf8' }
  );
  assert.strictEqual(backupAuthDeadOutcome.signal, 'SIGKILL');
  const realBackupAuthLink = fse.link;
  let backupTampered = false;
  fse.link = async function patchedBackupAuthLink(source, destination, ...rest) {
    if (
      !backupTampered &&
      String(source).includes(`${path.sep}backup${path.sep}0`) &&
      path.resolve(destination) === path.resolve(backupAuthTarget)
    ) {
      backupTampered = true;
      fs.writeFileSync(source, 'tampered backup bytes\n');
    }
    return realBackupAuthLink.call(this, source, destination, ...rest);
  };
  let backupAuthError;
  try {
    await commitFileTransaction(backupAuthVault, []);
  } catch (error) {
    backupAuthError = error;
  } finally {
    fse.link = realBackupAuthLink;
  }
  assert.ok(backupTampered, 'fixture must tamper with backup after its early hash check');
  assert.ok(backupAuthError, 'recovery must reject backup bytes changed before link install');
  assert.strictEqual(fs.existsSync(backupAuthTarget), false);
  assert.ok(
    fs.readdirSync(path.join(backupAuthVault, '.alskai-notebank', 'transactions')).length > 0,
    'tampered recovery must retain its snapshot for diagnosis'
  );

  const cleanupCrashRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'tx-cleanup-crash-'));
  const cleanupCrashVault = path.join(cleanupCrashRoot, 'vault');
  const cleanupCrashTarget = path.join(cleanupCrashVault, 'L2_原子卡片', 'restore.md');
  fs.mkdirSync(path.dirname(cleanupCrashTarget), { recursive: true });
  fs.writeFileSync(cleanupCrashTarget, 'recovery completes before cleanup crash\n');
  const cleanupCrashDeadTransaction = `
    const { commitFileTransaction } = require(${JSON.stringify(transactionModule)});
    commitFileTransaction(${JSON.stringify(cleanupCrashVault)}, [{
      target: ${JSON.stringify(cleanupCrashTarget)},
      delete: true,
      expectedContent: 'recovery completes before cleanup crash\\n'
    }], { afterBackup() { process.kill(process.pid, 'SIGKILL'); } });
  `;
  const cleanupCrashDeadOutcome = spawnSync(
    process.execPath,
    ['-e', cleanupCrashDeadTransaction],
    { encoding: 'utf8' }
  );
  assert.strictEqual(cleanupCrashDeadOutcome.signal, 'SIGKILL');
  const cleanupCrashRecovery = `
    const fs = require('fs');
    const path = require('path');
    const fse = require('fs-extra');
    const realRemove = fse.remove;
    fse.remove = async function(candidate, ...rest) {
      const name = path.basename(String(candidate));
      if (name.startsWith('.recovering-') || name.startsWith('.cleanup-complete-')) {
        const journal = path.join(String(candidate), 'journal.json');
        if (fs.existsSync(journal)) fs.unlinkSync(journal);
        process.kill(process.pid, 'SIGKILL');
      }
      return realRemove.call(this, candidate, ...rest);
    };
    const { commitFileTransaction } = require(${JSON.stringify(transactionModule)});
    commitFileTransaction(${JSON.stringify(cleanupCrashVault)}, []);
  `;
  const cleanupCrashRecoveryOutcome = spawnSync(
    process.execPath,
    ['-e', cleanupCrashRecovery],
    { encoding: 'utf8' }
  );
  assert.strictEqual(cleanupCrashRecoveryOutcome.signal, 'SIGKILL');
  assert.strictEqual(
    fs.readFileSync(cleanupCrashTarget, 'utf8'),
    'recovery completes before cleanup crash\n'
  );
  await commitFileTransaction(cleanupCrashVault, []);
  const cleanupCrashTransactions = path.join(
    cleanupCrashVault,
    '.alskai-notebank',
    'transactions'
  );
  assert.strictEqual(
    fs.existsSync(cleanupCrashTransactions)
      ? fs.readdirSync(cleanupCrashTransactions).length
      : 0,
    0,
    'a completed-cleanup tombstone must remain self-healing without its journal'
  );

  const commitCleanupRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'tx-commit-cleanup-swap-'));
  const commitCleanupVault = path.join(commitCleanupRoot, 'vault');
  const commitCleanupTarget = path.join(commitCleanupVault, 'Managed', 'new.md');
  const commitTransactions = path.join(commitCleanupVault, '.alskai-notebank', 'transactions');
  const savedCommitTransactions = path.join(
    commitCleanupVault,
    '.alskai-notebank',
    'transactions-saved'
  );
  const commitCleanupOutside = path.join(commitCleanupRoot, 'outside-transactions');
  fs.mkdirSync(path.dirname(commitCleanupTarget), { recursive: true });
  fs.mkdirSync(commitCleanupOutside, { recursive: true });
  const realCommitCleanupRemove = fse.remove;
  let commitCleanupSwapped = false;
  fse.remove = async function patchedCommitCleanupRemove(candidate, ...rest) {
    const resolvedCandidate = path.resolve(String(candidate));
    const directTransaction = path.dirname(resolvedCandidate) === path.resolve(commitTransactions);
    const transactionName = path.basename(resolvedCandidate);
    if (
      !commitCleanupSwapped &&
      directTransaction &&
      /^\d+-[0-9a-f]{64}-[0-9a-f-]{36}$/i.test(transactionName)
    ) {
      commitCleanupSwapped = true;
      const outsideCandidate = path.join(commitCleanupOutside, transactionName);
      const outsideCommitMarker = path.join(outsideCandidate, 'must-survive.txt');
      fs.mkdirSync(outsideCandidate, { recursive: true });
      fs.writeFileSync(outsideCommitMarker, 'normal commit cleanup must stay inside vault\n');
      fs.renameSync(commitTransactions, savedCommitTransactions);
      fs.symlinkSync(commitCleanupOutside, commitTransactions, 'dir');
    }
    return realCommitCleanupRemove.call(this, candidate, ...rest);
  };
  try {
    await commitFileTransaction(commitCleanupVault, [{
      target: commitCleanupTarget,
      content: 'committed content\n',
      expectAbsent: true,
    }]);
  } finally {
    fse.remove = realCommitCleanupRemove;
    if (fs.existsSync(commitTransactions) && fs.lstatSync(commitTransactions).isSymbolicLink()) {
      fs.unlinkSync(commitTransactions);
      fs.renameSync(savedCommitTransactions, commitTransactions);
    }
  }
  assert.strictEqual(
    commitCleanupSwapped,
    false,
    'normal commits must retire snapshots through a completed-cleanup tombstone'
  );
  assert.deepStrictEqual(fs.readdirSync(commitCleanupOutside), []);

  console.log('file transaction recovery tests passed');
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
