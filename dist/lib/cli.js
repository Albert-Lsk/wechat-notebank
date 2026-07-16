"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.normalizeCliArgs = normalizeCliArgs;
exports.parseFetchArgs = parseFetchArgs;
exports.parseSetupArgs = parseSetupArgs;
exports.parseDoctorArgs = parseDoctorArgs;
exports.parsePackCreateArgs = parsePackCreateArgs;
exports.parsePackApproveArgs = parsePackApproveArgs;
exports.parsePackUpdateArgs = parsePackUpdateArgs;
exports.parsePackRejectArgs = parsePackRejectArgs;
exports.parsePackRevokeArgs = parsePackRevokeArgs;
exports.parseInitArgs = parseInitArgs;
exports.isJsonOutputRequested = isJsonOutputRequested;
exports.parseImportArgs = parseImportArgs;
const JSON_OPTION = '--json';
function normalizeCliArgs(args) {
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
function parseFetchArgs(args) {
    let url;
    let outputPath;
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
function parseSetupArgs(args) {
    let agents;
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
function parseDoctorArgs(args) {
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
function parsePackCreateArgs(args) {
    const [operation, ...options] = args;
    if (operation !== 'create') {
        throw new Error('pack requires create');
    }
    let sourceFile;
    let manifestFile;
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
            }
            else {
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
function parsePackApproveArgs(args) {
    const [operation, packFile, ...options] = args;
    if (operation !== 'approve') {
        throw new Error('pack requires approve');
    }
    if (!packFile || packFile.startsWith('--')) {
        throw new Error('请提供待审核加工包路径');
    }
    let items;
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
function parsePackUpdateArgs(args) {
    const [operation, packFile, ...options] = args;
    if (operation !== 'update') {
        throw new Error('pack requires update');
    }
    if (!packFile || packFile.startsWith('--')) {
        throw new Error('请提供待审核加工包路径');
    }
    let manifestFile;
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
function parsePackRejectArgs(args) {
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
function parsePackRevokeArgs(args) {
    const [operation, packFile, ...options] = args;
    if (operation !== 'revoke') {
        throw new Error('pack requires revoke');
    }
    if (!packFile || packFile.startsWith('--')) {
        throw new Error('请提供待审核加工包路径');
    }
    let items;
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
function parseInitArgs(args) {
    if (args.length === 0) {
        return {
            kind: 'legacy',
            json: false,
        };
    }
    let scope;
    let archivePath;
    let processingGoal;
    let processingGoalProvided = false;
    let autoProcess;
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
function isJsonOutputRequested(args) {
    return args.some(isJsonOutputOption);
}
function isJsonOutputOption(value) {
    return value === JSON_OPTION;
}
function parseSetupAgents(value) {
    const agents = [...new Set(value.split(',').map((agent) => agent.trim()))];
    if (agents.length === 0 ||
        agents.some((agent) => agent !== 'codex' && agent !== 'claude')) {
        throw new Error('--agents requires codex, claude, or codex,claude');
    }
    return agents;
}
function parseImportArgs(args) {
    let filePath;
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
function looksLikeWechatArticleUrl(value) {
    return /^https?:\/\/mp\.weixin\.qq\.com\/s\//.test(value || '');
}
