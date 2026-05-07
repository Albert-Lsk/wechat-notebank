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
exports.writeConfig = writeConfig;
exports.createConfig = createConfig;
const fs = __importStar(require("fs-extra"));
const path = __importStar(require("path"));
const storage_1 = require("./storage");
const CONFIG_FILE = '.wechat-notebank.json';
function getConfigPath() {
    return path.resolve(process.cwd(), CONFIG_FILE);
}
async function configExists() {
    return fs.pathExists(getConfigPath());
}
async function readConfig() {
    const configPath = getConfigPath();
    if (!(await fs.pathExists(configPath))) {
        return null;
    }
    const data = await fs.readJson(configPath);
    return data;
}
async function writeConfig(config) {
    const configPath = getConfigPath();
    await fs.writeJson(configPath, config, { spaces: 2 });
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
