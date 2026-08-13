const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const projectRoot = path.resolve(__dirname, '..');
const cliPath = path.join(projectRoot, 'dist', 'index.js');
const mockPuppeteerPath = path.join(__dirname, 'helpers', 'mock-puppeteer.js');
const mockFetchPath = path.join(__dirname, 'helpers', 'mock-fetch.js');
const imageFixturePath = path.join(__dirname, 'fixtures', 'wechat-article-with-images.html');

function runCli(args, homePath, extraEnv = {}) {
  return spawnSync(process.execPath, [cliPath, ...args], {
    cwd: homePath,
    encoding: 'utf8',
    env: {
      ...process.env,
      ...extraEnv,
      HOME: homePath,
      NODE_OPTIONS: `--require=${mockPuppeteerPath} --require=${mockFetchPath}`,
      WECHAT_NOTEBANK_TEST_HTML_FILE: imageFixturePath,
    },
  });
}

function parseJson(result) {
  assert.ok(result.stdout, result.stderr);
  return JSON.parse(result.stdout);
}

const tempHome = fs.mkdtempSync(path.join(os.tmpdir(), 'wechat-notebank-fetch-images-'));
const imageDir = fs.mkdtempSync(path.join(os.tmpdir(), 'wechat-notebank-test-images-'));
const lazyImage = path.join(imageDir, 'lazy.png');
const ordinaryImage = path.join(imageDir, 'ordinary.jpg');
fs.writeFileSync(lazyImage, 'lazy-image-bytes');
fs.writeFileSync(ordinaryImage, 'ordinary-image-bytes');
const imageMap = JSON.stringify({
  'https://images.example/lazy.png': lazyImage,
  'https://images.example/ordinary.jpg': ordinaryImage,
});

const archivePath = path.join(tempHome, 'archive');
const sourceUrl = 'https://mp.weixin.qq.com/s/fetch-images-success';
const result = runCli(
  ['fetch', sourceUrl, '--output', archivePath, '--json'],
  tempHome,
  { WECHAT_NOTEBANK_TEST_IMAGE_MAP: imageMap }
);
assert.strictEqual(result.status, 0, result.stderr || result.stdout);
const output = parseJson(result);
assert.strictEqual(output.ok, true);
assert.strictEqual(output.status, 'saved');
assert.deepStrictEqual(output.result.images, { total: 3, downloaded: 2 });

const savedFile = output.result.savedFile;
const assetsDir = savedFile.replace(/\.md$/, '.assets');
assert.deepStrictEqual(fs.readdirSync(assetsDir).sort(), ['img1.png', 'img2.jpg']);
assert.strictEqual(fs.readFileSync(path.join(assetsDir, 'img1.png'), 'utf8'), 'lazy-image-bytes');
assert.strictEqual(fs.readFileSync(path.join(assetsDir, 'img2.jpg'), 'utf8'), 'ordinary-image-bytes');
const savedContent = fs.readFileSync(savedFile, 'utf8');
assert.match(savedContent, /\.assets\/img1\.png/);
assert.match(savedContent, /\.assets\/img2\.jpg/);
assert.match(savedContent, /https:\/\/images\.example\/missing\.gif/);
assert.match(savedContent, /data:image\/png;base64,AAAA/);

const noImagesArchive = path.join(tempHome, 'no-images-archive');
const noImagesUrl = 'https://mp.weixin.qq.com/s/fetch-images-disabled';
const noImagesResult = runCli(
  ['fetch', noImagesUrl, '--output', noImagesArchive, '--no-images', '--json'],
  tempHome,
  { WECHAT_NOTEBANK_TEST_IMAGE_MAP: imageMap }
);
assert.strictEqual(noImagesResult.status, 0, noImagesResult.stderr || noImagesResult.stdout);
const noImagesOutput = parseJson(noImagesResult);
assert.deepStrictEqual(noImagesOutput.result.images, { total: 0, downloaded: 0 });
assert.strictEqual(
  fs.existsSync(noImagesOutput.result.savedFile.replace(/\.md$/, '.assets')),
  false
);
const noImagesContent = fs.readFileSync(noImagesOutput.result.savedFile, 'utf8');
assert.match(noImagesContent, /https:\/\/images\.example\/lazy\.png/);
assert.match(noImagesContent, /https:\/\/images\.example\/ordinary\.jpg/);

console.log('fetch images tests passed');
