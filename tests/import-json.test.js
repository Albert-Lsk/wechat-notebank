const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const XLSX = require('xlsx');

const projectRoot = path.resolve(__dirname, '..');
const cliPath = path.join(projectRoot, 'dist', 'index.js');
const mockPuppeteerPath = path.join(__dirname, 'helpers', 'mock-puppeteer.js');
const articleFixturePath = path.join(__dirname, 'fixtures', 'wechat-article.html');

function runCli(args, homePath, extraEnv = {}) {
  return spawnSync(process.execPath, [cliPath, ...args], {
    cwd: homePath,
    encoding: 'utf8',
    env: {
      ...process.env,
      ...extraEnv,
      HOME: homePath,
      NODE_OPTIONS: `--require=${mockPuppeteerPath}`,
      WECHAT_NOTEBANK_TEST_HTML_FILE: articleFixturePath,
    },
  });
}

function writeWorkbook(filePath, rows) {
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(
    workbook,
    XLSX.utils.aoa_to_sheet(rows),
    'Sheet1'
  );
  XLSX.writeFile(workbook, filePath);
}

const tempHome = fs.mkdtempSync(path.join(os.tmpdir(), 'wechat-notebank-import-json-'));
const globalArchivePath = path.join(tempHome, 'global-archive');
const projectArchivePath = path.join(tempHome, 'project-archive');
fs.mkdirSync(path.join(tempHome, '.config', 'alskai-notebank'), { recursive: true });
fs.writeFileSync(
  path.join(tempHome, '.config', 'alskai-notebank', 'config.json'),
  JSON.stringify({
    archivePath: globalArchivePath,
    processingGoal: '提炼可复用观点',
    autoProcess: true,
  })
);
fs.writeFileSync(
  path.join(tempHome, '.wechat-notebank.json'),
  JSON.stringify({ archivePath: projectArchivePath })
);

const workbookPath = path.join(tempHome, 'mixed.xlsx');
const savedUrl = 'https://mp.weixin.qq.com/s/import-saved';
const failedUrl = 'https://mp.weixin.qq.com/s/import-failed';
const laterUrl = 'https://mp.weixin.qq.com/s/import-later';
writeWorkbook(workbookPath, [
  ['序号', '链接', '文件地址'],
  ['', '', ''],
  [1, savedUrl, ''],
  [2, savedUrl, ''],
  [3, failedUrl, ''],
  [4, laterUrl, ''],
]);

const result = runCli(['import', workbookPath, '--json'], tempHome, {
  WECHAT_NOTEBANK_TEST_FAIL_URL: failedUrl,
});

assert.strictEqual(result.status, 1, result.stderr || result.stdout);
const output = JSON.parse(result.stdout);
const firstSavedFile = path.join(
  projectArchivePath,
  '2026-07-16-AgentJSON接口测试文章.md'
);
const laterSavedFile = path.join(
  projectArchivePath,
  '2026-07-16-AgentJSON接口测试文章-2.md'
);
assert.deepStrictEqual(output, {
  ok: false,
  command: 'import',
  status: 'partial',
  result: {
    sourceFile: workbookPath,
    processingGoal: '提炼可复用观点',
    autoProcess: true,
    summary: {
      success: 2,
      failure: 1,
      skipped: 1,
    },
    items: [
      {
        rowNumber: 3,
        sequence: '1',
        sourceUrl: savedUrl,
        status: 'saved',
        archiveRoot: projectArchivePath,
        savedFile: firstSavedFile,
      },
      {
        rowNumber: 4,
        sequence: '2',
        sourceUrl: savedUrl,
        status: 'skipped',
        archiveRoot: projectArchivePath,
        savedFile: firstSavedFile,
        reason: 'SOURCE_URL_EXISTS',
      },
      {
        rowNumber: 5,
        sequence: '3',
        sourceUrl: failedUrl,
        status: 'failed',
        archiveRoot: projectArchivePath,
        error: {
          code: 'ARTICLE_UNAVAILABLE',
          message: `测试无法获取文章: ${failedUrl}`,
        },
      },
      {
        rowNumber: 6,
        sequence: '4',
        sourceUrl: laterUrl,
        status: 'saved',
        archiveRoot: projectArchivePath,
        savedFile: laterSavedFile,
      },
    ],
  },
  error: {
    code: 'TRANSACTION_FAILED',
    message: '批量导入完成，但有 1 行失败',
  },
});
assert.match(result.stderr, /正在导入 Excel/);
assert.match(result.stderr, /测试无法获取文章/);
assert.ok(fs.existsSync(firstSavedFile));
assert.ok(fs.existsSync(laterSavedFile));
assert.strictEqual(fs.existsSync(globalArchivePath), false);

const retryResult = runCli(['import', workbookPath, '--json'], tempHome);
assert.strictEqual(retryResult.status, 0, retryResult.stderr || retryResult.stdout);
const retryOutput = JSON.parse(retryResult.stdout);
assert.strictEqual(retryOutput.ok, true);
assert.strictEqual(retryOutput.command, 'import');
assert.strictEqual(retryOutput.status, 'completed');
assert.deepStrictEqual(retryOutput.result.summary, {
  success: 1,
  failure: 0,
  skipped: 3,
});
assert.deepStrictEqual(
  retryOutput.result.items.map((item) => item.status),
  ['skipped', 'skipped', 'saved', 'skipped']
);
assert.strictEqual(
  retryOutput.result.items[0].savedFile,
  firstSavedFile
);

const invalidResult = runCli(['import', '--json'], tempHome);
assert.strictEqual(invalidResult.status, 1);
assert.deepStrictEqual(JSON.parse(invalidResult.stdout), {
  ok: false,
  command: 'import',
  status: 'failed',
  error: {
    code: 'CLI_USAGE_ERROR',
    message: '请提供 Excel 文件地址',
  },
});
assert.match(invalidResult.stderr, /请提供 Excel 文件地址/);

console.log('import json tests passed');
