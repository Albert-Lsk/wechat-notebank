const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { articleExistsBySourceUrl, generateFilename, saveArticle } = require('../dist/lib/storage');

(async () => {
  assert.strictEqual(
    generateFilename('Test Article', '2026-05-08'),
    '2026-05-08-TestArticle.md'
  );

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
  assert.strictEqual(path.basename(filePath), '2026-05-08-TestArticle.md');
  assert.ok(fs.existsSync(filePath), 'article file should be written inside a newly created folder');

  const duplicateFilePath = await saveArticle(archivePath, 'Test Article', 'Hello again', {
    title: 'Test Article',
    author: 'Author',
    wechatName: 'Account',
    pubDate: '2026-05-08',
    sourceUrl: 'https://mp.weixin.qq.com/s/example-2',
    archivedAt: '2026-05-08T00:01:00.000Z',
    tags: [],
  });

  assert.strictEqual(path.basename(duplicateFilePath), '2026-05-08-TestArticle-2.md');
  assert.ok(fs.existsSync(duplicateFilePath), 'duplicate article should not overwrite the first file');

  assert.strictEqual(
    await articleExistsBySourceUrl(archivePath, 'https://mp.weixin.qq.com/s/example'),
    true
  );
  assert.strictEqual(
    await articleExistsBySourceUrl(archivePath, 'https://mp.weixin.qq.com/s/missing'),
    false
  );
  assert.strictEqual(
    await articleExistsBySourceUrl(path.join(archivePath, 'missing-folder'), 'https://mp.weixin.qq.com/s/example'),
    false
  );

  console.log('storage tests passed');
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
