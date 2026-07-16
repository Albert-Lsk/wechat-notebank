const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const projectRoot = path.resolve(__dirname, '..');
const cliPath = path.join(projectRoot, 'dist', 'index.js');
const defaultChromeRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'wechat-notebank-chrome-'));
const defaultChromePath = path.join(defaultChromeRoot, 'Google Chrome');
fs.writeFileSync(defaultChromePath, '');
fs.chmodSync(defaultChromePath, 0o755);

function createSandbox(name) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), `wechat-notebank-${name}-`));
  const home = path.join(root, 'home');
  const project = path.join(root, 'project');
  fs.mkdirSync(home, { recursive: true });
  fs.mkdirSync(project, { recursive: true });
  return { root, home, project };
}

function runCli(args, homePath, cwdPath, extraEnv = {}) {
  return runCliAt(cliPath, args, homePath, cwdPath, extraEnv);
}

function runCliAt(executablePath, args, homePath, cwdPath, extraEnv = {}) {
  return runCliAtWithPlatform(
    executablePath,
    args,
    homePath,
    cwdPath,
    'darwin',
    'arm64',
    extraEnv
  );
}

function runCliAtWithPlatform(
  executablePath,
  args,
  homePath,
  cwdPath,
  platform,
  arch,
  extraEnv = {}
) {
  const script = [
    `Object.defineProperty(process, 'platform', { value: ${JSON.stringify(platform)} });`,
    `Object.defineProperty(process, 'arch', { value: ${JSON.stringify(arch)} });`,
    `process.argv = [process.execPath, ${JSON.stringify(executablePath)}, ...${JSON.stringify(args)}];`,
    `require(${JSON.stringify(executablePath)});`,
  ].join('');
  return spawnSync(process.execPath, ['-e', script], {
    cwd: cwdPath,
    encoding: 'utf8',
    env: {
      ...process.env,
      HOME: homePath,
      WECHAT_NOTEBANK_CHROME_PATH: defaultChromePath,
      ...extraEnv,
    },
  });
}

function runCliWithPlatform(args, homePath, cwdPath, platform, arch) {
  return runCliAtWithPlatform(
    cliPath,
    args,
    homePath,
    cwdPath,
    platform,
    arch
  );
}

function snapshotTree(root) {
  const entries = [];
  function visit(current, relative) {
    for (const name of fs.readdirSync(current).sort()) {
      const absolute = path.join(current, name);
      const childRelative = path.join(relative, name);
      const stat = fs.lstatSync(absolute);
      if (stat.isDirectory()) {
        entries.push(`d:${childRelative}:${stat.mode & 0o777}`);
        visit(absolute, childRelative);
      } else {
        entries.push(
          `f:${childRelative}:${stat.mode & 0o777}:${fs.readFileSync(absolute, 'hex')}`
        );
      }
    }
  }
  visit(root, '');
  return entries;
}

const { home, project } = createSandbox('setup-dry-run');
const result = runCli([
  'setup',
  '--agents',
  'codex',
  '--dry-run',
  '--json',
], home, project);

assert.strictEqual(result.status, 0, result.stderr || result.stdout);
const output = JSON.parse(result.stdout);
assert.strictEqual(output.ok, true);
assert.strictEqual(output.command, 'setup');
assert.strictEqual(output.status, 'planned');
assert.strictEqual(output.result.dryRun, true);
assert.deepStrictEqual(output.result.agents, ['codex']);
assert.deepStrictEqual(output.result.actions, [{
  action: 'install',
  agent: 'codex',
  target: path.join(home, '.codex', 'skills', 'alskai-notebank'),
  status: 'planned',
}]);
assert.strictEqual(fs.existsSync(path.join(home, '.codex')), false);
assert.strictEqual(fs.existsSync(path.join(home, '.claude')), false);

const humanDryRunSandbox = createSandbox('setup-human-dry-run');
const humanDryRun = runCli([
  'setup',
  '--agents',
  'codex',
  '--dry-run',
], humanDryRunSandbox.home, humanDryRunSandbox.project);
assert.strictEqual(humanDryRun.status, 0, humanDryRun.stderr || humanDryRun.stdout);
assert.match(humanDryRun.stdout, /预演/);
assert.match(humanDryRun.stdout, /codex/);
assert.match(humanDryRun.stdout, /alskai-notebank/);
assert.strictEqual(
  fs.existsSync(path.join(humanDryRunSandbox.home, '.codex')),
  false
);

