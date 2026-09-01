const assert = require('assert');
const path = require('path');
const { spawnSync } = require('child_process');

const projectRoot = path.resolve(__dirname, '..');
const cliPath = path.join(projectRoot, 'dist', 'index.js');
const expectedVersion = require(path.join(projectRoot, 'package.json')).version;

function runCli(args) {
  return spawnSync(process.execPath, [cliPath, ...args], {
    cwd: projectRoot,
    encoding: 'utf8',
  });
}

function stdoutContentLines(result) {
  return result.stdout.split('\n').filter((line) => line.trim().length > 0);
}

// 1. alskai-notebank --version 输出版本号，版本号来自 package.json
const plain = runCli(['--version']);
assert.strictEqual(plain.status, 0, plain.stderr || plain.stdout);
const plainLines = stdoutContentLines(plain);
assert.strictEqual(
  plainLines.length,
  1,
  `--version 的 stdout 应只有一行，实际: ${JSON.stringify(plain.stdout)}`
);
assert.strictEqual(plainLines[0].trim(), expectedVersion);
assert.strictEqual(plain.stderr, '');

// 2. --version --json 输出与其他命令同构的一行 JSON
const jsonResult = runCli(['--version', '--json']);
assert.strictEqual(jsonResult.status, 0, jsonResult.stderr || jsonResult.stdout);
const jsonLines = stdoutContentLines(jsonResult);
assert.strictEqual(
  jsonLines.length,
  1,
  `--version --json 的 stdout 应只有一行，实际: ${JSON.stringify(jsonResult.stdout)}`
);
assert.deepStrictEqual(JSON.parse(jsonLines[0]), {
  ok: true,
  command: 'version',
  status: 'ok',
  result: {
    version: expectedVersion,
  },
});

// 3. 帮助文本包含 --version
const help = runCli(['--help']);
assert.strictEqual(help.status, 0, help.stderr || help.stdout);
assert.match(help.stdout, /--version/);

console.log('version tests passed');
