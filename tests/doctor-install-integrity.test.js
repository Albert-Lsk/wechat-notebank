const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const projectRoot = path.resolve(__dirname, '..');
const cliPath = path.join(projectRoot, 'dist', 'index.js');
const cliVersion = require('../package.json').version;

function createSandbox(name) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), `wechat-notebank-${name}-`));
  const home = path.join(root, 'home');
  const project = path.join(root, 'project');
  fs.mkdirSync(home, { recursive: true });
  fs.mkdirSync(project, { recursive: true });
  return { root, home, project };
}

function createInstallRoot(root, options = {}) {
  const installRoot = path.join(root, 'install-root');
  const version = 'version' in options ? options.version : cliVersion;
  const withBin = 'withBin' in options ? options.withBin : true;
  fs.mkdirSync(path.join(installRoot, 'dist'), { recursive: true });
  if (withBin) {
    fs.writeFileSync(path.join(installRoot, 'dist', 'index.js'), '#!/usr/bin/env node\n');
  }
  if (version !== null) {
    fs.writeFileSync(
      path.join(installRoot, 'package.json'),
      `${JSON.stringify({
        name: 'wechat-notebank',
        version,
        bin: {
          'alskai-notebank': 'dist/index.js',
          'wechat-notebank': 'dist/index.js',
        },
      }, null, 2)}\n`
    );
  }
  return installRoot;
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

function runDoctor(sandbox, installRoot, extraEnv = {}) {
  const statements = [
    "Object.defineProperty(process, 'platform', { value: 'darwin' });",
    "Object.defineProperty(process, 'arch', { value: 'arm64' });",
    `process.argv = [process.execPath, ${JSON.stringify(cliPath)}, 'doctor', '--json'];`,
    `require(${JSON.stringify(cliPath)});`,
  ];
  return spawnSync(process.execPath, ['-e', statements.join('')], {
    cwd: sandbox.project,
    encoding: 'utf8',
    env: {
      ...process.env,
      HOME: sandbox.home,
      WECHAT_NOTEBANK_CHROME_PATH: sandbox.chrome,
      WECHAT_NOTEBANK_INSTALL_ROOT: installRoot,
      ...extraEnv,
    },
  });
}

function prepareSandbox(name) {
  const sandbox = createSandbox(name);
  sandbox.chrome = path.join(sandbox.root, 'Google Chrome');
  fs.writeFileSync(sandbox.chrome, '');
  fs.chmodSync(sandbox.chrome, 0o755);
  return sandbox;
}

function doctorChecks(result, label) {
  assert.strictEqual(result.status, 0, `${label}: ${result.stderr || result.stdout}`);
  const output = JSON.parse(result.stdout);
  const check = output.result.checks.find((candidate) => candidate.id === 'install');
  assert.ok(check, `${label}: --json output must include the install check`);
  return { output, check };
}

const healthySandbox = prepareSandbox('doctor-install-healthy');
const healthyInstallRoot = createInstallRoot(healthySandbox.root);
const healthyBefore = snapshot(healthyInstallRoot);
const healthy = runDoctor(healthySandbox, healthyInstallRoot);
const { output: healthyOutput, check: healthyCheck } = doctorChecks(healthy, 'healthy install');
assert.strictEqual(healthyCheck.status, 'passed', healthyCheck.message);
assert.ok(
  healthyOutput.result.checks.every((candidate) => candidate.status !== 'failed'),
  'healthy install must not fail doctor'
);
assert.deepStrictEqual(
  snapshot(healthyInstallRoot),
  healthyBefore,
  'doctor must stay read-only on the install root'
);

const missingBinSandbox = prepareSandbox('doctor-install-missing-bin');
const missingBinInstallRoot = createInstallRoot(missingBinSandbox.root, { withBin: false });
const missingBin = runDoctor(missingBinSandbox, missingBinInstallRoot);
assert.strictEqual(
  missingBin.status,
  1,
  `half-installed CLI must fail doctor: ${missingBin.stdout}`
);
const missingBinOutput = JSON.parse(missingBin.stdout);
assert.strictEqual(missingBinOutput.ok, false);
const missingBinCheck = missingBinOutput.result.checks.find(
  (candidate) => candidate.id === 'install'
);
assert.ok(missingBinCheck, '--json output must include the install check');
assert.strictEqual(missingBinCheck.status, 'failed');
assert.match(missingBinCheck.message, /dist[\\/]index\.js/);
assert.match(missingBinCheck.message, /README/);
assert.match(missingBinCheck.message, /清理/);
assert.match(missingBinCheck.message, /npm install -g/);

function assertFailedInstallCheck(result, label) {
  assert.strictEqual(result.status, 1, `${label}: ${result.stdout}`);
  const output = JSON.parse(result.stdout);
  const check = output.result.checks.find((candidate) => candidate.id === 'install');
  assert.ok(check, `${label}: --json output must include the install check`);
  assert.strictEqual(check.status, 'failed');
  assert.match(check.message, /README/);
  assert.match(check.message, /清理/);
  assert.match(check.message, /npm install -g/);
  return check;
}

const emptyVersionSandbox = prepareSandbox('doctor-install-empty-version');
const emptyVersionInstallRoot = createInstallRoot(emptyVersionSandbox.root, { version: '' });
const emptyVersionCheck = assertFailedInstallCheck(
  runDoctor(emptyVersionSandbox, emptyVersionInstallRoot),
  'empty version'
);
assert.match(emptyVersionCheck.message, /version/);

const missingManifestSandbox = prepareSandbox('doctor-install-missing-manifest');
const missingManifestInstallRoot = createInstallRoot(missingManifestSandbox.root, {
  version: null,
});
assertFailedInstallCheck(
  runDoctor(missingManifestSandbox, missingManifestInstallRoot),
  'missing package.json'
);

console.log('doctor install integrity tests passed');
