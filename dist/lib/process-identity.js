"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getProcessIdentity = getProcessIdentity;
const child_process_1 = require("child_process");
const util_1 = require("util");
const PROCESS_IDENTITY_CACHE_MS = 1000;
const execFileAsync = (0, util_1.promisify)(child_process_1.execFile);
const processIdentityCache = new Map();
async function getProcessIdentity(pid, options = {}) {
    const cached = processIdentityCache.get(pid);
    if (!options.fresh && cached && cached.expiresAt > Date.now()) {
        return cached.result;
    }
    let result;
    try {
        const { stdout } = await execFileAsync('/bin/ps', [
            '-p',
            String(pid),
            '-o',
            'lstart=',
        ], {
            env: {
                ...process.env,
                TZ: 'UTC',
                LC_ALL: 'C',
                LANG: 'C',
            },
        });
        const identity = stdout.trim();
        result = identity
            ? { status: 'found', identity }
            : { status: 'unknown' };
    }
    catch (error) {
        result = hasNumericErrorCode(error, 1)
            ? { status: 'missing' }
            : { status: 'unknown' };
    }
    processIdentityCache.set(pid, {
        result,
        expiresAt: Date.now() + PROCESS_IDENTITY_CACHE_MS,
    });
    return result;
}
function hasNumericErrorCode(error, code) {
    return Boolean(error &&
        typeof error === 'object' &&
        'code' in error &&
        error.code === code);
}
