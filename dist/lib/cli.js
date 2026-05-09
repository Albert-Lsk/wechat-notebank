"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.parseFetchArgs = parseFetchArgs;
exports.parseImportArgs = parseImportArgs;
function parseFetchArgs(args) {
    const [url, ...options] = args;
    let outputPath;
    for (let i = 0; i < options.length; i++) {
        const option = options[i];
        if (option === '--output' || option === '-o') {
            const value = options[i + 1];
            if (!value || value.startsWith('-')) {
                throw new Error(`${option} requires a folder path`);
            }
            outputPath = value;
            i++;
            continue;
        }
        throw new Error(`Unknown fetch option: ${option}`);
    }
    return { url, outputPath };
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
