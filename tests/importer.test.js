const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const XLSX = require('xlsx');
const { importWorkbook } = require('../dist/lib/importer');

(async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'wechat-notebank-import-'));
  const workbookPath = path.join(tempDir, 'articles.xlsx');
  const rows = [
    ['序号', '链接', '文件地址'],
    [1, 'https://mp.weixin.qq.com/s/one', path.join(tempDir, 'one')],
    [2, '', path.join(tempDir, 'missing-link')],
    [3, 'https://mp.weixin.qq.com/s/two', path.join(tempDir, 'two')],
  ];

  const workbook = XLSX.utils.book_new();
  const worksheet = XLSX.utils.aoa_to_sheet(rows);
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Sheet1');
  XLSX.writeFile(workbook, workbookPath);

  const archivedRows = [];
  const summary = await importWorkbook(workbookPath, async (row) => {
    archivedRows.push(row);
  });

  assert.deepStrictEqual(
    archivedRows.map((row) => ({
      sequence: row.sequence,
      url: row.url,
      outputPath: row.outputPath,
      rowNumber: row.rowNumber,
    })),
    [
      {
        sequence: '1',
        url: 'https://mp.weixin.qq.com/s/one',
        outputPath: path.join(tempDir, 'one'),
        rowNumber: 2,
      },
      {
        sequence: '3',
        url: 'https://mp.weixin.qq.com/s/two',
        outputPath: path.join(tempDir, 'two'),
        rowNumber: 4,
      },
    ]
  );

  assert.deepStrictEqual(summary, {
    success: 2,
    failure: 0,
    skipped: 1,
    failures: [],
  });

  const alternateHeaderWorkbookPath = path.join(tempDir, 'articles-with-alternate-header.xlsx');
  const alternateHeaderWorkbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(
    alternateHeaderWorkbook,
    XLSX.utils.aoa_to_sheet([
      ['序号', '微信文章', '目标地址'],
      [1, 'https://mp.weixin.qq.com/s/one', path.join(tempDir, 'one')],
    ]),
    'Sheet1'
  );
  XLSX.writeFile(alternateHeaderWorkbook, alternateHeaderWorkbookPath);

  const alternateHeaderRows = [];
  const alternateHeaderSummary = await importWorkbook(alternateHeaderWorkbookPath, async (row) => {
    alternateHeaderRows.push(row);
  });

  assert.deepStrictEqual(alternateHeaderRows.map((row) => row.url), [
    'https://mp.weixin.qq.com/s/one',
  ]);
  assert.deepStrictEqual(alternateHeaderSummary, {
    success: 1,
    failure: 0,
    skipped: 0,
    failures: [],
  });

  const failureWorkbookPath = path.join(tempDir, 'articles-with-failure.xlsx');
  const failureWorkbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(
    failureWorkbook,
    XLSX.utils.aoa_to_sheet([
      ['序号', '链接', '文件地址'],
      [1, 'https://mp.weixin.qq.com/s/one', path.join(tempDir, 'one')],
      [2, 'https://mp.weixin.qq.com/s/fail', path.join(tempDir, 'fail')],
      [3, 'https://mp.weixin.qq.com/s/two', path.join(tempDir, 'two')],
    ]),
    'Sheet1'
  );
  XLSX.writeFile(failureWorkbook, failureWorkbookPath);

  const processedUrls = [];
  let inFlight = 0;
  let maxInFlight = 0;
  const failureSummary = await importWorkbook(failureWorkbookPath, async (row) => {
    processedUrls.push(row.url);
    inFlight++;
    maxInFlight = Math.max(maxInFlight, inFlight);
    await new Promise((resolve) => setTimeout(resolve, 1));
    inFlight--;

    if (row.url.endsWith('/fail')) {
      throw new Error('archive failed');
    }
  });

  assert.deepStrictEqual(processedUrls, [
    'https://mp.weixin.qq.com/s/one',
    'https://mp.weixin.qq.com/s/fail',
    'https://mp.weixin.qq.com/s/two',
  ]);
  assert.strictEqual(maxInFlight, 1);
  assert.deepStrictEqual(failureSummary, {
    success: 2,
    failure: 1,
    skipped: 0,
    failures: [
      {
        rowNumber: 3,
        sequence: '2',
        url: 'https://mp.weixin.qq.com/s/fail',
        outputPath: path.join(tempDir, 'fail'),
        message: 'archive failed',
      },
    ],
  });

  const commandWorkbookPath = path.join(tempDir, 'articles-command-failure.xlsx');
  const commandWorkbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(
    commandWorkbook,
    XLSX.utils.aoa_to_sheet([
      ['序号', '链接', '文件地址'],
      [1, 'https://mp.weixin.qq.com/s/one', path.join(tempDir, 'one')],
      [2, 'https://mp.weixin.qq.com/s/fail', path.join(tempDir, 'fail')],
    ]),
    'Sheet1'
  );
  XLSX.writeFile(commandWorkbook, commandWorkbookPath);

  const fetchModulePath = require.resolve('../dist/commands/fetch');
  const importCommandModulePath = require.resolve('../dist/commands/import');
  const originalFetchModule = require.cache[fetchModulePath];
  const originalImportCommandModule = require.cache[importCommandModulePath];
  delete require.cache[importCommandModulePath];
  require.cache[fetchModulePath] = {
    id: fetchModulePath,
    filename: fetchModulePath,
    loaded: true,
    exports: {
      archiveArticle: async (url, outputPath) => {
        if (url.endsWith('/fail')) {
          throw new Error('network unavailable');
        }

        return { filePath: path.join(outputPath, 'article.md') };
      },
    },
  };

  const commandLogs = [];
  const originalLog = console.log;
  console.log = (...args) => {
    commandLogs.push(args.join(' '));
  };

  try {
    const { importCommand } = require('../dist/commands/import');
    await assert.rejects(
      () => importCommand(commandWorkbookPath),
      /导入完成，但有 1 行失败/
    );
  } finally {
    console.log = originalLog;
    delete require.cache[importCommandModulePath];
    if (originalImportCommandModule) {
      require.cache[importCommandModulePath] = originalImportCommandModule;
    }
    if (originalFetchModule) {
      require.cache[fetchModulePath] = originalFetchModule;
    } else {
      delete require.cache[fetchModulePath];
    }
  }

  assert(commandLogs.includes('❌ 失败: 1'));
  assert(
    commandLogs.some((line) =>
      line.includes(
        `❌ [第 3 行] 序号: 2, 链接: https://mp.weixin.qq.com/s/fail, 输出: ${path.join(
          tempDir,
          'fail'
        )}, 原因: network unavailable`
      )
    )
  );

  console.log('importer tests passed');
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
