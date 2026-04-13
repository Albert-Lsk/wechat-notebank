import * as inquirer from 'inquirer';
import * as path from 'path';
import { ensureDirectories, FOLDER_L1, FOLDER_L2, FOLDER_L3, FOLDER_L4 } from '../lib/storage';
import { createConfig, readConfig } from '../lib/config';

export async function initCommand(): Promise<void> {
  console.log('🤖 首次使用！请完成初始化...\n');

  const config = await readConfig();

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
    await ensureDirectories(defaultBasePath);
    await createConfig(defaultName, defaultBasePath);
    printSuccess(defaultBasePath);
    return;
  }

  const answers = await inquirer.prompt([
    {
      type: 'input',
      name: 'basePath',
      message: '📁 请输入存储路径（默认: ~/WechatNotes）：',
      default: '~/WechatNotes',
      validate: (input: string) => {
        const trimmed = input.trim() || '~/WechatNotes';
        return trimmed.length > 0 || '路径不能为空';
      },
    },
    {
      type: 'input',
      name: 'name',
      message: '📝 请输入知识库名称（默认: MyNotes）：',
      default: 'MyNotes',
      validate: (input: string) => {
        const trimmed = input.trim() || 'MyNotes';
        return trimmed.length > 0 || '名称不能为空';
      },
    },
  ]);

  const basePath = path.resolve(
    answers.basePath.trim().replace(/^~/, process.env.HOME || '')
  );
  const name = answers.name.trim() || 'MyNotes';

  await ensureDirectories(basePath);
  await createConfig(name, basePath);

  printSuccess(basePath);
  console.log('\n开始使用：wechat-notebank fetch <文章链接>');
}

function printSuccess(basePath: string): void {
  console.log('\n✅ 初始化完成！');
  console.log(`   📁 ${basePath}/`);
  console.log(`   ├── 📁 ${FOLDER_L1}/`);
  console.log(`   │   └── 📁 WeChat/`);
  console.log(`   ├── 📁 ${FOLDER_L2}/`);
  console.log(`   ├── 📁 ${FOLDER_L3}/`);
  console.log(`   └── 📁 ${FOLDER_L4}/`);
}
