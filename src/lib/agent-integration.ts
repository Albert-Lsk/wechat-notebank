import * as fs from 'fs-extra';
import * as path from 'path';

export type AgentIntegration = 'codex' | 'claude';

export function getAgentSkillTarget(
  homePath: string,
  agent: AgentIntegration
): string {
  return path.join(homePath, `.${agent}`, 'skills', 'alskai-notebank');
}

export function getClaudeCommandTarget(homePath: string): string {
  return path.join(homePath, '.claude', 'commands', 'alskai-notebank.md');
}

export function isClaudeCommandTarget(target: string): boolean {
  return path.basename(target) === 'alskai-notebank.md' &&
    path.basename(path.dirname(target)) === 'commands';
}

export async function matchesBundledSkill(
  target: string,
  packageRoot: string,
  version: string
): Promise<boolean> {
  if (!(await fs.pathExists(target))) {
    return false;
  }

  try {
    const receipt = await fs.readJson(
      path.join(target, '.alskai-notebank-install.json')
    ) as { version?: string };
    if (receipt.version !== version) {
      return false;
    }
  } catch {
    return false;
  }

  return pathsEqual(
    path.join(packageRoot, 'skills', 'alskai-notebank'),
    target,
    new Set(['.alskai-notebank-install.json'])
  );
}

export async function matchesBundledClaudeCommand(
  target: string,
  packageRoot: string
): Promise<boolean> {
  return pathsEqual(
    path.join(packageRoot, '.claude', 'commands', 'alskai-notebank.md'),
    target
  );
}

export async function pathsEqual(
  source: string,
  target: string,
  ignoredNames: ReadonlySet<string> = new Set()
): Promise<boolean> {
  if (!(await fs.pathExists(source)) || !(await fs.pathExists(target))) {
    return false;
  }

  const [sourceStat, targetStat] = await Promise.all([
    fs.stat(source),
    fs.stat(target),
  ]);
  if (sourceStat.isDirectory() !== targetStat.isDirectory()) {
    return false;
  }
  if (!sourceStat.isDirectory()) {
    const [sourceContent, targetContent] = await Promise.all([
      fs.readFile(source),
      fs.readFile(target),
    ]);
    return sourceContent.equals(targetContent);
  }

  const sourceEntries = (await fs.readdir(source))
    .filter((entry) => !ignoredNames.has(entry))
    .sort();
  const targetEntries = (await fs.readdir(target))
    .filter((entry) => !ignoredNames.has(entry))
    .sort();
  if (sourceEntries.join('\0') !== targetEntries.join('\0')) {
    return false;
  }

  for (const entry of sourceEntries) {
    if (!(await pathsEqual(
      path.join(source, entry),
      path.join(target, entry),
      ignoredNames
    ))) {
      return false;
    }
  }
  return true;
}