const installSandbox = createSandbox('setup-install');
const installChrome = path.join(installSandbox.root, 'Google Chrome');
fs.writeFileSync(installChrome, '');
fs.chmodSync(installChrome, 0o755);
const installResult = runCli([
  'setup',
  '--agents',
  'codex,claude',
  '--json',
], installSandbox.home, installSandbox.project, {
  WECHAT_NOTEBANK_CHROME_PATH: installChrome,
});

assert.strictEqual(
  installResult.status,
  0,
  installResult.stderr || installResult.stdout
);
const installOutput = JSON.parse(installResult.stdout);
assert.strictEqual(installOutput.ok, true);
assert.strictEqual(installOutput.status, 'installed');
assert.strictEqual(installOutput.result.dryRun, false);
assert.deepStrictEqual(installOutput.result.agents, ['codex', 'claude']);
assert.strictEqual(installOutput.result.restartRequired, true);
assert.strictEqual(installOutput.result.diagnostics.status, 'warning');
const installChecks = new Map(
  installOutput.result.diagnostics.checks.map((check) => [check.id, check])
);
assert.strictEqual(installChecks.get('skill:codex').status, 'passed');
assert.strictEqual(installChecks.get('skill:claude').status, 'passed');
assert.strictEqual(installChecks.get('command:claude').status, 'passed');
assert.strictEqual(installChecks.get('config').status, 'warning');

const humanRepeat = runCli([
  'setup',
  '--agents',
  'codex',
], installSandbox.home, installSandbox.project, {
  WECHAT_NOTEBANK_CHROME_PATH: installChrome,
});
assert.strictEqual(humanRepeat.status, 0, humanRepeat.stderr || humanRepeat.stdout);
assert.match(humanRepeat.stdout, /无需更新/);
assert.match(humanRepeat.stdout, /重启 Codex/);

for (const skillPath of [
  path.join(installSandbox.home, '.codex', 'skills', 'alskai-notebank'),
  path.join(installSandbox.home, '.claude', 'skills', 'alskai-notebank'),
]) {
  assert.ok(fs.existsSync(path.join(skillPath, 'SKILL.md')));
  assert.ok(fs.existsSync(path.join(skillPath, 'references', 'archive.md')));
  const receipt = JSON.parse(fs.readFileSync(
    path.join(skillPath, '.alskai-notebank-install.json'),
    'utf8'
  ));
  assert.strictEqual(receipt.version, require('../package.json').version);
}
assert.ok(fs.existsSync(path.join(
  installSandbox.home,
  '.claude',
  'commands',
  'alskai-notebank.md'
)));
assert.strictEqual(fs.existsSync(path.join(installSandbox.home, '.agents')), false);
assert.strictEqual(fs.existsSync(path.join(installSandbox.home, '.local')), false);

const codexSkillFile = path.join(
  installSandbox.home,
  '.codex',
  'skills',
  'alskai-notebank',
  'SKILL.md'
);
const claudeCommandFile = path.join(
  installSandbox.home,
  '.claude',
  'commands',
  'alskai-notebank.md'
);
const mtimesBeforeRepeat = {
  codexSkill: fs.statSync(codexSkillFile).mtimeMs,
  claudeCommand: fs.statSync(claudeCommandFile).mtimeMs,
};
const repeatedResult = runCli([
  'setup',
  '--agents',
  'codex,claude',
  '--json',
], installSandbox.home, installSandbox.project);
assert.strictEqual(
  repeatedResult.status,
  0,
  repeatedResult.stderr || repeatedResult.stdout
);
const repeatedOutput = JSON.parse(repeatedResult.stdout);
assert.strictEqual(repeatedOutput.status, 'unchanged');
assert.ok(repeatedOutput.result.actions.every((action) => action.status === 'unchanged'));
assert.strictEqual(fs.statSync(codexSkillFile).mtimeMs, mtimesBeforeRepeat.codexSkill);
assert.strictEqual(
  fs.statSync(claudeCommandFile).mtimeMs,
  mtimesBeforeRepeat.claudeCommand
);
assert.deepStrictEqual(
  fs.readdirSync(path.join(installSandbox.home, '.codex', 'skills')),
  ['alskai-notebank']
);

