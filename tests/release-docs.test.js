const assert = require('assert');
const fs = require('fs');
const path = require('path');

const projectRoot = path.resolve(__dirname, '..');
const readme = fs.readFileSync(path.join(projectRoot, 'README.md'), 'utf8');
const releasing = fs.readFileSync(path.join(projectRoot, 'RELEASING.md'), 'utf8');
const { version } = require('../package.json');
const tag = `v${version}`;
const asset = `wechat-notebank-${version}.tgz`;
const assetUrl = `https://github.com/Albert-Lsk/wechat-notebank/releases/download/${tag}/${asset}`;

assert.match(releasing, /npm ci/);
assert.match(releasing, /npm test/);
assert.match(releasing, /npm run release:pack/);
assert.match(releasing, new RegExp(`\\(cd release && shasum -a 256 -c ${asset.replaceAll('.', '\\.')}\\.sha256\\)`));
assert.match(releasing, new RegExp(`release/${asset.replaceAll('.', '\\.')}`));
assert.match(releasing, new RegExp(`${asset.replaceAll('.', '\\.')}\\.sha256`));
assert.match(releasing, new RegExp(`gh release create ${tag.replaceAll('.', '\\.')}`));
assert.match(releasing, /--notes-from-tag/);
assert.match(releasing, /不要使用[^\n]*Source code|Source code[^\n]*不要使用/i);
assert.match(releasing, /GitHub Release 附件与 npm registry 双通道发布/);
assert.match(releasing, /docs\/adr\/0001-npm-dual-channel-release\.md/);
assert.match(releasing, /npm publish release\//);
assert.match(releasing, /npm view wechat-notebank version/);
assert.match(releasing, /read-write granular access token 最长 90 天/);
assert.ok(
  fs.existsSync(path.join(projectRoot, 'docs', 'adr', '0001-npm-dual-channel-release.md')),
  'ADR 0001（npm 双通道决策）应存在'
);
assert.match(readme, /npm install -g wechat-notebank@\d+\.\d+\.\d+/);
assert.match(readme, /docs\/adr\/0001/);
assert.doesNotMatch(readme, /暂未发布到 npm registry/);
assert.match(readme, new RegExp(assetUrl.replaceAll('.', '\\.')));

console.log('release docs tests passed');
