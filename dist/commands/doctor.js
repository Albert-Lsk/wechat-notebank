"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.doctorCommand = doctorCommand;
const fs = __importStar(require("fs-extra"));
const os = __importStar(require("os"));
const path = __importStar(require("path"));
const fs_1 = require("fs");
const child_process_1 = require("child_process");
const config_1 = require("../lib/config");
const command_error_1 = require("../lib/command-error");
const environment_1 = require("../lib/environment");
const package_info_1 = require("../lib/package-info");
const agent_integration_1 = require("../lib/agent-integration");
async function doctorCommand() {
    const version = await (0, package_info_1.getPackageVersion)();
    const checks = [];
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
async function checkClaudeCommand(homePath) {
    const installedPath = (0, agent_integration_1.getClaudeCommandTarget)(homePath);
    if (!(await fs.pathExists(installedPath))) {
        return {
            id: 'command:claude',
            status: 'warning',
            message: 'Claude Code 斜杠命令尚未安装',
        };
    }
    let matches = false;
    try {
        matches = await (0, agent_integration_1.matchesBundledClaudeCommand)(installedPath, (0, package_info_1.getPackageRoot)());
    }
    catch {
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
function checkPlatform() {
    const platform = (0, environment_1.inspectPlatform)();
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
function checkNode() {
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
function checkNpm() {
    const result = (0, child_process_1.spawnSync)('npm', ['--version'], { encoding: 'utf8' });
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
async function checkChrome() {
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
            await fs.access(candidate, fs_1.constants.X_OK);
            return { id: 'chrome', status: 'passed', message: candidate };
        }
        catch {
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
async function checkSkill(homePath, agent, version) {
    const skillPath = (0, agent_integration_1.getAgentSkillTarget)(homePath, agent);
    if (!(await fs.pathExists(path.join(skillPath, 'SKILL.md')))) {
        return {
            id: `skill:${agent}`,
            status: 'warning',
            message: `${agent} skill 尚未安装`,
        };
    }
    try {
        const receipt = await fs.readJson(path.join(skillPath, '.alskai-notebank-install.json'));
        if (receipt.version === version &&
            await (0, agent_integration_1.matchesBundledSkill)(skillPath, (0, package_info_1.getPackageRoot)(), version)) {
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
    }
    catch {
        return {
            id: `skill:${agent}`,
            status: 'warning',
            message: `${agent} skill 缺少版本信息，请重新运行 setup`,
        };
    }
}
async function checkConfigAndArchive() {
    try {
        const config = await (0, config_1.readConfig)();
        if (!config) {
            return [
                { id: 'config', status: 'warning', message: '尚未配置知识库' },
                { id: 'archive', status: 'warning', message: '未检查归档目录' },
            ];
        }
        const archivePath = expandHome(config.archivePath);
        const checks = [
            { id: 'config', status: 'passed', message: '配置有效' },
        ];
        try {
            const stat = await fs.stat(archivePath);
            if (!stat.isDirectory()) {
                throw new Error('归档路径不是目录');
            }
            await fs.access(archivePath, fs_1.constants.W_OK);
            checks.push({ id: 'archive', status: 'passed', message: archivePath });
        }
        catch {
            checks.push({
                id: 'archive',
                status: 'failed',
                message: `归档目录不存在或不可写: ${archivePath}`,
                errorCode: 'CONFIG_INVALID',
            });
        }
        return checks;
    }
    catch (error) {
        return [
            {
                id: 'config',
                status: 'failed',
                message: (0, command_error_1.getErrorMessage)(error),
                errorCode: 'CONFIG_INVALID',
            },
            { id: 'archive', status: 'warning', message: '配置无效，未检查归档目录' },
        ];
    }
}
function expandHome(value) {
    if (value === '~') {
        return process.env.HOME || os.homedir();
    }
    if (/^~[\\/]/.test(value)) {
        return path.join(process.env.HOME || os.homedir(), value.slice(2));
    }
    return value;
}
function summarizeChecks(checks) {
    if (checks.some((check) => check.status === 'failed')) {
        return 'failed';
    }
    if (checks.some((check) => check.status === 'warning')) {
        return 'warning';
    }
    return 'passed';
}
