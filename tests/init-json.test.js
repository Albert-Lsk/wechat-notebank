const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const projectRoot = path.resolve(__dirname, '..');
const cliPath = path.join(projectRoot, 'dist', 'index.js');
const mockPuppeteerPath = path.join(__dirname, 'helpers', 'mock-puppeteer.js');
const articleFixturePath = path.join(__dirname, 'fixtures', 'wechat-article.html');
const articleEnv = {
  NODE_OPTIONS: `--require=${mockPuppeteerPath}`,
  WECHAT_NOTEBANK_TEST_HTML_FILE: articleFixturePath,
};

function runCli(args, homePath, cwdPath, extraEnv = {}) {
  return spawnSync(process.execPath, [cliPath, ...args], {
    cwd: cwdPath,
    encoding: 'utf8',
    env: {
      ...process.env,
      HOME: homePath,
      ...extraEnv,
    },
  });
}

function createSandbox(name) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), `wechat-notebank-${name}-`));
  const home = path.join(root, 'home');
  const project = path.join(root, 'project');
  fs.mkdirSync(home, { recursive: true });
  fs.mkdirSync(project, { recursive: true });
  return { root, home, project };
}

function parseJsonOutput(result) {
  return JSON.parse(result.stdout);
}

const { root: tempRoot, home: homePath, project: projectPath } = createSandbox('init');
const globalArchivePath = path.join(tempRoot, 'global-archive');

const globalResult = runCli([
  'init',
  '--scope',
  'global',
  '--archive-path',
  globalArchivePath,
  '--json',
], homePath, projectPath);

assert.strictEqual(globalResult.status, 0, globalResult.stderr || globalResult.stdout);
const globalOutput = parseJsonOutput(globalResult);
const globalConfigPath = path.join(homePath, '.config', 'alskai-notebank', 'config.json');
assert.deepStrictEqual(globalOutput, {
  ok: true,
  command: 'init',
  status: 'configured',
  result: {
    scope: 'global',
    configFile: globalConfigPath,
    archivePath: globalArchivePath,
    processingGoal: null,
    autoProcess: false,
  },
});
assert.strictEqual(globalResult.stderr, '');
assert.ok(fs.existsSync(globalArchivePath));

const globalConfig = JSON.parse(fs.readFileSync(globalConfigPath, 'utf8'));
assert.strictEqual(globalConfig.name, 'MyNotes');
assert.strictEqual(globalConfig.archivePath, globalArchivePath);
assert.strictEqual(globalConfig.autoProcess, false);
assert.strictEqual(typeof globalConfig.createdAt, 'string');
assert.strictEqual(Object.hasOwn(globalConfig, 'processingGoal'), false);

const {
  root: inheritanceRoot,
  home: inheritanceHome,
  project: inheritanceProject,
} = createSandbox('inherit');
const inheritedGlobalArchive = path.join(inheritanceRoot, 'global-archive');
const inheritedProjectArchive = path.join(inheritanceRoot, 'project-archive');

const globalWithGoalResult = runCli([
  'init',
  '--scope',
  'global',
  '--archive-path',
  inheritedGlobalArchive,
  '--processing-goal',
  '提炼适合所有知识工作者复用的观点',
  '--auto-process',
  '--json',
], inheritanceHome, inheritanceProject);
assert.strictEqual(
  globalWithGoalResult.status,
  0,
  globalWithGoalResult.stderr || globalWithGoalResult.stdout
);

const projectOnlyArchiveResult = runCli([
  'init',
  '--scope',
  'project',
  '--archive-path',
  inheritedProjectArchive,
  '--json',
], inheritanceHome, inheritanceProject);
assert.strictEqual(
  projectOnlyArchiveResult.status,
  0,
  projectOnlyArchiveResult.stderr || projectOnlyArchiveResult.stdout
);
const projectOnlyArchiveOutput = parseJsonOutput(projectOnlyArchiveResult);
assert.strictEqual(
  projectOnlyArchiveOutput.result.processingGoal,
  '提炼适合所有知识工作者复用的观点'
);
assert.strictEqual(projectOnlyArchiveOutput.result.autoProcess, true);

