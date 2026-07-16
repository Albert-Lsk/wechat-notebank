"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.normalizeCliArgs = normalizeCliArgs;
exports.parseFetchArgs = parseFetchArgs;
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
function parseInitArgs(args) {
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
    const hasOptions = args.length > 0;
    if (hasOptions && !scope) {
        throw new Error('请提供 --scope <global|project>');
    }
    if (hasOptions && !archivePath) {
        throw new Error('请提供 --archive-path <path>');
    }
    return {
        scope,
        archivePath,
        processingGoal,
        processingGoalProvided,
        autoProcess,
        json,
        hasOptions,
    };
}
function isJsonOutputRequested(args) {
    return args.some(isJsonOutputOption);
}
function isJsonOutputOption(value) {
    return value === JSON_OPTION;
}
function parseImportArgs(args) {
    const [filePath, ...options] = args;
    if (!filePath) {
        throw new Error('请提供 Excel 文件地址');
    }
    for (const option of options) {
        throw new Error(`Unknown import option: ${option}`);
    }
    return { filePath };
}
function looksLikeWechatArticleUrl(value) {
    return /^https?:\/\/mp\.weixin\.qq\.com\/s\//.test(value || '');
}
