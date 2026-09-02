const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { localizeImages } = require('../dist/lib/images');

function createTempAssetsDir() {
  return path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'wechat-notebank-images-')), 'article.assets');
}

function response(body, options = {}) {
  return new Response(body, options);
}

async function run() {
  const originalFetch = globalThis.fetch;

  try {
    const successAssetsDir = createTempAssetsDir();
    const calls = [];
    globalThis.fetch = async (url, options) => {
      calls.push({ url, options });
      if (url === 'https://images.example/one') {
        return response(Buffer.from('one'), { headers: { 'Content-Type': 'image/png' } });
      }
      if (url === 'https://images.example/two?wx_fmt=gif') {
        return response(Buffer.from('two'), { headers: { 'Content-Type': 'application/octet-stream' } });
      }
      throw new Error(`unexpected image URL: ${url}`);
    };

    const success = await localizeImages(
      '<p>before</p>'
        + '<img src="https://images.example/one">'
        + '<img src="data:image/png;base64,AAAA">'
        + '<img src="https://images.example/two?wx_fmt=gif">',
      successAssetsDir,
      'article.assets'
    );

    assert.deepStrictEqual(success, {
      content: '<p>before</p><img src="./article.assets/img1.png"><img src="data:image/png;base64,AAAA"><img src="./article.assets/img2.gif">',
      total: 2,
      downloaded: 2,
    });
    assert.deepStrictEqual(fs.readdirSync(successAssetsDir).sort(), ['img1.png', 'img2.gif']);
    assert.strictEqual(fs.readFileSync(path.join(successAssetsDir, 'img1.png'), 'utf8'), 'one');
    assert.strictEqual(fs.readFileSync(path.join(successAssetsDir, 'img2.gif'), 'utf8'), 'two');
    assert.strictEqual(calls.length, 2);
    assert.strictEqual(calls[0].options.redirect, 'manual');
    assert.strictEqual(calls[0].options.headers.Referer, 'https://mp.weixin.qq.com/');
    assert.match(calls[0].options.headers['User-Agent'], /^Mozilla\/5\.0 \(Macintosh; Intel Mac OS X/);

    const timeoutAssetsDir = createTempAssetsDir();
    const timeoutUrl = 'https://images.example/timeout';
    globalThis.fetch = async (_url, options) => {
      assert.ok(options.signal, 'image requests should carry an AbortSignal');
      await new Promise((resolve, reject) => {
        const keepEventLoopAlive = setTimeout(() => reject(new Error('mock timeout')), 1000);
        const onAbort = () => {
          clearTimeout(keepEventLoopAlive);
          reject(new Error('aborted'));
        };
        options.signal.addEventListener('abort', onAbort, { once: true });
      });
      throw new Error('aborted');
    };
    const previousTimeout = process.env.WECHAT_NOTEBANK_IMAGE_TIMEOUT_MS;
    process.env.WECHAT_NOTEBANK_IMAGE_TIMEOUT_MS = '10';
    const timedOut = await localizeImages(`<img src="${timeoutUrl}">`, timeoutAssetsDir, 'timeout.assets');
    if (previousTimeout === undefined) {
      delete process.env.WECHAT_NOTEBANK_IMAGE_TIMEOUT_MS;
    } else {
      process.env.WECHAT_NOTEBANK_IMAGE_TIMEOUT_MS = previousTimeout;
    }
    assert.deepStrictEqual(timedOut, {
      content: `<img src="${timeoutUrl}">`,
      total: 1,
      downloaded: 0,
    });
    assert.strictEqual(fs.existsSync(timeoutAssetsDir), false);

    const failedAssetsDir = createTempAssetsDir();
    const failedUrl = 'https://images.example/forbidden';
    globalThis.fetch = async () => response('forbidden', { status: 403 });
    const failed = await localizeImages(`<img src="${failedUrl}">`, failedAssetsDir, 'failed.assets');
    assert.deepStrictEqual(failed, {
      content: `<img src="${failedUrl}">`,
      total: 1,
      downloaded: 0,
    });
    assert.strictEqual(fs.existsSync(failedAssetsDir), false, 'failed downloads should not create an empty directory');

    const ssrfAssetsDir = createTempAssetsDir();
    let ssrfFetchCalls = 0;
    globalThis.fetch = async () => {
      ssrfFetchCalls += 1;
      return response('should not be fetched', { headers: { 'Content-Type': 'image/jpeg' } });
    };
    const ssrfUrl = 'http://127.0.0.1/private.png';
    const ssrf = await localizeImages(`<img src="${ssrfUrl}">`, ssrfAssetsDir, 'ssrf.assets');
    assert.deepStrictEqual(ssrf, { content: `<img src="${ssrfUrl}">`, total: 1, downloaded: 0 });
    assert.strictEqual(ssrfFetchCalls, 0, 'SSRF-blocked URLs must not reach fetch');

    const redirectAssetsDir = createTempAssetsDir();
    const redirectCalls = [];
    globalThis.fetch = async (url) => {
      redirectCalls.push(url);
      return response('', { status: 302, headers: { Location: 'http://169.254.169.254/latest/meta-data/' } });
    };
    const redirectUrl = 'https://images.example/redirect';
    const redirected = await localizeImages(`<img src="${redirectUrl}">`, redirectAssetsDir, 'redirect.assets');
    assert.deepStrictEqual(redirected, { content: `<img src="${redirectUrl}">`, total: 1, downloaded: 0 });
    assert.deepStrictEqual(redirectCalls, [redirectUrl], 'unsafe redirect target must be blocked before fetch');
    assert.strictEqual(fs.existsSync(redirectAssetsDir), false);

    const extensionAssetsDir = createTempAssetsDir();
    const extensionResponses = new Map([
      ['https://images.example/jpeg', response('jpeg', { headers: { 'Content-Type': 'image/jpeg; charset=binary' } })],
      ['https://images.example/format?wx_fmt=webp', response('webp', { headers: { 'Content-Type': 'application/octet-stream' } })],
      ['https://images.example/fallback', response('fallback', { headers: { 'Content-Type': 'application/octet-stream' } })],
    ]);
    globalThis.fetch = async (url) => extensionResponses.get(url);
    const extensions = await localizeImages(
      '<img src="https://images.example/jpeg">'
        + '<img src="https://images.example/format?wx_fmt=webp">'
        + '<img src="https://images.example/fallback">',
      extensionAssetsDir,
      'extension.assets'
    );
    assert.strictEqual(extensions.downloaded, 3);
    assert.match(extensions.content, /img1\.jpg/);
    assert.match(extensions.content, /img2\.webp/);
    assert.match(extensions.content, /img3\.jpg/);
    assert.deepStrictEqual(fs.readdirSync(extensionAssetsDir).sort(), ['img1.jpg', 'img2.webp', 'img3.jpg']);

    const noImagesAssetsDir = createTempAssetsDir();
    globalThis.fetch = async () => {
      throw new Error('no-images input should not call fetch');
    };
    const noImages = await localizeImages('<p>text only</p>', noImagesAssetsDir, 'none.assets');
    assert.deepStrictEqual(noImages, { content: '<p>text only</p>', total: 0, downloaded: 0 });
    assert.strictEqual(fs.existsSync(noImagesAssetsDir), false);

    console.log('image localization tests passed');
  } finally {
    globalThis.fetch = originalFetch;
  }
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
