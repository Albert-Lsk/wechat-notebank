import * as fs from 'fs-extra';
import * as path from 'path';
import { WechatNotebankConfig } from '../types';
import { getL1Path } from './storage';

const CONFIG_FILE = '.wechat-notebank.json';

export function getConfigPath(): string {
  return path.resolve(process.cwd(), CONFIG_FILE);
}

export async function configExists(): Promise<boolean> {
  return fs.pathExists(getConfigPath());
}

export async function readConfig(): Promise<WechatNotebankConfig | null> {
  const configPath = getConfigPath();
  if (!(await fs.pathExists(configPath))) {
    return null;
  }
  const data = await fs.readJson(configPath);
  return data as WechatNotebankConfig;
}

export async function writeConfig(config: WechatNotebankConfig): Promise<void> {
  const configPath = getConfigPath();
  await fs.writeJson(configPath, config, { spaces: 2 });
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
