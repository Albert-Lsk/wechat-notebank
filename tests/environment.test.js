const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const projectRoot = path.resolve(__dirname, '..');
const cliPath = path.join(projectRoot, 'dist', 'index.js');
const {
  inspectPlatform,
  assertSupportedPlatform,
  resolveHomeDir,
  chromeCandidatesFor,
} = require('../dist/lib/environment');

// 1. inspectPlatform：runtimeSupported 覆盖三大平台，setupSupported 仅 darwin/arm64
assert.deepStrictEqual(
  (({ runtimeSupported, setupSupported }) => ({ runtimeSupported, setupSupported }))(
    inspectPlatform('darwin', 'arm64')
  ),
  { runtimeSupported: true, setupSupported: true }
);
for (const [platform, arch] of [
  ['win32', 'x64'],
  ['win32', 'arm64'],
  ['linux', 'x64'],
  ['linux', 'arm64'],
  ['darwin', 'x64'],
]) {
  const check = inspectPlatform(platform, arch);
  assert.strictEqual(check.runtimeSupported, true, `${platform}/${arch} 应可运行核心命令`);
  assert.strictEqual(check.setupSupported, false, `${platform}/${arch} 不应支持 setup`);
}

// 2. assertSupportedPlatform：setup 专用守卫，参数化以便注入平台
assert.doesNotThrow(() => assertSupportedPlatform('darwin', 'arm64'));
for (const [platform, arch] of [
  ['win32', 'x64'],
  ['linux', 'x64'],
  ['darwin', 'x64'],
]) {
  assert.throws(
    () => assertSupportedPlatform(platform, arch),
    (error) => error.code === 'ENV_UNSUPPORTED' &&
      /setup/.test(error.message) &&
      /核心归档命令不受此限制/.test(error.message),
    `${platform}/${arch} 上 setup 应被拒绝`
  );
}

// 3. resolveHomeDir：HOME 优先，其次 USERPROFILE，最后 os.homedir()
assert.strictEqual(resolveHomeDir({ HOME: '/home/h', USERPROFILE: 'C:\\u' }), '/home/h');
assert.strictEqual(resolveHomeDir({ USERPROFILE: 'C:\\u' }), 'C:\\u');
assert.strictEqual(resolveHomeDir({}), os.homedir());

// 4. chromeCandidatesFor：各平台候选列表
assert.deepStrictEqual(chromeCandidatesFor('darwin'), [
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
]);
const winCandidates = chromeCandidatesFor('win32', {
  PROGRAMFILES: 'C:\\Program Files',
  'ProgramFiles(x86)': 'C:\\Program Files (x86)',
  LOCALAPPDATA: 'C:\\Users\\u\\AppData\\Local',
});
assert.deepStrictEqual(winCandidates, [
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Users\\u\\AppData\\Local\\Google\\Chrome\\Application\\chrome.exe',
]);
assert.deepStrictEqual(
  chromeCandidatesFor('win32', { PROGRAMFILES: 'C:\\Program Files' }),
  ['C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'],
  '缺失的环境变量应跳过对应候选'
);
assert.deepStrictEqual(chromeCandidatesFor('win32', {}), []);
assert.deepStrictEqual(chromeCandidatesFor('linux'), [
  '/usr/bin/google-chrome',
  '/usr/bin/google-chrome-stable',
  '/opt/google/chrome/chrome',
]);
assert.deepStrictEqual(chromeCandidatesFor('freebsd'), []);

// 5. 源码层守卫：assertSupportedPlatform 只允许被 setup.ts 和 environment.ts 引用，
//    防止未来有人把 setup 的平台门槛误加到核心命令路径上。
function listTsFiles(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const absolute = path.join(dir, entry.name);
    return entry.isDirectory() ? listTsFiles(absolute) : [absolute];
  });
}
const importers = listTsFiles(path.join(projectRoot, 'src'))
  .filter((file) => fs.readFileSync(file, 'utf8').includes('assertSupportedPlatform'))
  .map((file) => path.relative(projectRoot, file).split(path.sep).join('/'));
assert.deepStrictEqual(importers.sort(), [
  'src/commands/setup.ts',
  'src/lib/environment.ts',
]);

// 6. CLI 回归：setup 在 win32 上必须被守卫拒绝（防止守卫被放宽或绕过）
function runCliWithRuntime(args, runtime) {
  const statements = [
    `Object.defineProperty(process, 'platform', { value: ${JSON.stringify(runtime.platform)} });`,
    `Object.defineProperty(process, 'arch', { value: ${JSON.stringify(runtime.arch)} });`,
    `process.argv = [process.execPath, ${JSON.stringify(cliPath)}, ...${JSON.stringify(args)}];`,
    `require(${JSON.stringify(cliPath)});`,
  ];
  return spawnSync(process.execPath, ['-e', statements.join('')], {
    cwd: projectRoot,
    encoding: 'utf8',
  });
}
const winSetup = runCliWithRuntime(['setup', '--agents', 'codex', '--json'], {
  platform: 'win32',
  arch: 'x64',
});
assert.strictEqual(winSetup.status, 1, winSetup.stderr || winSetup.stdout);
const winSetupOutput = JSON.parse(winSetup.stdout);
assert.strictEqual(winSetupOutput.ok, false);
assert.strictEqual(winSetupOutput.error.code, 'ENV_UNSUPPORTED');
// 核心命令不受平台守卫影响：--version 在 win32 注入下正常输出
const winVersion = runCliWithRuntime(['--version'], { platform: 'win32', arch: 'x64' });
assert.strictEqual(winVersion.status, 0, winVersion.stderr || winVersion.stdout);
assert.strictEqual(winVersion.stdout.trim(), require('../package.json').version);

console.log('environment tests passed');
