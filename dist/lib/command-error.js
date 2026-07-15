"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CommandError = void 0;
exports.getErrorMessage = getErrorMessage;
class CommandError extends Error {
    constructor(code, message) {
        super(message);
        this.code = code;
        this.name = 'CommandError';
    }
}
exports.CommandError = CommandError;
function getErrorMessage(error) {
    return error instanceof Error ? error.message : String(error);
}
