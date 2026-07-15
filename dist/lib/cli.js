"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.normalizeCliArgs = normalizeCliArgs;
exports.parseFetchArgs = parseFetchArgs;
exports.parseImportArgs = parseImportArgs;
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
        if (option === '--json') {
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
