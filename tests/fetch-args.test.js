const assert = require('assert');
const { parseFetchArgs, parseImportArgs } = require('../dist/lib/cli');

assert.deepStrictEqual(
  parseFetchArgs(['https://mp.weixin.qq.com/s/example']),
  {
    url: 'https://mp.weixin.qq.com/s/example',
    outputPath: undefined,
  }
);

assert.deepStrictEqual(
  parseFetchArgs(['https://mp.weixin.qq.com/s/example', '--output', '/tmp/wechat-articles']),
  {
    url: 'https://mp.weixin.qq.com/s/example',
    outputPath: '/tmp/wechat-articles',
  }
);

assert.deepStrictEqual(
  parseFetchArgs(['https://mp.weixin.qq.com/s/example', '-o', './articles']),
  {
    url: 'https://mp.weixin.qq.com/s/example',
    outputPath: './articles',
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
