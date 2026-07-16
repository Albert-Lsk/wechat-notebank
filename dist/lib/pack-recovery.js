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
exports.recoverPackTransactions = recoverPackTransactions;
exports.recoverPackTransactionsForFile = recoverPackTransactionsForFile;
const path = __importStar(require("path"));
const command_error_1 = require("./command-error");
const file_transaction_1 = require("./file-transaction");
async function recoverPackTransactions(vaultRoot) {
    try {
        await (0, file_transaction_1.recoverInterruptedFileTransactions)(path.resolve(vaultRoot));
    }
    catch (error) {
        throw new command_error_1.CommandError('TRANSACTION_FAILED', `无法恢复上次中断的加工事务: ${(0, command_error_1.getErrorMessage)(error)}`);
    }
}
async function recoverPackTransactionsForFile(packFile) {
    const inbox = path.dirname(path.resolve(packFile));
    if (path.basename(inbox) !== 'Inbox') {
        return;
    }
    await recoverPackTransactions(path.dirname(inbox));
}
