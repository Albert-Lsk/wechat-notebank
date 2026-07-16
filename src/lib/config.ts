import * as fs from 'fs-extra';
import * as os from 'os';
import * as path from 'path';
import {
  ConfigScope,
  StoredWechatNotebankConfig,
  WechatNotebankConfig,
} from '../types';
import { getErrorMessage } from './command-error';
import { getL1Path } from './storage';

const CONFIG_FILE = '.wechat-notebank.json';
const GLOBAL_CONFIG_DIR = 'alskai-notebank';

export function getConfigPath(scope: ConfigScope = 'project'): string {
  if (scope === 'global') {
    const homePath = process.env.HOME || os.homedir();
    return path.join(homePath, '.config', GLOBAL_CONFIG_DIR, 'config.json');
  }

  return path.resolve(process.cwd(), CONFIG_FILE);
}

export async function configExists(): Promise<boolean> {
  return (
    (await fs.pathExists(getConfigPath('project'))) ||
    (await fs.pathExists(getConfigPath('global')))
  );
}

export async function readConfig(): Promise<WechatNotebankConfig | null> {
  const globalConfig = await readScopedConfig('global');
  const projectConfig = await readScopedConfig('project');
  return resolveConfigLayers(globalConfig, projectConfig);
}

export function resolveConfigLayers(
  globalConfig: StoredWechatNotebankConfig | null,
  projectConfig: StoredWechatNotebankConfig | null
): WechatNotebankConfig | null {
  if (!globalConfig && !projectConfig) {
    return null;
  }

  const merged = {
    ...globalConfig,
    ...projectConfig,
  };

  if (!merged.archivePath) {
    throw new Error('配置缺少有效的 archivePath');
  }

  return {
    ...merged,
    archivePath: merged.archivePath,
    processingGoal: merged.processingGoal?.trim() || undefined,
    autoProcess: merged.autoProcess ?? false,
  };
}

export async function readScopedConfig(
  scope: ConfigScope
): Promise<StoredWechatNotebankConfig | null> {
  const configPath = getConfigPath(scope);
  if (!(await fs.pathExists(configPath))) {
    return null;
  }

  let data: unknown;
  try {
    data = await fs.readJson(configPath);
  } catch (error) {
    throw new Error(`无法解析配置 ${configPath}: ${getErrorMessage(error)}`);
  }

  validateStoredConfig(data, configPath);
  return data;
}

export async function writeConfig(
  config: StoredWechatNotebankConfig,
  scope: ConfigScope = 'project'
): Promise<void> {
  const configPath = getConfigPath(scope);
  const tempPath = `${configPath}.tmp-${process.pid}`;
  validateStoredConfig(config, configPath);
  await fs.ensureDir(path.dirname(configPath));
  try {
    await fs.writeJson(tempPath, config, { spaces: 2 });
    await fs.rename(tempPath, configPath);
  } finally {
    if (await fs.pathExists(tempPath)) {
      await fs.remove(tempPath);
    }
  }
}

export async function createConfig(name: string, basePath: string): Promise<WechatNotebankConfig> {
  const config: WechatNotebankConfig = {
    name,
    archivePath: getL1Path(basePath),
    createdAt: new Date().toISOString(),
  };
  await writeConfig(config);
  return config;
}

function validateStoredConfig(
  data: unknown,
  configPath: string
): asserts data is StoredWechatNotebankConfig {
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    throw new Error(`配置格式无效: ${configPath}`);
  }

  const config = data as Record<string, unknown>;
  validateOptionalString(config, 'name', configPath, false);
  validateOptionalString(config, 'archivePath', configPath, false);
  validateOptionalString(config, 'createdAt', configPath, false);
  validateOptionalString(config, 'processingGoal', configPath, true);

  if (config.autoProcess !== undefined && typeof config.autoProcess !== 'boolean') {
    throw new Error(`配置字段 autoProcess 必须是布尔值: ${configPath}`);
  }
}

function validateOptionalString(
  config: Record<string, unknown>,
  key: string,
  configPath: string,
  allowEmpty: boolean
): void {
  const value = config[key];
  if (value === undefined) {
    return;
  }

  if (typeof value !== 'string' || (!allowEmpty && value.trim().length === 0)) {
    throw new Error(`配置字段 ${key} 必须是${allowEmpty ? '' : '非空'}字符串: ${configPath}`);
  }
}
