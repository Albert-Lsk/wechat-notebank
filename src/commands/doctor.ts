import * as fs from 'fs-extra';
import * as os from 'os';
import * as path from 'path';
import { constants } from 'fs';
import { spawnSync } from 'child_process';
import { readConfig } from '../lib/config';
import { CommandErrorCode, getErrorMessage } from '../lib/command-error';
import { inspectPlatform } from '../lib/environment';
import { getPackageRoot, getPackageVersion } from '../lib/package-info';
import {
  getAgentSkillTarget,
  getClaudeCommandTarget,
  matchesBundledClaudeCommand,
  matchesBundledSkill,
} from '../lib/agent-integration';
import { inferVaultRoot, inspectPackIntegrity } from '../lib/pack-integrity';

export type DoctorStatus = 'passed' | 'warning' | 'failed';

export interface DoctorCheck {
  id: string;
  status: DoctorStatus;
  message: string;
  errorCode?: CommandErrorCode;
}

export interface DoctorResult {
  version: string;
  status: DoctorStatus;
  checks: DoctorCheck[];
  error?: {
    code: CommandErrorCode;
    message: string;
  };
}

export async function doctorCommand(): Promise<DoctorResult> {
  const version = await getPackageVersion();
  const checks: DoctorCheck[] = [];
  checks.push(checkPlatform());
  checks.push(checkNode());
  checks.push(checkNpm());
  checks.push(await checkChrome());
  checks.push({
    id: 'cli',
    status: 'passed',
    message: `CLI ${version}`,
  });

  const homePath = process.env.HOME || os.homedir();
  checks.push(await checkSkill(homePath, 'codex', version));
  checks.push(await checkSkill(homePath, 'claude', version));
  checks.push(await checkClaudeCommand(homePath));
  checks.push(...await checkConfigAndArchive());

  const status = summarizeChecks(checks);
  const failed = checks.find((check) => check.status === 'failed');
  return {
    version,
    status,
    checks,
    ...(failed ? {
      error: {
        code: failed.errorCode || 'CONFIG_INVALID',
        message: failed.message,
      },
    } : {}),
  };
}

async function checkClaudeCommand(homePath: string): Promise<DoctorCheck> {
  const installedPath = getClaudeCommandTarget(homePath);
  if (!(await fs.pathExists(installedPath))) {
    return {
      id: 'command:claude',
      status: 'warning',
      message: 'Claude Code 斜杠命令尚未安装',
    };
  }

  let matches = false;
  try {
    matches = await matchesBundledClaudeCommand(installedPath, getPackageRoot());
  } catch {
    // A present but unreadable integration is inconsistent, not a doctor crash.
  }
  return matches
    ? {
      id: 'command:claude',
      status: 'passed',
      message: 'Claude Code 斜杠命令已安装',
    }
    : {
      id: 'command:claude',
      status: 'warning',
      message: 'Claude Code 斜杠命令与当前 CLI 版本不一致',
    };
}

function checkPlatform(): DoctorCheck {
  const platform = inspectPlatform();
  return platform.supported
    ? {
      id: 'platform',
      status: 'passed',
      message: `${platform.platform}/${platform.arch}`,
    }
    : {
      id: 'platform',
      status: 'failed',
      message: `仅支持 macOS Apple Silicon，当前环境为 ${platform.platform}/${platform.arch}`,
      errorCode: 'ENV_UNSUPPORTED',
    };
}

function checkNode(): DoctorCheck {
  const version = process.versions.node;
  const major = Number.parseInt(version.split('.')[0], 10);
  return major >= 20
    ? { id: 'node', status: 'passed', message: `Node.js ${version}` }
    : {
      id: 'node',
      status: 'failed',
      message: `需要 Node.js 20+，当前为 ${version}`,
      errorCode: 'NODE_VERSION_UNSUPPORTED',
    };
}

function checkNpm(): DoctorCheck {
  const result = spawnSync('npm', ['--version'], { encoding: 'utf8' });
  if (result.status === 0) {
    return {
      id: 'npm',
      status: 'passed',
      message: `npm ${result.stdout.trim()}`,
    };
  }
  return {
    id: 'npm',
    status: 'failed',
    message: '未找到可用的 npm，请安装 Node.js 20+（包含 npm）',
    errorCode: 'NPM_NOT_FOUND',
  };
}

