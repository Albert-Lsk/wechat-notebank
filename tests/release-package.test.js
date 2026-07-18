const assert = require('assert');
const path = require('path');
const { spawnSync } = require('child_process');

const projectRoot = path.resolve(__dirname, '..');
const packageJson = require('../package.json');
const packed = spawnSync('npm', ['pack', '--dry-run', '--json'], {
  cwd: projectRoot,
  encoding: 'utf8',
});

assert.strictEqual(packed.status, 0, packed.stderr || packed.stdout);
const [release] = JSON.parse(packed.stdout);
assert.strictEqual(release.version, '0.2.0');
assert.strictEqual(packageJson.engines.node, '>=20');

const files = release.files.map(({ path: filePath }) => filePath).sort();
const allowedRoots = [
  '.claude/commands/alskai-notebank.md',
  'LICENSE',
  'README.md',
  'dist/',
  'package.json',
  'skills/alskai-notebank/',
];

for (const filePath of files) {
  assert.ok(
    allowedRoots.some((root) => filePath === root || filePath.startsWith(root)),
    `release contains non-public file: ${filePath}`
  );
}

for (const requiredPath of [
  'dist/index.js',
  'skills/alskai-notebank/SKILL.md',
  'skills/alskai-notebank/references/setup.md',
  'skills/alskai-notebank/references/archive.md',
  'skills/alskai-notebank/references/processing.md',
  'skills/alskai-notebank/references/review.md',
  '.claude/commands/alskai-notebank.md',
  'README.md',
  'LICENSE',
  'package.json',
]) {
  assert.ok(files.includes(requiredPath), `release is missing ${requiredPath}`);
}

console.log('release package tests passed');
