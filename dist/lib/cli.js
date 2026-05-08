"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.parseFetchArgs = parseFetchArgs;
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
