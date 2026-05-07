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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.FOLDER_L4 = exports.FOLDER_L3 = exports.FOLDER_L2 = exports.FOLDER_L1 = void 0;
exports.ensureDirectories = ensureDirectories;
exports.generateFilename = generateFilename;
exports.saveArticle = saveArticle;
exports.getL1Path = getL1Path;
const fs = __importStar(require("fs-extra"));
const path = __importStar(require("path"));
const gray_matter_1 = __importDefault(require("gray-matter"));
exports.FOLDER_L1 = 'L1_原文'; // 公众号文章原文
exports.FOLDER_L2 = 'L2_原子卡片'; // 文章的原子想法卡片
exports.FOLDER_L3 = 'L3_引用素材'; // 可以直接引用的素材
exports.FOLDER_L4 = 'L4_原创文章'; // 根据 L3 素材重新写的文章
async function ensureDirectories(basePath) {
    const dirs = [
        basePath,
        path.join(basePath, exports.FOLDER_L1, 'WeChat'),
        path.join(basePath, exports.FOLDER_L2),
        path.join(basePath, exports.FOLDER_L3),
        path.join(basePath, exports.FOLDER_L4),
    ];
    for (const dir of dirs) {
        await fs.ensureDir(dir);
    }
}
function generateFilename(title) {
    const timestamp = Date.now();
    const safeTitle = title
        .replace(/[^\u4e00-\u9fa5a-zA-Z0-9]/g, '')
        .slice(0, 20);
    return `${timestamp}-${safeTitle || 'untitled'}.md`;
}
async function saveArticle(archivePath, title, content, meta) {
    const filename = generateFilename(title);
    const filePath = path.join(archivePath, filename);
    const fileContent = gray_matter_1.default.stringify(content, meta);
    await fs.writeFile(filePath, fileContent, 'utf-8');
    return filePath;
}
function getL1Path(basePath) {
    return path.join(basePath, exports.FOLDER_L1, 'WeChat');
}