fs.appendFileSync(codexSkillFile, '\nlocal customization\n');
const updateResult = runCli([
  'setup',
  '--agents',
  'codex',
  '--json',
], installSandbox.home, installSandbox.project);
assert.strictEqual(updateResult.status, 0, updateResult.stderr || updateResult.stdout);
const updateOutput = JSON.parse(updateResult.stdout);
assert.strictEqual(updateOutput.status, 'installed');
assert.deepStrictEqual(updateOutput.result.actions, [{
  action: 'update',
  agent: 'codex',
  target: path.join(installSandbox.home, '.codex', 'skills', 'alskai-notebank'),
  backup: path.join(
    installSandbox.home,
    '.local',
    'state',
    'alskai-notebank',
    'setup-backups',
    'codex',
    require('../package.json').version,
    'skill'
  ),
  status: 'updated',
}]);
assert.doesNotMatch(fs.readFileSync(codexSkillFile, 'utf8'), /local customization/);
assert.match(fs.readFileSync(path.join(
  updateOutput.result.actions[0].backup,
  'SKILL.md'
), 'utf8'), /local customization/);

const failureSandbox = createSandbox('setup-rollback');
const brokenPackageRoot = path.join(failureSandbox.root, 'package');
fs.mkdirSync(brokenPackageRoot, { recursive: true });
fs.cpSync(path.join(projectRoot, 'dist'), path.join(brokenPackageRoot, 'dist'), {
  recursive: true,
});
fs.cpSync(path.join(projectRoot, 'skills'), path.join(brokenPackageRoot, 'skills'), {
  recursive: true,
});
fs.copyFileSync(
  path.join(projectRoot, 'package.json'),
  path.join(brokenPackageRoot, 'package.json')
);
fs.symlinkSync(
  path.join(projectRoot, 'node_modules'),
  path.join(brokenPackageRoot, 'node_modules'),
  'dir'
);

const legacyCodexSkill = path.join(
  failureSandbox.home,
  '.codex',
  'skills',
  'alskai-notebank'
);
fs.mkdirSync(legacyCodexSkill, { recursive: true });
fs.writeFileSync(path.join(legacyCodexSkill, 'SKILL.md'), 'legacy skill\n');

const failedInstall = runCliAt(
  path.join(brokenPackageRoot, 'dist', 'index.js'),
  ['setup', '--agents', 'codex,claude', '--json'],
  failureSandbox.home,
  failureSandbox.project
);
assert.strictEqual(failedInstall.status, 1);
const failedOutput = JSON.parse(failedInstall.stdout);
assert.strictEqual(failedOutput.ok, false);
assert.strictEqual(failedOutput.command, 'setup');
assert.strictEqual(failedOutput.error.code, 'TRANSACTION_FAILED');
assert.strictEqual(
  fs.readFileSync(path.join(legacyCodexSkill, 'SKILL.md'), 'utf8'),
  'legacy skill\n'
);
assert.strictEqual(
  fs.existsSync(path.join(legacyCodexSkill, '.alskai-notebank-install.json')),
  false
);
assert.strictEqual(fs.existsSync(path.join(failureSandbox.home, '.claude')), false);

const commitFailureSandbox = createSandbox('setup-commit-rollback');
const commitFailureChrome = path.join(commitFailureSandbox.root, 'Google Chrome');
fs.writeFileSync(commitFailureChrome, '');
fs.chmodSync(commitFailureChrome, 0o755);
const commitLegacySkill = path.join(
  commitFailureSandbox.home,
  '.codex',
  'skills',
  'alskai-notebank'
);
fs.mkdirSync(commitLegacySkill, { recursive: true });
fs.writeFileSync(path.join(commitLegacySkill, 'SKILL.md'), 'commit legacy\n');
const blockedClaudeSkills = path.join(
  commitFailureSandbox.home,
  '.claude',
  'skills'
);
fs.mkdirSync(path.dirname(blockedClaudeSkills), { recursive: true });
fs.writeFileSync(blockedClaudeSkills, 'blocks skill directory creation\n');
const commitFailureResult = runCli(
  ['setup', '--agents', 'codex,claude', '--json'],
  commitFailureSandbox.home,
  commitFailureSandbox.project,
  { WECHAT_NOTEBANK_CHROME_PATH: commitFailureChrome }
);
assert.strictEqual(commitFailureResult.status, 1);
assert.strictEqual(
  JSON.parse(commitFailureResult.stdout).error.code,
  'TRANSACTION_FAILED'
);
assert.strictEqual(
  fs.readFileSync(path.join(commitLegacySkill, 'SKILL.md'), 'utf8'),
  'commit legacy\n'
);
assert.strictEqual(
  fs.readFileSync(blockedClaudeSkills, 'utf8'),
  'blocks skill directory creation\n'
);

