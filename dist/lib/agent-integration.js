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
exports.getAgentSkillTarget = getAgentSkillTarget;
exports.getClaudeCommandTarget = getClaudeCommandTarget;
exports.isClaudeCommandTarget = isClaudeCommandTarget;
exports.matchesBundledSkill = matchesBundledSkill;
exports.matchesBundledClaudeCommand = matchesBundledClaudeCommand;
exports.pathsEqual = pathsEqual;
const fs = __importStar(require("fs-extra"));
const path = __importStar(require("path"));
function getAgentSkillTarget(homePath, agent) {
    return path.join(homePath, `.${agent}`, 'skills', 'alskai-notebank');
}
function getClaudeCommandTarget(homePath) {
    return path.join(homePath, '.claude', 'commands', 'alskai-notebank.md');
}
function isClaudeCommandTarget(target) {
    return path.basename(target) === 'alskai-notebank.md' &&
        path.basename(path.dirname(target)) === 'commands';
}
async function matchesBundledSkill(target, packageRoot, version) {
    if (!(await fs.pathExists(target))) {
        return false;
    }
    try {
        const receipt = await fs.readJson(path.join(target, '.alskai-notebank-install.json'));
        if (receipt.version !== version) {
            return false;
        }
    }
    catch {
        return false;
    }
    return pathsEqual(path.join(packageRoot, 'skills', 'alskai-notebank'), target, new Set(['.alskai-notebank-install.json']));
}
async function matchesBundledClaudeCommand(target, packageRoot) {
    return pathsEqual(path.join(packageRoot, '.claude', 'commands', 'alskai-notebank.md'), target);
}
async function pathsEqual(source, target, ignoredNames = new Set()) {
    if (!(await fs.pathExists(source)) || !(await fs.pathExists(target))) {
        return false;
    }
    const [sourceStat, targetStat] = await Promise.all([
        fs.stat(source),
        fs.stat(target),
    ]);
    if (sourceStat.isDirectory() !== targetStat.isDirectory()) {
        return false;
    }
    if (!sourceStat.isDirectory()) {
        const [sourceContent, targetContent] = await Promise.all([
            fs.readFile(source),
            fs.readFile(target),
        ]);
        return sourceContent.equals(targetContent);
    }
    const sourceEntries = (await fs.readdir(source))
        .filter((entry) => !ignoredNames.has(entry))
        .sort();
    const targetEntries = (await fs.readdir(target))
        .filter((entry) => !ignoredNames.has(entry))
        .sort();
    if (sourceEntries.join('\0') !== targetEntries.join('\0')) {
        return false;
    }
    for (const entry of sourceEntries) {
        if (!(await pathsEqual(path.join(source, entry), path.join(target, entry), ignoredNames))) {
            return false;
        }
    }
    return true;
}
