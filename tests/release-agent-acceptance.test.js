const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

if (process.platform !== 'darwin' || process.arch !== 'arm64') {
  console.log('release agent acceptance tests skipped: requires macOS Apple Silicon');
  process.exit(0);
}

const projectRoot = path.resolve(__dirname, '..');
const sandbox = fs.mkdtempSync(path.join(os.tmpdir(), 'notebank-release-agent-'));
const releasePath = path.join(sandbox, 'release');
const homePath = path.join(sandbox, 'home');
const installPrefix = path.join(homePath, '.local');
const projectPath = path.join(sandbox, 'project');
const archivePath = path.join(homePath, 'vault', 'L1_原文', 'WeChat');
fs.mkdirSync(homePath, { recursive: true });
fs.mkdirSync(projectPath, { recursive: true });

function run(command, args, options = {}) {
  return spawnSync(command, args, {
    cwd: options.cwd || projectRoot,
    encoding: 'utf8',
    env: options.env || process.env,
  });
}

function parseCli(result) {
  assert.strictEqual(result.status, 0, result.stderr || result.stdout);
  const output = JSON.parse(result.stdout);
  assert.strictEqual(output.ok, true);
  return output;
}

const built = run(process.execPath, [
  path.join(projectRoot, 'scripts', 'build-release.js'),
  '--output',
  releasePath,
]);
assert.strictEqual(built.status, 0, built.stderr || built.stdout);
const release = JSON.parse(built.stdout);
const assetPath = path.join(release.outputPath, release.asset);

const poisonedNpmrc = path.join(sandbox, 'poisoned.npmrc');
fs.writeFileSync(poisonedNpmrc, 'registry=http://127.0.0.1:1/\n');
process.env.npm_config_userconfig = poisonedNpmrc;
process.env.npm_config_cache = path.join(sandbox, 'poisoned-cache');
const cleanNpmrc = path.join(sandbox, 'clean.npmrc');
const cleanGlobalNpmrc = path.join(sandbox, 'clean-global.npmrc');
const cleanNpmCache = path.join(sandbox, 'clean-npm-cache');
fs.writeFileSync(cleanNpmrc, '');
fs.writeFileSync(cleanGlobalNpmrc, '');
const cleanInstallEnv = Object.fromEntries(
  Object.entries(process.env).filter(
    ([name]) => !name.toLowerCase().startsWith('npm_config_')
  )
);

const installed = run('npm', [
  'install',
  '-g',
  '--prefix',
  installPrefix,
  assetPath,
  '--force',
], {
  env: {
    ...cleanInstallEnv,
    HOME: homePath,
    npm_config_userconfig: cleanNpmrc,
    npm_config_globalconfig: cleanGlobalNpmrc,
    npm_config_cache: cleanNpmCache,
  },
});
assert.strictEqual(installed.status, 0, installed.stderr || installed.stdout);

const installedPackage = JSON.parse(fs.readFileSync(path.join(
  installPrefix,
  'lib',
  'node_modules',
  'wechat-notebank',
  'package.json'
), 'utf8'));
assert.strictEqual(installedPackage.version, '0.2.0');

const cliPath = path.join(installPrefix, 'bin', 'alskai-notebank');
const cliEnv = {
  ...process.env,
  HOME: homePath,
  PATH: `${path.join(installPrefix, 'bin')}:${process.env.PATH}`,
};
const runCli = (args) => run(cliPath, args, { cwd: projectPath, env: cliEnv });

const dryRun = parseCli(runCli([
  'setup',
  '--agents',
  'codex,claude',
  '--dry-run',
  '--json',
]));
assert.strictEqual(dryRun.status, 'planned');
assert.strictEqual(fs.existsSync(path.join(homePath, '.codex')), false);
assert.strictEqual(fs.existsSync(path.join(homePath, '.claude')), false);

const setup = parseCli(runCli([
  'setup',
  '--agents',
  'codex,claude',
  '--json',
]));
assert.strictEqual(setup.status, 'installed');
assert.strictEqual(setup.result.restartRequired, true);

const initialized = parseCli(runCli([
  'init',
  '--scope',
  'global',
  '--archive-path',
  archivePath,
  '--no-auto-process',
  '--json',
]));
assert.strictEqual(initialized.status, 'configured');

const doctor = parseCli(runCli(['doctor', '--json']));
assert.strictEqual(doctor.status, 'passed');
assert.strictEqual(doctor.result.version, '0.2.0');
assert.ok(doctor.result.checks.every((check) => check.status === 'passed'));

const workflowMarker = path.join(sandbox, 'installed-cli-used');
const workflowCliPath = path.join(sandbox, 'installed-cli-wrapper.js');
const installedSkillRoot = path.join(
  homePath,
  '.codex',
  'skills',
  'alskai-notebank'
);
const installedEntry = path.join(
  installPrefix,
  'lib',
  'node_modules',
  'wechat-notebank',
  'dist',
  'index.js'
);
fs.writeFileSync(workflowCliPath, [
  `require('fs').appendFileSync(${JSON.stringify(workflowMarker)}, ${JSON.stringify('used\n')});`,
  `require(${JSON.stringify(installedEntry)});`,
  '',
].join('\n'));
const agentWorkflow = run(process.execPath, [
  path.join(projectRoot, 'tests', 'agent-workflow.test.js'),
], {
  env: {
    ...process.env,
    WECHAT_NOTEBANK_CLI_PATH: workflowCliPath,
    WECHAT_NOTEBANK_SKILL_ROOT: installedSkillRoot,
    WECHAT_NOTEBANK_EXPECT_SKILL_ROOT: installedSkillRoot,
  },
});
assert.strictEqual(
  agentWorkflow.status,
  0,
  agentWorkflow.stderr || agentWorkflow.stdout
);
assert.match(agentWorkflow.stdout, /agent workflow tests passed/);
assert.strictEqual(fs.existsSync(workflowMarker), true);

const installedRuntimeRoot = path.join(
  installPrefix,
  'lib',
  'node_modules',
  'wechat-notebank',
  'dist'
);
const rollbackAcceptance = run(process.execPath, [
  path.join(projectRoot, 'tests', 'pack-approve-transaction.test.js'),
], {
  env: {
    ...process.env,
    WECHAT_NOTEBANK_RUNTIME_ROOT: installedRuntimeRoot,
  },
});
assert.strictEqual(
  rollbackAcceptance.status,
  0,
  rollbackAcceptance.stderr || rollbackAcceptance.stdout
);
assert.match(rollbackAcceptance.stdout, /pack approve transaction tests passed/);

console.log('release agent acceptance tests passed');
