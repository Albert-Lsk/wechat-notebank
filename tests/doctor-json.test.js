const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const projectRoot = path.resolve(__dirname, '..');
const cliPath = path.join(projectRoot, 'dist', 'index.js');

function createSandbox(name) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), `wechat-notebank-${name}-`));
  const home = path.join(root, 'home');
  const project = path.join(root, 'project');
  fs.mkdirSync(home, { recursive: true });
  fs.mkdirSync(project, { recursive: true });
  return { root, home, project };
}

function snapshot(directory) {
  const entries = [];
  function visit(current, relative) {
    for (const name of fs.readdirSync(current).sort()) {
      const absolute = path.join(current, name);
      const childRelative = path.join(relative, name);
      const stat = fs.lstatSync(absolute);
      if (stat.isDirectory()) {
        entries.push(`d:${childRelative}:${stat.mode & 0o777}:${stat.mtimeMs}`);
        visit(absolute, childRelative);
      } else {
        entries.push(
          `f:${childRelative}:${stat.mode & 0o777}:${stat.mtimeMs}:${fs.readFileSync(absolute, 'hex')}`
        );
      }
    }
  }
  visit(directory, '');
  return entries;
}

function runCli(args, homePath, cwdPath, extraEnv = {}) {
  return runCliWithRuntime(
    args,
    homePath,
    cwdPath,
    { platform: 'darwin', arch: 'arm64' },
    extraEnv
  );
}

function runCliWithRuntime(args, homePath, cwdPath, runtime, extraEnv = {}) {
  const statements = [];
  if (runtime.platform) {
    statements.push(
      `Object.defineProperty(process, 'platform', { value: ${JSON.stringify(runtime.platform)} });`
    );
  }
  if (runtime.arch) {
    statements.push(
      `Object.defineProperty(process, 'arch', { value: ${JSON.stringify(runtime.arch)} });`
    );
  }
  if (runtime.nodeVersion) {
    statements.push(
      `Object.defineProperty(process.versions, 'node', { value: ${JSON.stringify(runtime.nodeVersion)} });`
    );
  }
  statements.push(
    `process.argv = [process.execPath, ${JSON.stringify(cliPath)}, ...${JSON.stringify(args)}];`,
    `require(${JSON.stringify(cliPath)});`
  );
  return spawnSync(process.execPath, ['-e', statements.join('')], {
    cwd: cwdPath,
    encoding: 'utf8',
    env: { ...process.env, HOME: homePath, ...extraEnv },
  });
}

const sandbox = createSandbox('doctor-read-only');
const fakeChrome = path.join(sandbox.root, 'Google Chrome');
fs.writeFileSync(fakeChrome, '');
fs.chmodSync(fakeChrome, 0o755);
const before = {
  home: snapshot(sandbox.home),
  project: snapshot(sandbox.project),
};
const result = runCli(['doctor', '--json'], sandbox.home, sandbox.project, {
  WECHAT_NOTEBANK_CHROME_PATH: fakeChrome,
});

assert.strictEqual(result.status, 0, result.stderr || result.stdout);
const output = JSON.parse(result.stdout);
assert.strictEqual(output.ok, true);
assert.strictEqual(output.command, 'doctor');
assert.strictEqual(output.status, 'warning');
assert.strictEqual(output.result.version, require('../package.json').version);
const checks = new Map(output.result.checks.map((check) => [check.id, check]));
for (const id of ['platform', 'node', 'npm', 'chrome', 'cli']) {
  assert.strictEqual(checks.get(id).status, 'passed', `${id} should pass`);
}
for (const id of [
  'skill:codex',
  'skill:claude',
  'command:claude',
  'config',
  'archive',
]) {
  assert.strictEqual(checks.get(id).status, 'warning', `${id} should warn`);
}
assert.deepStrictEqual(snapshot(sandbox.home), before.home);
assert.deepStrictEqual(snapshot(sandbox.project), before.project);

const missingChromeSandbox = createSandbox('doctor-missing-chrome');
const missingChromeResult = runCli(
  ['doctor', '--json'],
  missingChromeSandbox.home,
  missingChromeSandbox.project,
  {
    WECHAT_NOTEBANK_CHROME_PATH: path.join(
      missingChromeSandbox.root,
      'missing-chrome'
    ),
  }
);
assert.strictEqual(missingChromeResult.status, 1);
const missingChromeOutput = JSON.parse(missingChromeResult.stdout);
assert.strictEqual(missingChromeOutput.ok, false);
assert.strictEqual(missingChromeOutput.status, 'failed');
assert.strictEqual(missingChromeOutput.error.code, 'CHROME_NOT_FOUND');
assert.strictEqual(
  missingChromeOutput.result.checks.find((check) => check.id === 'chrome').status,
  'failed'
);
assert.match(
  missingChromeOutput.result.checks.find((check) => check.id === 'chrome').message,
  /WECHAT_NOTEBANK_CHROME_PATH/
);