const projectConfigPath = path.join(inheritanceProject, '.wechat-notebank.json');
const projectConfig = JSON.parse(fs.readFileSync(projectConfigPath, 'utf8'));
assert.strictEqual(projectConfig.archivePath, inheritedProjectArchive);
assert.strictEqual(Object.hasOwn(projectConfig, 'name'), false);
assert.strictEqual(Object.hasOwn(projectConfig, 'createdAt'), false);
assert.strictEqual(Object.hasOwn(projectConfig, 'processingGoal'), false);
assert.strictEqual(Object.hasOwn(projectConfig, 'autoProcess'), false);

const inheritedFetchResult = runCli([
  'fetch',
  'https://mp.weixin.qq.com/s/inherited-config',
  '--json',
], inheritanceHome, inheritanceProject, articleEnv);
assert.strictEqual(
  inheritedFetchResult.status,
  0,
  inheritedFetchResult.stderr || inheritedFetchResult.stdout
);
const inheritedFetchOutput = parseJsonOutput(inheritedFetchResult);
assert.strictEqual(inheritedFetchOutput.result.archiveRoot, inheritedProjectArchive);
assert.strictEqual(
  inheritedFetchOutput.result.processingGoal,
  '提炼适合所有知识工作者复用的观点'
);
assert.strictEqual(inheritedFetchOutput.result.autoProcess, true);

const projectOverrideResult = runCli([
  'init',
  '--scope',
  'project',
  '--archive-path',
  inheritedProjectArchive,
  '--processing-goal',
  '提炼项目专用案例',
  '--no-auto-process',
  '--json',
], inheritanceHome, inheritanceProject);
assert.strictEqual(
  projectOverrideResult.status,
  0,
  projectOverrideResult.stderr || projectOverrideResult.stdout
);
const projectOverrideOutput = parseJsonOutput(projectOverrideResult);
assert.strictEqual(projectOverrideOutput.result.processingGoal, '提炼项目专用案例');
assert.strictEqual(projectOverrideOutput.result.autoProcess, false);

const overriddenFetchResult = runCli([
  'fetch',
  'https://mp.weixin.qq.com/s/project-overrides',
  '--json',
], inheritanceHome, inheritanceProject, articleEnv);
assert.strictEqual(
  overriddenFetchResult.status,
  0,
  overriddenFetchResult.stderr || overriddenFetchResult.stdout
);
const overriddenFetchOutput = parseJsonOutput(overriddenFetchResult);
assert.strictEqual(overriddenFetchOutput.result.archiveRoot, inheritedProjectArchive);
assert.strictEqual(overriddenFetchOutput.result.processingGoal, '提炼项目专用案例');
assert.strictEqual(overriddenFetchOutput.result.autoProcess, false);

const requestArchivePath = path.join(inheritanceRoot, 'request-archive');
const requestOverrideResult = runCli([
  'fetch',
  'https://mp.weixin.qq.com/s/request-overrides',
  '--output',
  requestArchivePath,
  '--json',
], inheritanceHome, inheritanceProject, articleEnv);
assert.strictEqual(
  requestOverrideResult.status,
  0,
  requestOverrideResult.stderr || requestOverrideResult.stdout
);
const requestOverrideOutput = parseJsonOutput(requestOverrideResult);
assert.strictEqual(requestOverrideOutput.result.archiveRoot, requestArchivePath);
assert.strictEqual(requestOverrideOutput.result.processingGoal, '提炼项目专用案例');
assert.strictEqual(requestOverrideOutput.result.autoProcess, false);

