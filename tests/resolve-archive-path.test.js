const assert = require('assert');
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

assert.throws(
  () => resolveArchivePath(null, undefined),
  /未找到配置文件/
);

console.log('archive path tests passed');
