const assert = require('assert');
const { fetchArticleHtmlFromPage } = require('../dist/lib/parser');

async function run() {
  delete process.env.WECHAT_NOTEBANK_NAVIGATION_TIMEOUT_MS;
  delete process.env.WECHAT_NOTEBANK_CONTENT_TIMEOUT_MS;

  const calls = [];
  const page = {
    async goto(url, options) {
      calls.push({ method: 'goto', url, options });
    },
    async waitForSelector(selector, options) {
      calls.push({ method: 'waitForSelector', selector, options });
    },
    async content() {
      calls.push({ method: 'content' });
      return '<html><body><div id="js_content">ok</div></body></html>';
    },
  };

  const html = await fetchArticleHtmlFromPage(page, 'https://mp.weixin.qq.com/s/example');

  assert.strictEqual(html, '<html><body><div id="js_content">ok</div></body></html>');
  assert.deepStrictEqual(calls[0], {
    method: 'goto',
    url: 'https://mp.weixin.qq.com/s/example',
    options: {
      waitUntil: 'domcontentloaded',
      timeout: 60000,
    },
  });
  assert.deepStrictEqual(calls[1], {
    method: 'waitForSelector',
    selector: '#js_content',
    options: {
      timeout: 30000,
    },
  });

  const timeoutCalls = [];
  const timeoutPage = {
    async goto() {
      timeoutCalls.push('goto');
      throw new Error('Navigation timeout of 30000 ms exceeded');
    },
    async waitForSelector() {
      timeoutCalls.push('waitForSelector');
    },
    async content() {
      timeoutCalls.push('content');
      return '<html><body><div id="js_content">loaded after timeout</div></body></html>';
    },
  };

  assert.strictEqual(
    await fetchArticleHtmlFromPage(timeoutPage, 'https://mp.weixin.qq.com/s/slow'),
    '<html><body><div id="js_content">loaded after timeout</div></body></html>'
  );
  assert.deepStrictEqual(timeoutCalls, ['goto', 'waitForSelector', 'content']);

  const networkErrorPage = {
    async goto() {
      throw new Error('net::ERR_NAME_NOT_RESOLVED');
    },
    async waitForSelector() {},
    async content() {
      return '';
    },
  };

  await assert.rejects(
    () => fetchArticleHtmlFromPage(networkErrorPage, 'https://mp.weixin.qq.com/s/bad'),
    /ERR_NAME_NOT_RESOLVED/
  );

  console.log('fetch html tests passed');
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
