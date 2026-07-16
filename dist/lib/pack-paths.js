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
exports.packFilePath = packFilePath;
exports.atomicNoteFilePath = atomicNoteFilePath;
exports.materialsFilePath = materialsFilePath;
exports.materialsStateFilePath = materialsStateFilePath;
exports.reflectionFilePath = reflectionFilePath;
exports.reflectionStateFilePath = reflectionStateFilePath;
exports.toWikiPath = toWikiPath;
const path = __importStar(require("path"));
const pack_manifest_1 = require("./pack-manifest");
const storage_1 = require("./storage");
function packFilePath(vaultRoot, sourceFile, packId, revision) {
    return path.join(vaultRoot, 'Inbox', `${sourceStem(sourceFile)}-${packId.slice(0, 12)}-r${revision}.md`);
}
function atomicNoteFilePath(vaultRoot, sourceFile, packId, revision, itemId) {
    return path.join(vaultRoot, storage_1.FOLDER_L2, `${sourceStem(sourceFile)}-${packId.slice(0, 12)}-r${revision}-${itemId}.md`);
}
function materialsFilePath(vaultRoot, sourceFile, sourceUrl) {
    return path.join(vaultRoot, storage_1.FOLDER_L3, `${sourceStem(sourceFile)}-${(0, pack_manifest_1.computeSourceId)(sourceUrl).slice(0, 12)}.md`);
}
function materialsStateFilePath(vaultRoot, sourceUrl) {
    return path.join(vaultRoot, '.alskai-notebank', 'materials', `${(0, pack_manifest_1.computeSourceId)(sourceUrl)}.json`);
}
function reflectionFilePath(vaultRoot, sourceFile, sourceUrl) {
    return path.join(vaultRoot, storage_1.FOLDER_L4, `${sourceStem(sourceFile)}-${(0, pack_manifest_1.computeSourceId)(sourceUrl).slice(0, 12)}.md`);
}
function reflectionStateFilePath(vaultRoot, sourceUrl) {
    return path.join(vaultRoot, '.alskai-notebank', 'reflections', `${(0, pack_manifest_1.computeSourceId)(sourceUrl)}.json`);
}
function toWikiPath(vaultRoot, filePath) {
    return path.relative(vaultRoot, filePath)
        .replace(/\.md$/i, '')
        .split(path.sep)
        .join('/');
}
function sourceStem(sourceFile) {
    return path.basename(sourceFile, path.extname(sourceFile));
}
