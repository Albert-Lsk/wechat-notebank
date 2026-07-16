"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.inspectPlatform = inspectPlatform;
exports.assertSupportedPlatform = assertSupportedPlatform;
const command_error_1 = require("./command-error");
function inspectPlatform(platform = process.platform, arch = process.arch) {
    return {
        platform,
        arch,
        supported: platform === 'darwin' && arch === 'arm64',
    };
}
function assertSupportedPlatform() {
    const result = inspectPlatform();
    if (!result.supported) {
        throw new command_error_1.CommandError('ENV_UNSUPPORTED', `仅支持 macOS Apple Silicon，当前环境为 ${result.platform}/${result.arch}`);
    }
}
