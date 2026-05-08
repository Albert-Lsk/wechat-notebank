const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { saveArticle } = require('../dist/lib/storage');

(async () => {
  const archivePath = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'wechat-notebank-')), 'nested', 'articles');
  const filePath = await saveArticle(archivePath, 'Test Article', 'Hello world', {
    title: 'Test Article',
    author: 'Author',
    wechatName: 'Account',
    pubDate: '2026-05-08',
    sourceUrl: 'https://mp.weixin.qq.com/s/example',
    archivedAt: '2026-05-08T00:00:00.000Z',
    tags: [],
  });

  assert.strictEqual(path.dirname(filePath), archivePath);
  assert.ok(fs.existsSync(filePath), 'article file should be written inside a newly created folder');
  console.log('storage tests passed');
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
