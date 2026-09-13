import * as os from 'os';
import * as path from 'path';
import { CommandError } from './command-error';

export interface PlatformCheck {
  platform: NodeJS.Platform;
  arch: string;
  /** 核心命令（fetch / search / import-rss / pack 等）是否可在此平台运行。 */
  runtimeSupported: boolean;
  /** Agent 集成安装（setup）是否支持：仅 macOS Apple Silicon。 */
  setupSupported: boolean;
}

export function inspectPlatform(
  platform: NodeJS.Platform = process.platform,
  arch: string = process.arch
): PlatformCheck {
  const setupSupported = platform === 'darwin' && arch === 'arm64';
  return {
    platform,
    arch,
    runtimeSupported: ['darwin', 'win32', 'linux'].includes(platform),
    setupSupported,
  };
}

/**
 * setup 专用守卫：Agent 集成安装只允许在 macOS Apple Silicon 上执行。
 * 核心命令（fetch / search / import-rss / pack 等）不得调用本函数；
 * tests/environment.test.js 在源码层固化这一约束。
 */
export function assertSupportedPlatform(
  platform: NodeJS.Platform = process.platform,
  arch: string = process.arch
): void {
  if (!inspectPlatform(platform, arch).setupSupported) {
    throw new CommandError(
      'ENV_UNSUPPORTED',
      `Agent 集成安装（setup）仅支持 macOS Apple Silicon，当前环境为 ${platform}/${arch}；` +
        '核心归档命令不受此限制，可直接使用 fetch / search / import-rss / pack'
    );
  }
}

/** HOME 解析唯一入口：优先 HOME，Windows 等无 HOME 环境回退 USERPROFILE，再回退 os.homedir()。 */
export function resolveHomeDir(env: NodeJS.ProcessEnv = process.env): string {
  return env.HOME || env.USERPROFILE || os.homedir();
}

/**
 * 各平台 Chrome 标准安装位置的候选列表，供 doctor 探测使用。
 * WECHAT_NOTEBANK_CHROME_PATH 的优先级由调用方处理（配置值存在时跳过本列表）。
 */
export function chromeCandidatesFor(
  platform: NodeJS.Platform = process.platform,
  env: NodeJS.ProcessEnv = process.env
): string[] {
  switch (platform) {
    case 'darwin':
      return ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'];
    case 'win32':
      return [env['PROGRAMFILES'], env['ProgramFiles(x86)'], env['LOCALAPPDATA']]
        .filter((root): root is string => Boolean(root))
        .map((root) => path.win32.join(root, 'Google', 'Chrome', 'Application', 'chrome.exe'));
    case 'linux':
      return [
        '/usr/bin/google-chrome',
        '/usr/bin/google-chrome-stable',
        '/opt/google/chrome/chrome',
      ];
    default:
      return [];
  }
}
