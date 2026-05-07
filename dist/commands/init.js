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
exports.initCommand = initCommand;
const inquirer = __importStar(require("inquirer"));
const path = __importStar(require("path"));
const storage_1 = require("../lib/storage");
const config_1 = require("../lib/config");
async function initCommand() {
    console.log('🤖 首次使用！请完成初始化...\n');
    const config = await (0, config_1.readConfig)();
    if (config) {
        console.log(`✅ 已存在配置，知识库名称：${config.name}`);
        console.log(`📁 存档路径：${config.archivePath}`);
        return;
    }
    // 非交互模式使用默认值
    const isInteractive = process.stdin.isTTY;
    if (!isInteractive) {
        const defaultBasePath = path.resolve(process.cwd(), 'output');
        const defaultName = 'MyNotes';
        console.log('📁 使用默认路径：./output');
        console.log('📝 使用默认名称：MyNotes\n');
        await (0, storage_1.ensureDirectories)(defaultBasePath);
        await (0, config_1.createConfig)(defaultName, defaultBasePath);
        printSuccess(defaultBasePath);
        return;
    }
    const answers = await inquirer.prompt([
        {
            type: 'input',
            name: 'basePath',
            message: '📁 请输入存储路径（默认: ~/WechatNotes）：',
            default: '~/WechatNotes',
            validate: (input) => {
                const trimmed = input.trim() || '~/WechatNotes';
                return trimmed.length > 0 || '路径不能为空';
            },
        },
        {
            type: 'input',
            name: 'name',
            message: '📝 请输入知识库名称（默认: MyNotes）：',
            default: 'MyNotes',
            validate: (input) => {
                const trimmed = input.trim() || 'MyNotes';
                return trimmed.length > 0 || '名称不能为空';
            },
        },
    ]);
    const basePath = path.resolve(answers.basePath.trim().replace(/^~/, process.env.HOME || ''));
    const name = answers.name.trim() || 'MyNotes';
    await (0, storage_1.ensureDirectories)(basePath);
    await (0, config_1.createConfig)(name, basePath);
    printSuccess(basePath);
    console.log('\n开始使用：wechat-notebank fetch <文章链接>');
}
function printSuccess(basePath) {
    console.log('\n✅ 初始化完成！');
    console.log(`   📁 ${basePath}/`);
    console.log(`   ├── 📁 ${storage_1.FOLDER_L1}/`);
    console.log(`   │   └── 📁 WeChat/`);
    console.log(`   ├── 📁 ${storage_1.FOLDER_L2}/`);
    console.log(`   ├── 📁 ${storage_1.FOLDER_L3}/`);
    console.log(`   └── 📁 ${storage_1.FOLDER_L4}/`);
}