const cleanRollbackSandbox = createSandbox('setup-clean-rollback');
const cleanBlockedClaudeSkills = path.join(
  cleanRollbackSandbox.home,
  '.claude',
  'skills'
);
fs.mkdirSync(path.dirname(cleanBlockedClaudeSkills), { recursive: true });
fs.writeFileSync(cleanBlockedClaudeSkills, 'blocks clean install\n');
const cleanRollbackBefore = snapshotTree(cleanRollbackSandbox.home);
const cleanRollbackResult = runCli(
  ['setup', '--agents', 'codex,claude', '--json'],
  cleanRollbackSandbox.home,
  cleanRollbackSandbox.project
);
assert.strictEqual(cleanRollbackResult.status, 1);
assert.strictEqual(
  JSON.parse(cleanRollbackResult.stdout).error.code,
  'TRANSACTION_FAILED'
);
assert.deepStrictEqual(
  snapshotTree(cleanRollbackSandbox.home),
  cleanRollbackBefore,
  'failed setup should restore a clean HOME exactly'
);

const unsupportedSandbox = createSandbox('setup-unsupported');
const unsupportedResult = runCliWithPlatform(
  ['setup', '--agents', 'codex', '--json'],
  unsupportedSandbox.home,
  unsupportedSandbox.project,
  'linux',
  'x64'
);
assert.strictEqual(unsupportedResult.status, 1);
const unsupportedOutput = JSON.parse(unsupportedResult.stdout);
assert.strictEqual(unsupportedOutput.ok, false);
assert.strictEqual(unsupportedOutput.error.code, 'ENV_UNSUPPORTED');
assert.strictEqual(fs.existsSync(path.join(unsupportedSandbox.home, '.codex')), false);

const dependencySandbox = createSandbox('setup-missing-dependency');
const dependencyResult = runCli(
  ['setup', '--agents', 'codex', '--json'],
  dependencySandbox.home,
  dependencySandbox.project,
  {
    WECHAT_NOTEBANK_CHROME_PATH: path.join(
      dependencySandbox.root,
      'missing-chrome'
    ),
  }
);
assert.strictEqual(dependencyResult.status, 1);
const dependencyOutput = JSON.parse(dependencyResult.stdout);
assert.strictEqual(dependencyOutput.ok, false);
assert.strictEqual(dependencyOutput.error.code, 'CHROME_NOT_FOUND');
assert.strictEqual(fs.existsSync(path.join(dependencySandbox.home, '.codex')), false);

const invalidConfigSandbox = createSandbox('setup-invalid-config');
const invalidConfigChrome = path.join(invalidConfigSandbox.root, 'Google Chrome');
fs.writeFileSync(invalidConfigChrome, '');
fs.chmodSync(invalidConfigChrome, 0o755);
fs.writeFileSync(
  path.join(invalidConfigSandbox.project, '.wechat-notebank.json'),
  '{invalid json'
);
const invalidConfigResult = runCli(
  ['setup', '--agents', 'codex', '--json'],
  invalidConfigSandbox.home,
  invalidConfigSandbox.project,
  { WECHAT_NOTEBANK_CHROME_PATH: invalidConfigChrome }
);
assert.strictEqual(
  invalidConfigResult.status,
  0,
  invalidConfigResult.stderr || invalidConfigResult.stdout
);
const invalidConfigOutput = JSON.parse(invalidConfigResult.stdout);
assert.strictEqual(invalidConfigOutput.ok, true);
assert.strictEqual(invalidConfigOutput.status, 'installed');
assert.strictEqual(invalidConfigOutput.result.diagnostics.status, 'failed');
assert.strictEqual(
  invalidConfigOutput.result.diagnostics.error.code,
  'CONFIG_INVALID'
);
assert.ok(fs.existsSync(path.join(
  invalidConfigSandbox.home,
  '.codex',
  'skills',
  'alskai-notebank',
  'SKILL.md'
)));

const usageSandbox = createSandbox('setup-missing-agents');
const usageResult = runCli(
  ['setup', '--json'],
  usageSandbox.home,
  usageSandbox.project
);
assert.strictEqual(usageResult.status, 1);
assert.strictEqual(JSON.parse(usageResult.stdout).error.code, 'CLI_USAGE_ERROR');
assert.strictEqual(fs.existsSync(path.join(usageSandbox.home, '.codex')), false);
assert.strictEqual(fs.existsSync(path.join(usageSandbox.home, '.claude')), false);

console.log('setup json tests passed');
