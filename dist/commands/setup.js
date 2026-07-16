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
exports.setupCommand = setupCommand;
const fs = __importStar(require("fs-extra"));
const os = __importStar(require("os"));
const path = __importStar(require("path"));
const command_error_1 = require("../lib/command-error");
const environment_1 = require("../lib/environment");
const package_info_1 = require("../lib/package-info");
const doctor_1 = require("./doctor");
const agent_integration_1 = require("../lib/agent-integration");
const SETUP_BLOCKING_ERRORS = new Set([
    'ENV_UNSUPPORTED',
    'NODE_VERSION_UNSUPPORTED',
    'NPM_NOT_FOUND',
    'CHROME_NOT_FOUND',
]);
async function setupCommand(args) {
    (0, environment_1.assertSupportedPlatform)();
    const preflight = await (0, doctor_1.doctorCommand)();
    const blockingCheck = preflight.checks.find((check) => check.status === 'failed' &&
        check.errorCode &&
        SETUP_BLOCKING_ERRORS.has(check.errorCode));
    if (blockingCheck?.errorCode) {
        throw new command_error_1.CommandError(blockingCheck.errorCode, blockingCheck.message);
    }
    const homePath = process.env.HOME || os.homedir();
    const packageRoot = (0, package_info_1.getPackageRoot)();
    const version = await (0, package_info_1.getPackageVersion)();
    const actions = await getSetupActions(homePath, args.agents, args.dryRun ? 'planned' : 'installed', packageRoot, version);
    if (!args.dryRun) {
        try {
            await installActions(actions, packageRoot, version, homePath);
        }
        catch (error) {
            throw new command_error_1.CommandError('TRANSACTION_FAILED', (0, command_error_1.getErrorMessage)(error));
        }
    }
    const diagnostics = args.dryRun ? undefined : await (0, doctor_1.doctorCommand)();
    return {
        dryRun: args.dryRun,
        agents: args.agents,
        actions,
        ...(args.dryRun ? {} : { restartRequired: true, diagnostics }),
    };
}
async function getSetupActions(homePath, agents, changedStatus, packageRoot, version) {
    const requestedActions = agents.flatMap((agent) => {
        const actions = [{
                action: 'install',
                agent,
                target: (0, agent_integration_1.getAgentSkillTarget)(homePath, agent),
                status: changedStatus,
            }];
        if (agent === 'claude') {
            actions.push({
                action: 'install',
                agent,
                target: (0, agent_integration_1.getClaudeCommandTarget)(homePath),
                status: changedStatus,
            });
        }
        return actions;
    });
    return Promise.all(requestedActions.map(async (action) => {
        const exists = await fs.pathExists(action.target);
        if (exists && await targetMatchesPackage(action.target, packageRoot, version)) {
            return { ...action, status: 'unchanged' };
        }
        if (!exists) {
            return { ...action, status: changedStatus };
        }
        return {
            ...action,
            action: 'update',
            backup: getBackupTarget(homePath, action, version),
            status: changedStatus === 'planned' ? 'planned' : 'updated',
        };
    }));
}
async function installActions(actions, packageRoot, version, homePath) {
    const changedActions = actions.filter((action) => action.status !== 'unchanged');
    if (changedActions.length === 0) {
        return;
    }
    const skillSource = path.join(packageRoot, 'skills', 'alskai-notebank');
    const commandSource = path.join(packageRoot, '.claude', 'commands', 'alskai-notebank.md');
    const transactionRoot = path.join(homePath, '.local', 'state', 'alskai-notebank', 'setup-transactions', `${process.pid}-${Date.now()}`);
    const entries = [];
    const committedEntries = [];
    let recoveryCompleted = true;
    const initiallyMissingDirectories = await findInitiallyMissingDirectories(homePath, transactionRoot, actions);
    try {
        for (const [index, action] of changedActions.entries()) {
            const staged = path.join(transactionRoot, 'staged', String(index));
            const original = path.join(transactionRoot, 'original', String(index));
            const previousBackup = path.join(transactionRoot, 'previous-backup', String(index));
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
    }
    catch (error) {
        if (committedEntries.length > 0) {
            try {
                await restoreSetupTransaction(committedEntries);
            }
            catch (rollbackError) {
                recoveryCompleted = false;
                throw new Error(`${(0, command_error_1.getErrorMessage)(error)}；自动恢复失败：${(0, command_error_1.getErrorMessage)(rollbackError)}；` +
                    `恢复快照保留在 ${transactionRoot}`);
            }
        }
        throw error;
    }
    finally {
        if (recoveryCompleted) {
            await fs.remove(transactionRoot);
            await removeInitiallyMissingEmptyDirectories(initiallyMissingDirectories);
        }
    }
}
async function assertTargetUnchanged(entry) {
    if (entry.action.action === 'install') {
        if (await fs.pathExists(entry.action.target)) {
            throw new Error(`安装目标在事务期间被创建: ${entry.action.target}`);
        }
        return;
    }
    if (!(await (0, agent_integration_1.pathsEqual)(entry.original, entry.action.target))) {
        throw new Error(`安装目标在事务期间发生变化: ${entry.action.target}`);
    }
}
async function findInitiallyMissingDirectories(homePath, transactionRoot, actions) {
    const starts = [
        path.dirname(transactionRoot),
        ...actions.map((action) => path.dirname(action.target)),
        ...actions.flatMap((action) => action.backup ? [path.dirname(action.backup)] : []),
    ];
    const candidates = new Set();
    for (const start of starts) {
        let current = start;
        while (current.startsWith(`${homePath}${path.sep}`)) {
            candidates.add(current);
            current = path.dirname(current);
        }
    }
    const missing = [];
    for (const candidate of candidates) {
        if (!(await fs.pathExists(candidate))) {
            missing.push(candidate);
        }
    }
    return missing.sort((left, right) => right.length - left.length);
}
async function removeInitiallyMissingEmptyDirectories(directories) {
    for (const directory of directories) {
        try {
            await fs.rmdir(directory);
        }
        catch (error) {
            const code = error.code;
            if (code !== 'ENOENT' && code !== 'ENOTEMPTY' && code !== 'EEXIST') {
                throw error;
            }
        }
    }
}
async function stageAction(action, staged, skillSource, commandSource, version) {
    await fs.ensureDir(path.dirname(staged));
    if (path.extname(action.target) === '.md') {
        await fs.copyFile(commandSource, staged);
        return;
    }
    await fs.copy(skillSource, staged);
    await fs.writeJson(path.join(staged, '.alskai-notebank-install.json'), { version }, { spaces: 2 });
}
async function restoreSetupTransaction(entries) {
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
function getBackupTarget(homePath, action, version) {
    return path.join(homePath, '.local', 'state', 'alskai-notebank', 'setup-backups', action.agent, version, path.extname(action.target) === '.md' ? 'command.md' : 'skill');
}
async function targetMatchesPackage(target, packageRoot, version) {
    return (0, agent_integration_1.isClaudeCommandTarget)(target)
        ? (0, agent_integration_1.matchesBundledClaudeCommand)(target, packageRoot)
        : (0, agent_integration_1.matchesBundledSkill)(target, packageRoot, version);
}