const chromeDirectorySandbox = createSandbox('doctor-chrome-directory');
const chromeDirectoryResult = runCli(
  ['doctor', '--json'],
  chromeDirectorySandbox.home,
  chromeDirectorySandbox.project,
  { WECHAT_NOTEBANK_CHROME_PATH: chromeDirectorySandbox.root }
);
assert.strictEqual(chromeDirectoryResult.status, 1);
assert.strictEqual(
  JSON.parse(chromeDirectoryResult.stdout).error.code,
  'CHROME_NOT_FOUND'
);

const healthySandbox = createSandbox('doctor-healthy');
const healthyChrome = path.join(healthySandbox.root, 'Google Chrome');
const healthyArchive = path.join(healthySandbox.root, 'archive');
fs.writeFileSync(healthyChrome, '');
fs.chmodSync(healthyChrome, 0o755);
const healthyEnv = { WECHAT_NOTEBANK_CHROME_PATH: healthyChrome };
const healthySetup = runCli(
  ['setup', '--agents', 'codex,claude', '--json'],
  healthySandbox.home,
  healthySandbox.project,
  healthyEnv
);
assert.strictEqual(healthySetup.status, 0, healthySetup.stderr || healthySetup.stdout);
const healthyInit = runCli([
  'init',
  '--scope',
  'global',
  '--archive-path',
  healthyArchive,
  '--json',
], healthySandbox.home, healthySandbox.project, healthyEnv);
assert.strictEqual(healthyInit.status, 0, healthyInit.stderr || healthyInit.stdout);
const healthyDoctor = runCli(
  ['doctor', '--json'],
  healthySandbox.home,
  healthySandbox.project,
  healthyEnv
);
assert.strictEqual(
  healthyDoctor.status,
  0,
  healthyDoctor.stderr || healthyDoctor.stdout
);
const healthyOutput = JSON.parse(healthyDoctor.stdout);
assert.strictEqual(healthyOutput.status, 'passed');
assert.ok(healthyOutput.result.checks.every((check) => check.status === 'passed'));
const healthyBeforeReadOnlyCheck = snapshot(healthySandbox.root);
const healthyReadOnlyDoctor = runCli(
  ['doctor', '--json'],
  healthySandbox.home,
  healthySandbox.project,
  healthyEnv
);
assert.strictEqual(healthyReadOnlyDoctor.status, 0);
assert.deepStrictEqual(
  snapshot(healthySandbox.root),
  healthyBeforeReadOnlyCheck,
  'doctor should not modify populated config, skills, or archive state'
);

fs.rmSync(path.join(
  healthySandbox.home,
  '.codex',
  'skills',
  'alskai-notebank',
  'references',
  'setup.md'
));
const corruptSkillDoctor = runCli(
  ['doctor', '--json'],
  healthySandbox.home,
  healthySandbox.project,
  healthyEnv
);
assert.strictEqual(corruptSkillDoctor.status, 0);
const corruptSkillOutput = JSON.parse(corruptSkillDoctor.stdout);
assert.strictEqual(corruptSkillOutput.status, 'warning');
assert.strictEqual(
  corruptSkillOutput.result.checks.find(
    (check) => check.id === 'skill:codex'
  ).status,
  'warning'
);

const claudeCommandPath = path.join(
  healthySandbox.home,
  '.claude',
  'commands',
  'alskai-notebank.md'
);
fs.rmSync(claudeCommandPath);
fs.mkdirSync(claudeCommandPath);
const corruptCommandDoctor = runCli(
  ['doctor', '--json'],
  healthySandbox.home,
  healthySandbox.project,
  healthyEnv
);
assert.strictEqual(corruptCommandDoctor.status, 0);
assert.strictEqual(
  JSON.parse(corruptCommandDoctor.stdout).result.checks.find(
    (check) => check.id === 'command:claude'
  ).status,
  'warning'
);

const unsupportedSandbox = createSandbox('doctor-unsupported');
const unsupportedChrome = path.join(unsupportedSandbox.root, 'Google Chrome');
fs.writeFileSync(unsupportedChrome, '');
fs.chmodSync(unsupportedChrome, 0o755);
const unsupportedDoctor = runCliWithRuntime(
  ['doctor', '--json'],
  unsupportedSandbox.home,
  unsupportedSandbox.project,
  { platform: 'linux', arch: 'x64' },
  { WECHAT_NOTEBANK_CHROME_PATH: unsupportedChrome }
);
assert.strictEqual(unsupportedDoctor.status, 1);
assert.strictEqual(JSON.parse(unsupportedDoctor.stdout).error.code, 'ENV_UNSUPPORTED');

