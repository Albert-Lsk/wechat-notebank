import { ConfigScope } from '../types';

export interface FetchArgs {
  url: string | undefined;
  outputPath?: string;
  json: boolean;
  noImages?: boolean;
}

export interface ImportArgs {
  filePath: string;
  json: boolean;
  noImages?: boolean;
}

export type SearchSource = 'sogou' | 'mirror';

export interface SearchArgs {
  query: string;
  source: SearchSource;
  limit: number;
  account?: string;
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

export interface PackApproveArgs {
  packFile: string;
  items: string[];
  json: boolean;
}

export interface PackUpdateArgs {
  packFile: string;
  manifestFile: string;
  json: boolean;
}

export interface PackRejectArgs {
  packFile: string;
  json: boolean;
}

export interface PackRevokeArgs {
  packFile: string;
  items: string[];
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
  let noImages = false;

  for (let i = 0; i < args.length; i++) {
    const option = args[i];

    if (isJsonOutputOption(option)) {
      json = true;
      continue;
    }

    if (option === '--no-images') {
      noImages = true;
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

  return {
    url,
    outputPath,
    json,
    ...(noImages ? { noImages: true } : {}),
  };
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

export function parsePackApproveArgs(args: string[]): PackApproveArgs {
  const [operation, packFile, ...options] = args;
  if (operation !== 'approve') {
    throw new Error('pack requires approve');
  }
  if (!packFile || packFile.startsWith('--')) {
    throw new Error('请提供待审核加工包路径');
  }

  let items: string[] | undefined;
  let json = false;
  for (let index = 0; index < options.length; index++) {
    const option = options[index];
    if (isJsonOutputOption(option)) {
      json = true;
      continue;
    }
    if (option === '--items') {
      const value = options[index + 1];
      if (!value || value.startsWith('--')) {
        throw new Error('--items requires comma-separated candidate IDs');
      }
      const parsed = value.split(',').map((item) => item.trim()).filter(Boolean);
      if (parsed.length === 0) {
        throw new Error('--items requires comma-separated candidate IDs');
      }
      if (new Set(parsed).size !== parsed.length) {
        throw new Error('--items contains duplicate candidate IDs');
      }
      items = parsed;
      index++;
      continue;
    }
    throw new Error(`Unknown pack approve option: ${option}`);
  }

  if (!items) {
    throw new Error('请提供 --items <ids>');
  }
  return { packFile, items, json };
}

export function parsePackUpdateArgs(args: string[]): PackUpdateArgs {
  const [operation, packFile, ...options] = args;
  if (operation !== 'update') {
    throw new Error('pack requires update');
  }
  if (!packFile || packFile.startsWith('--')) {
    throw new Error('请提供待审核加工包路径');
  }

  let manifestFile: string | undefined;
  let json = false;
  for (let index = 0; index < options.length; index++) {
    const option = options[index];
    if (isJsonOutputOption(option)) {
      json = true;
      continue;
    }
    if (option === '--manifest') {
      const value = options[index + 1];
      if (!value || value.startsWith('--')) {
        throw new Error('--manifest requires a file path');
      }
      if (manifestFile) {
        throw new Error('--manifest 不能重复提供');
      }
      manifestFile = value;
      index++;
      continue;
    }
    throw new Error(`Unknown pack update option: ${option}`);
  }
  if (!manifestFile) {
    throw new Error('请提供 --manifest <file>');
  }
  return { packFile, manifestFile, json };
}

export function parsePackRejectArgs(args: string[]): PackRejectArgs {
  const [operation, packFile, ...options] = args;
  if (operation !== 'reject') {
    throw new Error('pack requires reject');
  }
  if (!packFile || packFile.startsWith('--')) {
    throw new Error('请提供待审核加工包路径');
  }

  let json = false;
  for (const option of options) {
    if (isJsonOutputOption(option)) {
      json = true;
      continue;
    }
    throw new Error(`Unknown pack reject option: ${option}`);
  }
  return { packFile, json };
}

export function parsePackRevokeArgs(args: string[]): PackRevokeArgs {
  const [operation, packFile, ...options] = args;
  if (operation !== 'revoke') {
    throw new Error('pack requires revoke');
  }
  if (!packFile || packFile.startsWith('--')) {
    throw new Error('请提供待审核加工包路径');
  }

  let items: string[] | undefined;
  let json = false;
  for (let index = 0; index < options.length; index++) {
    const option = options[index];
    if (isJsonOutputOption(option)) {
      json = true;
      continue;
    }
    if (option === '--items') {
      const value = options[index + 1];
      if (!value || value.startsWith('--')) {
        throw new Error('--items requires comma-separated candidate IDs');
      }
      const parsed = value.split(',').map((item) => item.trim()).filter(Boolean);
      if (parsed.length === 0) {
        throw new Error('--items requires comma-separated candidate IDs');
      }
      if (new Set(parsed).size !== parsed.length) {
        throw new Error('--items contains duplicate candidate IDs');
      }
      items = parsed;
      index++;
      continue;
    }
    throw new Error(`Unknown pack revoke option: ${option}`);
  }
  if (!items) {
    throw new Error('请提供 --items <ids>');
  }
  return { packFile, items, json };
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
  let noImages = false;

  for (const option of args) {
    if (isJsonOutputOption(option)) {
      json = true;
      continue;
    }

    if (option === '--no-images') {
      noImages = true;
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

  return {
    filePath,
    json,
    ...(noImages ? { noImages: true } : {}),
  };
}

/**
 * search 源路由：显式 --source 优先；输入是今天看啥域名时自动走 mirror；
 * 其余（公众号名等关键词）默认 sogou。
 */
function resolveSearchSource(
  query: string,
  explicit: SearchSource | undefined
): SearchSource {
  if (explicit) {
    return explicit;
  }

  try {
    const hostname = new URL(query).hostname.toLowerCase();
    if (hostname === 'jintiankansha.me' || hostname === 'www.jintiankansha.me') {
      return 'mirror';
    }
  } catch {
    // 非 URL 输入按公众号关键词处理。
  }

  return 'sogou';
}

export function parseSearchArgs(args: string[]): SearchArgs {
  let query: string | undefined;
  let source: SearchSource | undefined;
  let limit: number | undefined;
  let account: string | undefined;
  let json = false;

  for (let i = 0; i < args.length; i++) {
    const option = args[i];

    if (isJsonOutputOption(option)) {
      json = true;
      continue;
    }

    if (option === '--source') {
      const value = args[i + 1];
      if (value !== 'sogou' && value !== 'mirror') {
        throw new Error('--source requires sogou or mirror');
      }
      source = value;
      i++;
      continue;
    }

    if (option === '--limit') {
      const value = args[i + 1];
      const parsed = Number(value);
      if (!value || value.startsWith('-') || !Number.isInteger(parsed)) {
        throw new Error('--limit requires a positive integer');
      }
      limit = parsed;
      i++;
      continue;
    }

    if (option === '--account') {
      const value = args[i + 1];
      if (!value || value.startsWith('-')) {
        throw new Error('--account requires an account name');
      }
      account = value;
      i++;
      continue;
    }

    if (option.startsWith('-')) {
      throw new Error(`Unknown search option: ${option}`);
    }

    if (query) {
      throw new Error(`Unexpected search argument: ${option}`);
    }

    query = option;
  }

  if (!query) {
    throw new Error('请提供公众号名称或今天看啥专栏链接');
  }

  const resolvedSource = resolveSearchSource(query, source);
  // 搜狗单页 10 条不翻页，mirror 上限 100（spec 安全底线）。
  const maxLimit = resolvedSource === 'sogou' ? 10 : 100;
  if (limit !== undefined && (limit < 1 || limit > maxLimit)) {
    throw new Error(`--limit 必须在 1 到 ${maxLimit} 之间（${resolvedSource} 源）`);
  }

  return {
    query,
    source: resolvedSource,
    limit: limit ?? maxLimit,
    ...(account ? { account } : {}),
    json,
  };
}

function looksLikeWechatArticleUrl(value: string | undefined): boolean {
  return /^https?:\/\/mp\.weixin\.qq\.com\/s\//.test(value || '');
}
