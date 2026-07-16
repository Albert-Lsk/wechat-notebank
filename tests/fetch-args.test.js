const assert = require('assert');
const packageJson = require('../package.json');
const {
  normalizeCliArgs,
  parseFetchArgs,
  parseImportArgs,
  parseInitArgs,
  parsePackCreateArgs,
  parsePackApproveArgs,
} = require('../dist/lib/cli');

assert.deepStrictEqual(packageJson.bin, {
  'alskai-notebank': 'dist/index.js',
  'wechat-notebank': 'dist/index.js',
});

assert.deepStrictEqual(
  normalizeCliArgs(['https://mp.weixin.qq.com/s/example', '-o', '/tmp/wechat-articles']),
  {
    command: 'fetch',
    args: ['https://mp.weixin.qq.com/s/example', '-o', '/tmp/wechat-articles'],
  }
);

assert.deepStrictEqual(
  normalizeCliArgs(['fetch', 'https://mp.weixin.qq.com/s/example']),
  {
    command: 'fetch',
    args: ['https://mp.weixin.qq.com/s/example'],
  }
);

assert.deepStrictEqual(
  normalizeCliArgs(['import', '/tmp/articles.xlsx']),
  {
    command: 'import',
    args: ['/tmp/articles.xlsx'],
  }
);

assert.deepStrictEqual(
  parseFetchArgs(['https://mp.weixin.qq.com/s/example']),
  {
    url: 'https://mp.weixin.qq.com/s/example',
    outputPath: undefined,
    json: false,
  }
);

assert.deepStrictEqual(
  parseFetchArgs(['https://mp.weixin.qq.com/s/example', '--output', '/tmp/wechat-articles']),
  {
    url: 'https://mp.weixin.qq.com/s/example',
    outputPath: '/tmp/wechat-articles',
    json: false,
  }
);

assert.deepStrictEqual(
  parseFetchArgs(['https://mp.weixin.qq.com/s/example', '-o', './articles']),
  {
    url: 'https://mp.weixin.qq.com/s/example',
    outputPath: './articles',
    json: false,
  }
);

assert.deepStrictEqual(
  parseFetchArgs(['--json', 'https://mp.weixin.qq.com/s/example']),
  {
    url: 'https://mp.weixin.qq.com/s/example',
    outputPath: undefined,
    json: true,
  }
);

assert.throws(
  () => parseFetchArgs(['https://mp.weixin.qq.com/s/example', '--output']),
  /--output requires a folder path/
);

assert.throws(
  () => parseFetchArgs(['https://mp.weixin.qq.com/s/example', '--bad']),
  /Unknown fetch option/
);

assert.deepStrictEqual(
  parseImportArgs(['/tmp/articles.xlsx']),
  {
    filePath: '/tmp/articles.xlsx',
    json: false,
  }
);

assert.deepStrictEqual(
  parseImportArgs(['--json', '/tmp/articles.xlsx']),
  {
    filePath: '/tmp/articles.xlsx',
    json: true,
  }
);

assert.throws(
  () => parseImportArgs([]),
  /请提供 Excel 文件地址/
);

assert.throws(
  () => parseImportArgs(['/tmp/articles.xlsx', '--watch']),
  /Unknown import option/
);

assert.deepStrictEqual(
  parsePackCreateArgs([
    'create',
    '--source',
    '/tmp/vault/L1_原文/WeChat/source.md',
    '--manifest',
    '/tmp/manifest.json',
    '--json',
  ]),
  {
    sourceFile: '/tmp/vault/L1_原文/WeChat/source.md',
    manifestFile: '/tmp/manifest.json',
    json: true,
  }
);

assert.throws(
  () => parsePackCreateArgs(['create', '--manifest', '/tmp/manifest.json']),
  /--source/
);

assert.throws(
  () => parsePackCreateArgs(['create', '--source', '/tmp/source.md', '--watch']),
  /Unknown pack create option/
);

assert.deepStrictEqual(
  parsePackApproveArgs([
    'approve',
    '/tmp/vault/Inbox/pack.md',
    '--items',
    'L2-01, L3-02',
    '--json',
  ]),
  {
    packFile: '/tmp/vault/Inbox/pack.md',
    items: ['L2-01', 'L3-02'],
    json: true,
  }
);

assert.throws(
  () => parsePackApproveArgs(['approve', '/tmp/pack.md', '--items', 'L2-01,L2-01']),
  /duplicate candidate IDs/
);

assert.throws(
  () => parsePackApproveArgs(['approve', '/tmp/pack.md']),
  /--items/
);

assert.deepStrictEqual(parseInitArgs([]), {
  kind: 'legacy',
  json: false,
});

assert.deepStrictEqual(
  parseInitArgs([
    '--scope',
    'project',
    '--archive-path',
    '/tmp/project-archive',
    '--processing-goal',
    '提炼项目观点',
    '--no-auto-process',
    '--json',
  ]),
  {
    kind: 'scoped',
    scope: 'project',
    archivePath: '/tmp/project-archive',
    processingGoal: '提炼项目观点',
    processingGoalProvided: true,
    autoProcess: false,
    json: true,
  }
);

assert.throws(
  () => parseInitArgs([
    '--scope',
    'global',
    '--archive-path',
    '/tmp/global-archive',
    '--processing-goal',
    '--auto-process',
  ]),
  /--processing-goal requires text/
);

assert.throws(
  () => parseInitArgs([
    '--scope',
    'global',
    '--archive-path',
    '/tmp/global-archive',
    '--auto-process',
    '--no-auto-process',
  ]),
  /cannot be used together/
);

console.log('fetch args tests passed');
