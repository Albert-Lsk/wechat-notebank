import * as fs from 'fs-extra';
import * as os from 'os';
import * as path from 'path';
import { SetupArgs, SetupAgent } from '../lib/cli';
import { CommandError, getErrorMessage } from '../lib/command-error';
import { assertSupportedPlatform } from '../lib/environment';
import { getPackageRoot, getPackageVersion } from '../lib/package-info';
import { doctorCommand, DoctorResult } from './doctor';
import {
  getAgentSkillTarget,
  getClaudeCommandTarget,
  isClaudeCommandTarget,
  matchesBundledClaudeCommand,
  matchesBundledSkill,
  pathsEqual,
} from '../lib/agent-integration';

export interface SetupAction {
  action: 'install' | 'update';
  agent: SetupAgent;
  target: string;
  backup?: string;
  status: 'planned' | 'installed' | 'updated' | 'unchanged';
}

export interface SetupResult {
  dryRun: boolean;
  agents: SetupAgent[];
  actions: SetupAction[];
  restartRequired?: boolean;
  diagnostics?: DoctorResult;
}

const SETUP_BLOCKING_ERRORS = new Set([
  'ENV_UNSUPPORTED',
  'NODE_VERSION_UNSUPPORTED',
  'NPM_NOT_FOUND',
  'CHROME_NOT_FOUND',
]);

export async function setupCommand(args: SetupArgs): Promise<SetupResult> {
  assertSupportedPlatform();
  const preflight = await doctorCommand();
  const blockingCheck = preflight.checks.find(
    (check) => check.status === 'failed' &&
      check.errorCode &&
      SETUP_BLOCKING_ERRORS.has(check.errorCode)
  );
  if (blockingCheck?.errorCode) {
    throw new CommandError(blockingCheck.errorCode, blockingCheck.message);
  }
  const homePath = process.env.HOME || os.homedir();
  const packageRoot = getPackageRoot();
  const version = await getPackageVersion();
  const actions = await getSetupActions(
    homePath,
    args.agents,
    args.dryRun ? 'planned' : 'installed',
    packageRoot,
    version
  );
  if (!args.dryRun) {
    try {
      await installActions(actions, packageRoot, version, homePath);
    } catch (error) {
      throw new CommandError('TRANSACTION_FAILED', getErrorMessage(error));
    }
  }

  const diagnostics = args.dryRun ? undefined : await doctorCommand();

  return {
    dryRun: args.dryRun,
    agents: args.agents,
    actions,
    ...(args.dryRun ? {} : { restartRequired: true, diagnostics }),
  };
}

async function getSetupActions(
  homePath: string,
  agents: SetupAgent[],
  changedStatus: 'planned' | 'installed',
  packageRoot: string,
  version: string
): Promise<SetupAction[]> {
  const requestedActions = agents.flatMap((agent) => {
    const actions: SetupAction[] = [{
      action: 'install',
      agent,
      target: getAgentSkillTarget(homePath, agent),
      status: changedStatus,
    }];
    if (agent === 'claude') {
      actions.push({
        action: 'install',
        agent,
        target: getClaudeCommandTarget(homePath),
        status: changedStatus,
      });
    }
    return actions;
  });

  return Promise.all(requestedActions.map(async (action) => {
    const exists = await fs.pathExists(action.target);
    if (exists && await targetMatchesPackage(action.target, packageRoot, version)) {
      return { ...action, status: 'unchanged' as const };
    }
    if (!exists) {
      return { ...action, status: changedStatus };
    }
    return {
      ...action,
      action: 'update' as const,
      backup: getBackupTarget(homePath, action, version),
      status: changedStatus === 'planned' ? 'planned' as const : 'updated' as const,
    };
  }));
}