const oldNodeSandbox = createSandbox('doctor-old-node');
const oldNodeChrome = path.join(oldNodeSandbox.root, 'Google Chrome');
fs.writeFileSync(oldNodeChrome, '');
fs.chmodSync(oldNodeChrome, 0o755);
const oldNodeDoctor = runCliWithRuntime(
  ['doctor', '--json'],
  oldNodeSandbox.home,
  oldNodeSandbox.project,
  { nodeVersion: '18.20.0' },
  { WECHAT_NOTEBANK_CHROME_PATH: oldNodeChrome }
);
assert.strictEqual(oldNodeDoctor.status, 1);
assert.strictEqual(
  JSON.parse(oldNodeDoctor.stdout).error.code,
  'NODE_VERSION_UNSUPPORTED'
);

const missingNpmSandbox = createSandbox('doctor-missing-npm');
const missingNpmChrome = path.join(missingNpmSandbox.root, 'Google Chrome');
fs.writeFileSync(missingNpmChrome, '');
fs.chmodSync(missingNpmChrome, 0o755);
const missingNpmDoctor = runCli(
  ['doctor', '--json'],
  missingNpmSandbox.home,
  missingNpmSandbox.project,
  { PATH: '', WECHAT_NOTEBANK_CHROME_PATH: missingNpmChrome }
);
assert.strictEqual(missingNpmDoctor.status, 1);
assert.strictEqual(JSON.parse(missingNpmDoctor.stdout).error.code, 'NPM_NOT_FOUND');
assert.match(
  JSON.parse(missingNpmDoctor.stdout).result.checks.find(
    (check) => check.id === 'npm'
  ).message,
  /Node\.js 20\+/
);

const invalidConfigSandbox = createSandbox('doctor-invalid-config');
const invalidConfigChrome = path.join(invalidConfigSandbox.root, 'Google Chrome');
fs.writeFileSync(invalidConfigChrome, '');
fs.chmodSync(invalidConfigChrome, 0o755);
fs.writeFileSync(
  path.join(invalidConfigSandbox.project, '.wechat-notebank.json'),
  '{invalid json'
);
const invalidConfigDoctor = runCli(
  ['doctor', '--json'],
  invalidConfigSandbox.home,
  invalidConfigSandbox.project,
  { WECHAT_NOTEBANK_CHROME_PATH: invalidConfigChrome }
);
assert.strictEqual(invalidConfigDoctor.status, 1);
assert.strictEqual(
  JSON.parse(invalidConfigDoctor.stdout).error.code,
  'CONFIG_INVALID'
);

const missingArchiveSandbox = createSandbox('doctor-missing-archive');
const missingArchiveChrome = path.join(missingArchiveSandbox.root, 'Google Chrome');
fs.writeFileSync(missingArchiveChrome, '');
fs.chmodSync(missingArchiveChrome, 0o755);
fs.writeFileSync(
  path.join(missingArchiveSandbox.project, '.wechat-notebank.json'),
  JSON.stringify({ archivePath: path.join(missingArchiveSandbox.root, 'missing') })
);
const missingArchiveDoctor = runCli(
  ['doctor', '--json'],
  missingArchiveSandbox.home,
  missingArchiveSandbox.project,
  { WECHAT_NOTEBANK_CHROME_PATH: missingArchiveChrome }
);
assert.strictEqual(missingArchiveDoctor.status, 1);
assert.strictEqual(
  JSON.parse(missingArchiveDoctor.stdout).error.code,
  'CONFIG_INVALID'
);

const archiveFileSandbox = createSandbox('doctor-archive-file');
const archiveFileChrome = path.join(archiveFileSandbox.root, 'Google Chrome');
const archiveFile = path.join(archiveFileSandbox.root, 'archive.md');
fs.writeFileSync(archiveFileChrome, '');
fs.chmodSync(archiveFileChrome, 0o755);
fs.writeFileSync(archiveFile, 'not a directory\n');
fs.writeFileSync(
  path.join(archiveFileSandbox.project, '.wechat-notebank.json'),
  JSON.stringify({ archivePath: archiveFile })
);
const archiveFileDoctor = runCli(
  ['doctor', '--json'],
  archiveFileSandbox.home,
  archiveFileSandbox.project,
  { WECHAT_NOTEBANK_CHROME_PATH: archiveFileChrome }
);
assert.strictEqual(archiveFileDoctor.status, 1);
assert.strictEqual(
  JSON.parse(archiveFileDoctor.stdout).error.code,
  'CONFIG_INVALID'
);

console.log('doctor json tests passed');
