const assert = require('assert');
const fs = require('fs');
const path = require('path');

const projectRoot = path.resolve(__dirname, '..');
const readme = fs.readFileSync(path.join(projectRoot, 'README.md'), 'utf8');
const packageJson = require('../package.json');
const packageLock = require('../package-lock.json');
const { version } = packageJson;
const escapedVersion = version.replaceAll('.', '\\.');
const releaseAssetUrl = `https://github.com/Albert-Lsk/wechat-notebank/releases/download/v${version}/wechat-notebank-${version}.tgz`;

assert.match(version, /^\d+\.\d+\.\d+$/);
assert.strictEqual(packageLock.version, packageJson.version);
assert.strictEqual(packageLock.packages[''].version, packageJson.version);
assert.match(readme, new RegExp(releaseAssetUrl.replaceAll('.', '\\.')));
assert.match(
  readme,
  new RegExp(`npm install -g --prefix "\\$HOME/\\.local"[^\\n]*wechat-notebank-${escapedVersion}\\.tgz[^\\n]*--force`)
);
assert.doesNotMatch(
  readme,
  new RegExp(`npm install -g (?!--prefix "\\$HOME/\\.local")[^\\n]*wechat-notebank-${escapedVersion}\\.tgz`)
);
assert.match(readme, /ALSKAI_NOTEBANK="\$HOME\/\.local\/bin\/alskai-notebank"/);
assert.match(readme, /"\$ALSKAI_NOTEBANK" --help/);
assert.match(readme, /"\$HOME\/\.local\/bin\/wechat-notebank" --help/);
assert.doesNotMatch(readme, /archive\/refs\/tags\/v\d+\.\d+\.\d+\.tar\.gz/);
assert.doesNotMatch(readme, /archive\/refs\/heads\/main\.tar\.gz/);
assert.match(readme, /alskai-notebank setup --agents (codex|claude|codex,claude)/);
assert.match(readme, /alskai-notebank setup[^\n]*--dry-run[^\n]*--json/);
assert.match(readme, /alskai-notebank doctor --json/);
assert.match(readme, /macOS Apple Silicon/);
assert.match(readme, /重启 (Codex|Claude Code)/);
assert.match(readme, /请阅读[^\n]*README[^\n]*(安装|更新)/);
assert.match(readme, new RegExp(`shasum -a 256 -c wechat-notebank-${escapedVersion}\\.tgz\\.sha256`));
assert.match(readme, /Developer ID[^\n]*公证/);
assert.match(readme, /内容加工[^\n]*Agent/);
assert.match(readme, /不需要[^\n]*额外[^\n]*API key/i);
assert.doesNotMatch(readme, /大模型只会在以后/);
assert.doesNotMatch(readme, /npm explore -g wechat-notebank -- bash scripts\/install-skills\.sh/);

console.log('setup docs tests passed');