async function installActions(
  actions: SetupAction[],
  packageRoot: string,
  version: string,
  homePath: string
): Promise<void> {
  const changedActions = actions.filter((action) => action.status !== 'unchanged');
  if (changedActions.length === 0) {
    return;
  }

  const skillSource = path.join(packageRoot, 'skills', 'alskai-notebank');
  const commandSource = path.join(
    packageRoot,
    '.claude',
    'commands',
    'alskai-notebank.md'
  );
  const transactionRoot = path.join(
    homePath,
    '.local',
    'state',
    'alskai-notebank',
    'setup-transactions',
    `${process.pid}-${Date.now()}`
  );
  const entries: Array<{
    action: SetupAction;
    staged: string;
    original: string;
    previousBackup: string;
  }> = [];
  const committedEntries: typeof entries = [];
  let recoveryCompleted = true;
  const initiallyMissingDirectories = await findInitiallyMissingDirectories(
    homePath,
    transactionRoot,
    actions
  );

  try {
    for (const [index, action] of changedActions.entries()) {
      const staged = path.join(transactionRoot, 'staged', String(index));
      const original = path.join(transactionRoot, 'original', String(index));
      const previousBackup = path.join(
        transactionRoot,
        'previous-backup',
        String(index)
      );
      await stageAction(action, staged, skillSource, commandSource, version);
      if (action.action === 'update') {
        await fs.copy(action.target, original);
        if (action.backup && await fs.pathExists(action.backup)) {
          await fs.copy(action.backup, previousBackup);
        }
      }
      entries.push({ action, staged, original, previousBackup });
    }

    for (const entry of entries) {
      await assertTargetUnchanged(entry);
      await fs.ensureDir(path.dirname(entry.action.target));
      committedEntries.push(entry);
      await fs.remove(entry.action.target);
      await fs.move(entry.staged, entry.action.target);
    }

    for (const entry of entries) {
      if (entry.action.action !== 'update' || !entry.action.backup) {
        continue;
      }
      await fs.remove(entry.action.backup);
      await fs.ensureDir(path.dirname(entry.action.backup));
      await fs.copy(entry.original, entry.action.backup);
    }
  } catch (error) {
    if (committedEntries.length > 0) {
      try {
        await restoreSetupTransaction(committedEntries);
      } catch (rollbackError) {
        recoveryCompleted = false;
        throw new Error(
          `${getErrorMessage(error)}；自动恢复失败：${getErrorMessage(rollbackError)}；` +
          `恢复快照保留在 ${transactionRoot}`
        );
      }
    }
    throw error;
  } finally {
    if (recoveryCompleted) {
      await fs.remove(transactionRoot);
      await removeInitiallyMissingEmptyDirectories(initiallyMissingDirectories);
    }
  }
}

async function assertTargetUnchanged(entry: {
  action: SetupAction;
  original: string;
}): Promise<void> {
  if (entry.action.action === 'install') {
    if (await fs.pathExists(entry.action.target)) {
      throw new Error(`安装目标在事务期间被创建: ${entry.action.target}`);
    }
    return;
  }

  if (!(await pathsEqual(entry.original, entry.action.target))) {
    throw new Error(`安装目标在事务期间发生变化: ${entry.action.target}`);
  }
}

async function findInitiallyMissingDirectories(
  homePath: string,
  transactionRoot: string,
  actions: SetupAction[]
): Promise<string[]> {
  const starts = [
    path.dirname(transactionRoot),
    ...actions.map((action) => path.dirname(action.target)),
    ...actions.flatMap(
      (action) => action.backup ? [path.dirname(action.backup)] : []
    ),
  ];
  const candidates = new Set<string>();
  for (const start of starts) {
    let current = start;
    while (current.startsWith(`${homePath}${path.sep}`)) {
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

async function stageAction(
  action: SetupAction,
  staged: string,
  skillSource: string,
  commandSource: string,
  version: string
): Promise<void> {
  await fs.ensureDir(path.dirname(staged));
  if (path.extname(action.target) === '.md') {
    await fs.copyFile(commandSource, staged);
    return;
  }

  await fs.copy(skillSource, staged);
  await fs.writeJson(
    path.join(staged, '.alskai-notebank-install.json'),
    { version },
    { spaces: 2 }
  );
}

async function restoreSetupTransaction(entries: Array<{
  action: SetupAction;
  original: string;
  previousBackup: string;
}>): Promise<void> {
  for (const entry of [...entries].reverse()) {
    await fs.remove(entry.action.target);
    if (entry.action.action === 'update' && await fs.pathExists(entry.original)) {
      await fs.ensureDir(path.dirname(entry.action.target));
      await fs.copy(entry.original, entry.action.target);
    }
    if (!entry.action.backup) {
      continue;
    }
    await fs.remove(entry.action.backup);
    if (await fs.pathExists(entry.previousBackup)) {
      await fs.ensureDir(path.dirname(entry.action.backup));
      await fs.copy(entry.previousBackup, entry.action.backup);
    }
  }
}

function getBackupTarget(
  homePath: string,
  action: SetupAction,
  version: string
): string {
  return path.join(
    homePath,
    '.local',
    'state',
    'alskai-notebank',
    'setup-backups',
    action.agent,
    version,
    path.extname(action.target) === '.md' ? 'command.md' : 'skill'
  );
}

async function targetMatchesPackage(
  target: string,
  packageRoot: string,
  version: string
): Promise<boolean> {
  return isClaudeCommandTarget(target)
    ? matchesBundledClaudeCommand(target, packageRoot)
    : matchesBundledSkill(target, packageRoot, version);
}
