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
  new RegExp(`npm install -g --prefix "\\\$HOME/\\.local" \.\\/wechat-notebank-${escapedVersion}\\.tgz`)
);
assert.doesNotMatch(readme, /install[^\n]*--force/);
// README 中 tgz 形态的 npm install -g 只允许两种：macOS prefix 序列、Windows 单行 Release URL；
// 裸本地 tgz、浮动 latest 等一律禁止。registry 形态与 404 说明示例由双通道叙事约束。
for (const line of readme.split('\n').filter((candidate) => candidate.includes('npm install -g'))) {
  if (!line.includes('.tgz')) {
    continue;
  }
  const allowed =
    line.includes('--prefix "$HOME/.local"') ||
    line.includes('https://github.com/Albert-Lsk/wechat-notebank/releases/download/');
  assert.ok(allowed, `未授权的 tgz 安装形态: ${line.trim()}`);
}
assert.match(readme, /ALSKAI_NOTEBANK="\$HOME\/\.local\/bin\/alskai-notebank"/);
assert.match(readme, /"\$ALSKAI_NOTEBANK" --help/);
assert.match(readme, /"\$HOME\/\.local\/bin\/wechat-notebank" --help/);
assert.doesNotMatch(readme, /archive\/refs\/tags\/v\d+\.\d+\.\d+\.tar\.gz/);
assert.doesNotMatch(readme, /archive\/refs\/heads\/main\.tar\.gz/);
assert.match(readme, /alskai-notebank setup --agents (codex|claude|codex,claude)/);
assert.match(readme, /alskai-notebank setup[^\n]*--dry-run[^\n]*--json/);
assert.match(readme, /alskai-notebank doctor --json/);
// import-rss：命令表行 + 用法小节 + 边界重申 + wewe-rss 伴随服务小节
assert.match(readme, /alskai-notebank import-rss <feed-url> \[--limit N\] \[--allow-local\] \[--json\]/);
assert.doesNotMatch(readme, /import-rss[^\n]*--force/);
assert.match(readme, /伴随服务：wewe-rss/);
assert.match(readme, /\/feeds\/all\.atom/);
assert.match(readme, /\/feeds\/all\.rss/);
assert.match(readme, /\/feeds\/all\.json/);
assert.match(readme, /默认只枚举、不落盘/);
assert.match(readme, /不提供批量自动归档/);
assert.match(readme, /逐篇调用 `fetch`|逐篇调用 fetch/);
assert.match(readme, /docker run[^\n]*wewe-rss/i);
assert.match(readme, /微信读书[^\n]{0,12}扫码/);
assert.match(readme, /feed 源之一/);
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
