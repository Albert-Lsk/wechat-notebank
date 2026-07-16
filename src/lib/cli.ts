import { ConfigScope } from '../types';

export interface FetchArgs {
  url: string | undefined;
  outputPath?: string;
  json: boolean;
}

export interface ImportArgs {
  filePath: string;
  json: boolean;
}

export type SetupAgent = 'codex' | 'claude';

export interface SetupArgs {
  agents: SetupAgent[];
  dryRun: boolean;
  json: boolean;
}

export interface DoctorArgs {
  json: boolean;
}

export interface PackCreateArgs {
  sourceFile: string;
  manifestFile: string;
  json: boolean;
}

export interface LegacyInitArgs {
  kind: 'legacy';
  json: false;
}

export interface ScopedInitArgs {
  kind: 'scoped';
  scope: ConfigScope;
  archivePath: string;
  processingGoal?: string;
  processingGoalProvided: boolean;
  autoProcess?: boolean;
  json: boolean;
}

export type InitArgs = LegacyInitArgs | ScopedInitArgs;

export interface NormalizedCliArgs {
  command: string | undefined;
  args: string[];
}

const JSON_OPTION = '--json';

export function normalizeCliArgs(args: string[]): NormalizedCliArgs {
  const [command, ...rest] = args;

  if (looksLikeWechatArticleUrl(command)) {
    return {
      command: 'fetch',
      args,
    };
  }

  return {
    command,
    args: rest,
  };
}

export function parseFetchArgs(args: string[]): FetchArgs {
  let url: string | undefined;
  let outputPath: string | undefined;
  let json = false;

  for (let i = 0; i < args.length; i++) {
    const option = args[i];

    if (isJsonOutputOption(option)) {
      json = true;
      continue;
    }

    if (option === '--output' || option === '-o') {
      const value = args[i + 1];
      if (!value || value.startsWith('-')) {
        throw new Error(`${option} requires a folder path`);
      }
      outputPath = value;
      i++;
      continue;
    }

    if (option.startsWith('-')) {
      throw new Error(`Unknown fetch option: ${option}`);
    }

    if (url) {
      throw new Error(`Unexpected fetch argument: ${option}`);
    }

    url = option;
  }

  return { url, outputPath, json };
}

export function parseSetupArgs(args: string[]): SetupArgs {
  let agents: SetupAgent[] | undefined;
  let dryRun = false;
  let json = false;

  for (let i = 0; i < args.length; i++) {
    const option = args[i];
    if (isJsonOutputOption(option)) {
      json = true;
      continue;
    }
    if (option === '--dry-run') {
      dryRun = true;
      continue;
    }
    if (option === '--agents') {
      const value = args[i + 1];
      if (!value || value.startsWith('-')) {
        throw new Error('--agents requires codex, claude, or codex,claude');
      }
      agents = parseSetupAgents(value);
      i++;
      continue;
    }
    throw new Error(`Unknown setup option: ${option}`);
  }

  if (!agents) {
    throw new Error('请提供 --agents <codex|claude|codex,claude>');
  }

  return { agents, dryRun, json };
}

export function parseDoctorArgs(args: string[]): DoctorArgs {
  let json = false;
  for (const option of args) {
    if (isJsonOutputOption(option)) {
      json = true;
      continue;
    }
    throw new Error(`Unknown doctor option: ${option}`);
  }
  return { json };
}

export function parsePackCreateArgs(args: string[]): PackCreateArgs {
  const [operation, ...options] = args;
  if (operation !== 'create') {
    throw new Error('pack requires create');
  }

  let sourceFile: string | undefined;
  let manifestFile: string | undefined;
  let json = false;
  for (let index = 0; index < options.length; index++) {
    const option = options[index];
    if (isJsonOutputOption(option)) {
      json = true;
      continue;
    }
    if (option === '--source' || option === '--manifest') {
      const value = options[index + 1];
      if (!value || value.startsWith('--')) {
        throw new Error(`${option} requires a file path`);
      }
      if (option === '--source') {
        sourceFile = value;
      } else {
        manifestFile = value;
      }
      index++;
      continue;
    }
    throw new Error(`Unknown pack create option: ${option}`);
  }

  if (!sourceFile) {
    throw new Error('请提供 --source <file>');
  }
  if (!manifestFile) {
    throw new Error('请提供 --manifest <file>');
  }
  return { sourceFile, manifestFile, json };
}

export function parseInitArgs(args: string[]): InitArgs {
  if (args.length === 0) {
    return {
      kind: 'legacy',
      json: false,
    };
  }

  let scope: ConfigScope | undefined;
  let archivePath: string | undefined;
  let processingGoal: string | undefined;
  let processingGoalProvided = false;
  let autoProcess: boolean | undefined;
  let json = false;

  for (let i = 0; i < args.length; i++) {
    const option = args[i];

    if (isJsonOutputOption(option)) {
      json = true;
      continue;
    }

    if (option === '--scope') {
      const value = args[i + 1];
      if (value !== 'global' && value !== 'project') {
        throw new Error('--scope requires global or project');
      }
      scope = value;
      i++;
      continue;
    }

    if (option === '--archive-path') {
      const value = args[i + 1];
      if (!value || value.startsWith('-')) {
        throw new Error('--archive-path requires a folder path');
      }
      archivePath = value;
      i++;
      continue;
    }

    if (option === '--processing-goal') {
      const value = args[i + 1];
      if (value === undefined || value.startsWith('--')) {
        throw new Error('--processing-goal requires text');
      }
      processingGoal = value;
      processingGoalProvided = true;
      i++;
      continue;
    }

    if (option === '--auto-process' || option === '--no-auto-process') {
      const nextValue = option === '--auto-process';
      if (autoProcess !== undefined && autoProcess !== nextValue) {
        throw new Error('--auto-process and --no-auto-process cannot be used together');
      }
      autoProcess = nextValue;
      continue;
    }

    throw new Error(`Unknown init option: ${option}`);
  }

  if (!scope) {
    throw new Error('请提供 --scope <global|project>');
  }
  if (!archivePath) {
    throw new Error('请提供 --archive-path <path>');
  }

  return {
    kind: 'scoped',
    scope,
    archivePath,
    processingGoal,
    processingGoalProvided,
    autoProcess,
    json,
  };
}

export function isJsonOutputRequested(args: string[]): boolean {
  return args.some(isJsonOutputOption);
}

function isJsonOutputOption(value: string): boolean {
  return value === JSON_OPTION;
}

function parseSetupAgents(value: string): SetupAgent[] {
  const agents = [...new Set(value.split(',').map((agent) => agent.trim()))];
  if (
    agents.length === 0 ||
    agents.some((agent) => agent !== 'codex' && agent !== 'claude')
  ) {
    throw new Error('--agents requires codex, claude, or codex,claude');
  }
  return agents as SetupAgent[];
}

export function parseImportArgs(args: string[]): ImportArgs {
  let filePath: string | undefined;
  let json = false;

  for (const option of args) {
    if (isJsonOutputOption(option)) {
      json = true;
      continue;
    }

    if (option.startsWith('-')) {
      throw new Error(`Unknown import option: ${option}`);
    }

    if (filePath) {
      throw new Error(`Unexpected import argument: ${option}`);
    }

    filePath = option;
  }

  if (!filePath) {
    throw new Error('请提供 Excel 文件地址');
  }

  return { filePath, json };
}

function looksLikeWechatArticleUrl(value: string | undefined): boolean {
  return /^https?:\/\/mp\.weixin\.qq\.com\/s\//.test(value || '');
}