const inheritedGlobalConfigPath = path.join(
  inheritanceHome,
  '.config',
  'alskai-notebank',
  'config.json'
);
const globalBeforeUpdate = JSON.parse(fs.readFileSync(inheritedGlobalConfigPath, 'utf8'));
const updatedGlobalArchive = path.join(inheritanceRoot, 'updated-global-archive');
const updateGlobalResult = runCli([
  'init',
  '--scope',
  'global',
  '--archive-path',
  updatedGlobalArchive,
  '--json',
], inheritanceHome, inheritanceProject);
assert.strictEqual(
  updateGlobalResult.status,
  0,
  updateGlobalResult.stderr || updateGlobalResult.stdout
);
const globalAfterUpdate = JSON.parse(fs.readFileSync(inheritedGlobalConfigPath, 'utf8'));
assert.strictEqual(globalAfterUpdate.archivePath, updatedGlobalArchive);
assert.strictEqual(globalAfterUpdate.processingGoal, globalBeforeUpdate.processingGoal);
assert.strictEqual(globalAfterUpdate.autoProcess, globalBeforeUpdate.autoProcess);
assert.strictEqual(globalAfterUpdate.createdAt, globalBeforeUpdate.createdAt);

const clearProjectGoalResult = runCli([
  'init',
  '--scope',
  'project',
  '--archive-path',
  inheritedProjectArchive,
  '--processing-goal',
  '',
  '--json',
], inheritanceHome, inheritanceProject);
assert.strictEqual(
  clearProjectGoalResult.status,
  0,
  clearProjectGoalResult.stderr || clearProjectGoalResult.stdout
);
assert.strictEqual(parseJsonOutput(clearProjectGoalResult).result.processingGoal, null);

const clearedGoalFetchResult = runCli([
  'fetch',
  'https://mp.weixin.qq.com/s/cleared-goal',
  '--json',
], inheritanceHome, inheritanceProject, articleEnv);
assert.strictEqual(
  clearedGoalFetchResult.status,
  0,
  clearedGoalFetchResult.stderr || clearedGoalFetchResult.stdout
);
const clearedGoalFetchOutput = parseJsonOutput(clearedGoalFetchResult);
assert.strictEqual(clearedGoalFetchOutput.result.processingGoal, null);
assert.strictEqual(clearedGoalFetchOutput.result.autoProcess, false);

const {
  root: invalidRoot,
  home: invalidHome,
  project: invalidProject,
} = createSandbox('invalid');
const validGlobalArchive = path.join(invalidRoot, 'global-archive');
const validGlobalResult = runCli([
  'init',
  '--scope',
  'global',
  '--archive-path',
  validGlobalArchive,
  '--json',
], invalidHome, invalidProject);
assert.strictEqual(validGlobalResult.status, 0, validGlobalResult.stderr || validGlobalResult.stdout);

const invalidProjectConfigPath = path.join(invalidProject, '.wechat-notebank.json');
const invalidProjectConfig = '{"archivePath":42,"autoProcess":"yes"}';
fs.writeFileSync(invalidProjectConfigPath, invalidProjectConfig);

const invalidFetchResult = runCli([
  'fetch',
  'https://mp.weixin.qq.com/s/invalid-project-config',
  '--json',
], invalidHome, invalidProject, articleEnv);
assert.strictEqual(invalidFetchResult.status, 1);
const invalidFetchOutput = parseJsonOutput(invalidFetchResult);
assert.strictEqual(invalidFetchOutput.error.code, 'CONFIG_INVALID');

const rejectedArchivePath = path.join(invalidRoot, 'must-not-be-created');
const invalidInitResult = runCli([
  'init',
  '--scope',
  'project',
  '--archive-path',
  rejectedArchivePath,
  '--json',
], invalidHome, invalidProject);
assert.strictEqual(invalidInitResult.status, 1);
const invalidInitOutput = parseJsonOutput(invalidInitResult);
assert.strictEqual(invalidInitOutput.ok, false);
assert.strictEqual(invalidInitOutput.command, 'init');
assert.strictEqual(invalidInitOutput.status, 'failed');
assert.strictEqual(invalidInitOutput.error.code, 'CONFIG_INVALID');
assert.strictEqual(fs.readFileSync(invalidProjectConfigPath, 'utf8'), invalidProjectConfig);
assert.strictEqual(fs.existsSync(rejectedArchivePath), false);

