const assert = require('assert');
const os = require('os');
const path = require('path');
const { resolveArchivePath } = require('../dist/commands/fetch');

assert.strictEqual(
  resolveArchivePath({ archivePath: '/configured/path' }, undefined),
  '/configured/path'
);

assert.strictEqual(
  resolveArchivePath({ archivePath: '/configured/path' }, '/custom/path'),
  '/custom/path'
);

assert.strictEqual(
  resolveArchivePath(null, '/custom/path'),
  '/custom/path'
);

assert.strictEqual(
  resolveArchivePath(null, '~/WeChatArticles'),
  path.join(os.homedir(), 'WeChatArticles')
);

assert.strictEqual(
  resolveArchivePath(null, '~\\WeChatArticles'),
  path.join(os.homedir(), 'WeChatArticles')
);

assert.throws(
  () => resolveArchivePath(null, undefined),
  /未找到配置文件/
);

console.log('archive path tests passed');