async function checkChrome(): Promise<DoctorCheck> {
  const configured = process.env.WECHAT_NOTEBANK_CHROME_PATH;
  const candidates = configured
    ? [configured]
    : ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'];
  for (const candidate of candidates) {
    try {
      const stat = await fs.stat(candidate);
      if (!stat.isFile()) {
        continue;
      }
      await fs.access(candidate, constants.X_OK);
      return { id: 'chrome', status: 'passed', message: candidate };
    } catch {
      // Try the next supported Chrome location.
    }
  }
  return {
    id: 'chrome',
    status: 'failed',
    message: '未找到可执行的 Google Chrome；安装 Chrome，或用 WECHAT_NOTEBANK_CHROME_PATH 指定路径',
    errorCode: 'CHROME_NOT_FOUND',
  };
}

async function checkSkill(
  homePath: string,
  agent: 'codex' | 'claude',
  version: string
): Promise<DoctorCheck> {
  const skillPath = getAgentSkillTarget(homePath, agent);
  if (!(await fs.pathExists(path.join(skillPath, 'SKILL.md')))) {
    return {
      id: `skill:${agent}`,
      status: 'warning',
      message: `${agent} skill 尚未安装`,
    };
  }

  try {
    const receipt = await fs.readJson(
      path.join(skillPath, '.alskai-notebank-install.json')
    ) as { version?: string };
    if (
      receipt.version === version &&
      await matchesBundledSkill(skillPath, getPackageRoot(), version)
    ) {
      return {
        id: `skill:${agent}`,
        status: 'passed',
        message: `${agent} skill ${version}`,
      };
    }
    return {
      id: `skill:${agent}`,
      status: 'warning',
      message: receipt.version === version
        ? `${agent} skill 文件不完整或与 CLI ${version} 不一致`
        : `${agent} skill 版本 ${receipt.version || '未知'}，CLI 版本 ${version}`,
    };
  } catch {
    return {
      id: `skill:${agent}`,
      status: 'warning',
      message: `${agent} skill 缺少版本信息，请重新运行 setup`,
    };
  }
}

async function checkConfigAndArchive(): Promise<DoctorCheck[]> {
  try {
    const config = await readConfig();
    if (!config) {
      return [
        { id: 'config', status: 'warning', message: '尚未配置知识库' },
        { id: 'archive', status: 'warning', message: '未检查归档目录' },
      ];
    }

    const archivePath = expandHome(config.archivePath);
    const checks: DoctorCheck[] = [
      { id: 'config', status: 'passed', message: '配置有效' },
    ];
    try {
      const stat = await fs.stat(archivePath);
      if (!stat.isDirectory()) {
        throw new Error('归档路径不是目录');
      }
      await fs.access(archivePath, constants.W_OK);
      checks.push({ id: 'archive', status: 'passed', message: archivePath });
      try {
        checks.push(...await inspectPackIntegrity(inferVaultRoot(archivePath)));
      } catch (error) {
        checks.push({
          id: 'integrity',
          status: 'warning',
          message: `无法完成加工包完整性扫描: ${getErrorMessage(error)}`,
        });
      }
    } catch {
      checks.push({
        id: 'archive',
        status: 'failed',
        message: `归档目录不存在或不可写: ${archivePath}`,
        errorCode: 'CONFIG_INVALID',
      });
    }
    return checks;
  } catch (error) {
    return [
      {
        id: 'config',
        status: 'failed',
        message: getErrorMessage(error),
        errorCode: 'CONFIG_INVALID',
      },
      { id: 'archive', status: 'warning', message: '配置无效，未检查归档目录' },
    ];
  }
}

function expandHome(value: string): string {
  if (value === '~') {
    return process.env.HOME || os.homedir();
  }
  if (/^~[\\/]/.test(value)) {
    return path.join(process.env.HOME || os.homedir(), value.slice(2));
  }
  return value;
}

function summarizeChecks(checks: DoctorCheck[]): DoctorStatus {
  if (checks.some((check) => check.status === 'failed')) {
    return 'failed';
  }
  if (checks.some((check) => check.status === 'warning')) {
    return 'warning';
  }
  return 'passed';
}
