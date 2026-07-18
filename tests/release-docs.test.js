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
assert.match(releasing, /\(cd release && shasum -a 256 -c wechat-notebank-0\.2\.0\.tgz\.sha256\)/);
assert.match(releasing, new RegExp(`release/${asset.replaceAll('.', '\\.')}`));
assert.match(releasing, new RegExp(`${asset.replaceAll('.', '\\.')}\\.sha256`));
assert.match(releasing, new RegExp(`gh release create ${tag.replaceAll('.', '\\.')}`));
assert.match(releasing, /--notes-from-tag/);
assert.match(releasing, /不要使用[^\n]*Source code|Source code[^\n]*不要使用/i);
assert.match(releasing, /不发布[^\n]*npm registry/i);
assert.match(readme, new RegExp(assetUrl.replaceAll('.', '\\.')));

console.log('release docs tests passed');
