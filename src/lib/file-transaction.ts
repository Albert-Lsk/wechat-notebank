import * as fs from 'fs-extra';
import * as path from 'path';
import { randomUUID } from 'crypto';
import { getErrorMessage } from './command-error';

export interface FileWrite {
  target: string;
  content: string | Buffer;
}

export interface FileTransactionHooks {
  beforeApply?: (index: number, target: string) => void | Promise<void>;
}

interface TransactionEntry extends FileWrite {
  staged: string;
  backup: string;
  existed: boolean;
  original: Buffer | null;
  commitStarted: boolean;
}

export async function commitFileTransaction(
  root: string,
  writes: FileWrite[],
  hooks: FileTransactionHooks = {}
): Promise<void> {
  assertUniqueTargets(writes);
  const transactionRoot = path.join(
    root,
    '.alskai-notebank',
    'transactions',
    `${process.pid}-${randomUUID()}`
  );
  const initiallyMissingDirectories = await findInitiallyMissingDirectories(
    root,
    transactionRoot,
    writes
  );
  const entries: TransactionEntry[] = [];
  let recoveryCompleted = true;

  try {
    for (const [index, write] of writes.entries()) {
      assertInsideRoot(root, write.target);
      await assertUsableParent(write.target);
      const existed = await fs.pathExists(write.target);
      let original: Buffer | null = null;
      if (existed) {
        const stat = await fs.stat(write.target);
        if (!stat.isFile()) {
          throw new Error(`事务目标不是文件: ${write.target}`);
        }
        original = await fs.readFile(write.target);
      }
      const staged = path.join(transactionRoot, 'staged', String(index));
      const backup = path.join(transactionRoot, 'backup', String(index));
      await fs.ensureDir(path.dirname(staged));
      await fs.writeFile(staged, write.content);
      entries.push({
        ...write,
        staged,
        backup,
        existed,
        original,
        commitStarted: false,
      });
    }

    for (const [index, entry] of entries.entries()) {
      await assertTargetUnchanged(entry);
      await hooks.beforeApply?.(index, entry.target);
      await fs.ensureDir(path.dirname(entry.target));
      entry.commitStarted = true;
      if (entry.existed) {
        await fs.ensureDir(path.dirname(entry.backup));
        await fs.move(entry.target, entry.backup);
      }
      await fs.move(entry.staged, entry.target);
    }
  } catch (error) {
    try {
      await restoreEntries(entries);
    } catch (rollbackError) {
      recoveryCompleted = false;
      throw new Error(
        `${getErrorMessage(error)}；自动恢复失败：${getErrorMessage(rollbackError)}；` +
        `恢复快照保留在 ${transactionRoot}`
      );
    }
    throw error;
  } finally {
    if (recoveryCompleted) {
      await fs.remove(transactionRoot);
      await removeInitiallyMissingEmptyDirectories(initiallyMissingDirectories);
    }
  }
}

function assertUniqueTargets(writes: FileWrite[]): void {
  const targets = new Set<string>();
  for (const write of writes) {
    const target = path.resolve(write.target);
    if (targets.has(target)) {
      throw new Error(`事务目标重复: ${target}`);
    }
    targets.add(target);
  }
}

function assertInsideRoot(root: string, target: string): void {
  const relative = path.relative(path.resolve(root), path.resolve(target));
  if (relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
    throw new Error(`事务目标超出知识库: ${target}`);
  }
}

async function assertUsableParent(target: string): Promise<void> {
  let candidate = path.dirname(target);
  while (!(await fs.pathExists(candidate))) {
    const parent = path.dirname(candidate);
    if (parent === candidate) {
      throw new Error(`无法解析事务目标父目录: ${target}`);
    }
    candidate = parent;
  }
  if (!(await fs.stat(candidate)).isDirectory()) {
    throw new Error(`事务目标父路径不是目录: ${candidate}`);
  }
}

async function assertTargetUnchanged(entry: TransactionEntry): Promise<void> {
  const exists = await fs.pathExists(entry.target);
  if (!entry.existed) {
    if (exists) {
      throw new Error(`事务目标在提交前被创建: ${entry.target}`);
    }
    return;
  }
  if (!exists || !entry.original) {
    throw new Error(`事务目标在提交前消失: ${entry.target}`);
  }
  const current = await fs.readFile(entry.target);
  if (!current.equals(entry.original)) {
    throw new Error(`事务目标在提交前发生变化: ${entry.target}`);
  }
}

async function restoreEntries(entries: TransactionEntry[]): Promise<void> {
  for (const entry of [...entries].reverse()) {
    if (!entry.commitStarted) {
      continue;
    }
    await fs.remove(entry.target);
    if (entry.existed && await fs.pathExists(entry.backup)) {
      await fs.ensureDir(path.dirname(entry.target));
      await fs.move(entry.backup, entry.target);
    }
  }
}

async function findInitiallyMissingDirectories(
  root: string,
  transactionRoot: string,
  writes: FileWrite[]
): Promise<string[]> {
  const starts = [
    path.dirname(transactionRoot),
    ...writes.map((write) => path.dirname(write.target)),
  ];
  const candidates = new Set<string>();
  for (const start of starts) {
    let current = start;
    while (current.startsWith(`${root}${path.sep}`)) {
      candidates.add(current);
      current = path.dirname(current);
    }
  }
  const missing: string[] = [];
  for (const candidate of candidates) {
    if (!(await fs.pathExists(candidate))) {
      missing.push(candidate);
    }
  }
  return missing.sort((left, right) => right.length - left.length);
}

async function removeInitiallyMissingEmptyDirectories(
  directories: string[]
): Promise<void> {
  for (const directory of directories) {
    try {
      await fs.rmdir(directory);
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code !== 'ENOENT' && code !== 'ENOTEMPTY' && code !== 'EEXIST') {
        throw error;
      }
    }
  }
}
