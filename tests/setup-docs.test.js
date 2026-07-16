const assert = require('assert');
const fs = require('fs');
const path = require('path');

const projectRoot = path.resolve(__dirname, '..');
const readme = fs.readFileSync(path.join(projectRoot, 'README.md'), 'utf8');

assert.match(readme, /archive\/refs\/tags\/v0\.2\.0\.tar\.gz/);
assert.doesNotMatch(readme, /archive\/refs\/heads\/main\.tar\.gz/);
assert.match(readme, /alskai-notebank setup --agents (codex|claude|codex,claude)/);
assert.match(readme, /alskai-notebank setup[^\n]*--dry-run[^\n]*--json/);
assert.match(readme, /alskai-notebank doctor --json/);
assert.match(readme, /macOS Apple Silicon/);
assert.match(readme, /重启 (Codex|Claude Code)/);
assert.match(readme, /请阅读[^\n]*README[^\n]*(安装|更新)/);
assert.doesNotMatch(readme, /npm explore -g wechat-notebank -- bash scripts\/install-skills\.sh/);

console.log('setup docs tests passed');
