import { CommandError } from './command-error';

export interface PlatformCheck {
  platform: NodeJS.Platform;
  arch: string;
  supported: boolean;
}

export function inspectPlatform(
  platform: NodeJS.Platform = process.platform,
  arch: string = process.arch
): PlatformCheck {
  return {
    platform,
    arch,
    supported: platform === 'darwin' && arch === 'arm64',
  };
}

export function assertSupportedPlatform(): void {
  const result = inspectPlatform();
  if (!result.supported) {
    throw new CommandError(
      'ENV_UNSUPPORTED',
      `仅支持 macOS Apple Silicon，当前环境为 ${result.platform}/${result.arch}`
    );
  }
}
