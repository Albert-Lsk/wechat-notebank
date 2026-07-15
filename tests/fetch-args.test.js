const assert = require('assert');
const packageJson = require('../package.json');
const { normalizeCliArgs, parseFetchArgs, parseImportArgs } = require('../dist/lib/cli');

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

console.log('fetch args tests passed');
