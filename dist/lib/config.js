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
exports.getConfigPath = getConfigPath;
exports.configExists = configExists;
exports.readConfig = readConfig;
exports.readScopedConfig = readScopedConfig;
exports.writeConfig = writeConfig;
exports.createConfig = createConfig;
const fs = __importStar(require("fs-extra"));
const os = __importStar(require("os"));
const path = __importStar(require("path"));
const storage_1 = require("./storage");
const CONFIG_FILE = '.wechat-notebank.json';
const GLOBAL_CONFIG_DIR = 'alskai-notebank';
function getConfigPath(scope = 'project') {
    if (scope === 'global') {
        const homePath = process.env.HOME || os.homedir();
        return path.join(homePath, '.config', GLOBAL_CONFIG_DIR, 'config.json');
    }
    return path.resolve(process.cwd(), CONFIG_FILE);
}
async function configExists() {
    return ((await fs.pathExists(getConfigPath('project'))) ||
        (await fs.pathExists(getConfigPath('global'))));
}
async function readConfig() {
    const globalConfig = await readScopedConfig('global');
    const projectConfig = await readScopedConfig('project');
    if (!globalConfig && !projectConfig) {
        return null;
    }
    const merged = {
        ...globalConfig,
        ...projectConfig,
    };
    if (!merged.archivePath) {
        throw new Error('配置缺少有效的 archivePath');
    }
    return {
        ...merged,
        archivePath: merged.archivePath,
        processingGoal: merged.processingGoal?.trim() || undefined,
        autoProcess: merged.autoProcess ?? false,
    };
}
async function readScopedConfig(scope) {
    const configPath = getConfigPath(scope);
    if (!(await fs.pathExists(configPath))) {
        return null;
    }
    let data;
    try {
        data = await fs.readJson(configPath);
    }
    catch (error) {
        throw new Error(`无法解析配置 ${configPath}: ${getErrorMessage(error)}`);
    }
    validateStoredConfig(data, configPath);
    return data;
}
async function writeConfig(config, scope = 'project') {
    const configPath = getConfigPath(scope);
    const tempPath = `${configPath}.tmp-${process.pid}`;
    validateStoredConfig(config, configPath);
    await fs.ensureDir(path.dirname(configPath));
    try {
        await fs.writeJson(tempPath, config, { spaces: 2 });
        await fs.rename(tempPath, configPath);
    }
    finally {
        if (await fs.pathExists(tempPath)) {
            await fs.remove(tempPath);
        }
    }
}
async function createConfig(name, basePath) {
    const config = {
        name,
        archivePath: (0, storage_1.getL1Path)(basePath),
        createdAt: new Date().toISOString(),
    };
    await writeConfig(config);
    return config;
}
function validateStoredConfig(data, configPath) {
    if (!data || typeof data !== 'object' || Array.isArray(data)) {
        throw new Error(`配置格式无效: ${configPath}`);
    }
    const config = data;
    validateOptionalString(config, 'name', configPath, false);
    validateOptionalString(config, 'archivePath', configPath, false);
    validateOptionalString(config, 'createdAt', configPath, false);
    validateOptionalString(config, 'processingGoal', configPath, true);
    if (config.autoProcess !== undefined && typeof config.autoProcess !== 'boolean') {
        throw new Error(`配置字段 autoProcess 必须是布尔值: ${configPath}`);
    }
}
function validateOptionalString(config, key, configPath, allowEmpty) {
    const value = config[key];
    if (value === undefined) {
        return;
    }
    if (typeof value !== 'string' || (!allowEmpty && value.trim().length === 0)) {
        throw new Error(`配置字段 ${key} 必须是${allowEmpty ? '' : '非空'}字符串: ${configPath}`);
    }
}
function getErrorMessage(error) {
    return error instanceof Error ? error.message : String(error);
}