const {
  home: writeFailureHome,
  project: writeFailureProject,
} = createSandbox('write-fail');
const writeFailureResult = runCli([
  'init',
  '--scope',
  'project',
  '--archive-path',
  path.join('/dev/null', 'archive'),
  '--json',
], writeFailureHome, writeFailureProject);
assert.strictEqual(writeFailureResult.status, 1);
const writeFailureOutput = parseJsonOutput(writeFailureResult);
assert.strictEqual(writeFailureOutput.error.code, 'TRANSACTION_FAILED');
assert.strictEqual(
  fs.existsSync(path.join(writeFailureProject, '.wechat-notebank.json')),
  false
);

const configWriteFailureRoot = fs.mkdtempSync(
  path.join(os.tmpdir(), 'wechat-notebank-config-write-fail-')
);
const homeFilePath = path.join(configWriteFailureRoot, 'home-is-a-file');
const configWriteFailureProject = path.join(configWriteFailureRoot, 'project');
const rolledBackArchivePath = path.join(configWriteFailureRoot, 'archive-must-rollback');
fs.writeFileSync(homeFilePath, 'not a directory');
fs.mkdirSync(configWriteFailureProject, { recursive: true });
const configWriteFailureResult = runCli([
  'init',
  '--scope',
  'global',
  '--archive-path',
  rolledBackArchivePath,
  '--json',
], homeFilePath, configWriteFailureProject);
assert.strictEqual(configWriteFailureResult.status, 1);
assert.strictEqual(
  parseJsonOutput(configWriteFailureResult).error.code,
  'TRANSACTION_FAILED'
);
assert.strictEqual(fs.existsSync(rolledBackArchivePath), false);

const missingRequiredResult = runCli([
  'init',
  '--json',
], invalidHome, invalidProject);
assert.strictEqual(missingRequiredResult.status, 1);
const missingRequiredOutput = parseJsonOutput(missingRequiredResult);
assert.strictEqual(missingRequiredOutput.error.code, 'CLI_USAGE_ERROR');
assert.match(missingRequiredOutput.error.message, /--scope/);

const {
  root: legacyRoot,
  home: legacyHome,
  project: legacyProject,
} = createSandbox('legacy');
const legacyArchive = path.join(legacyRoot, 'legacy-archive');
fs.writeFileSync(
  path.join(legacyProject, '.wechat-notebank.json'),
  JSON.stringify({
    name: 'Legacy Notes',
    archivePath: legacyArchive,
    createdAt: '2026-01-01T00:00:00.000Z',
  })
);
const legacyFetchResult = runCli([
  'fetch',
  'https://mp.weixin.qq.com/s/legacy-config',
  '--json',
], legacyHome, legacyProject, articleEnv);
assert.strictEqual(legacyFetchResult.status, 0, legacyFetchResult.stderr || legacyFetchResult.stdout);
const legacyFetchOutput = parseJsonOutput(legacyFetchResult);
assert.strictEqual(legacyFetchOutput.result.archiveRoot, legacyArchive);
assert.strictEqual(legacyFetchOutput.result.processingGoal, null);
assert.strictEqual(legacyFetchOutput.result.autoProcess, false);

const { home: bareInitHome, project: bareInitProject } = createSandbox('bare-init');
const bareInitResult = runCli(['init'], bareInitHome, bareInitProject);
assert.strictEqual(bareInitResult.status, 0, bareInitResult.stderr || bareInitResult.stdout);
assert.match(bareInitResult.stdout, /初始化完成/);
const bareProjectConfig = JSON.parse(
  fs.readFileSync(path.join(bareInitProject, '.wechat-notebank.json'), 'utf8')
);
assert.strictEqual(
  path.relative(fs.realpathSync(bareInitProject), bareProjectConfig.archivePath),
  path.join('output', 'L1_原文', 'WeChat')
);

console.log('init json tests passed');
