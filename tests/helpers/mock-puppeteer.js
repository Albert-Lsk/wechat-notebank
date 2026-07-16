const fs = require('fs');
const Module = require('module');

const originalLoad = Module._load;

Module._load = function loadWithMockedPuppeteer(request, parent, isMain) {
  if (request !== 'puppeteer-core') {
    return originalLoad.call(this, request, parent, isMain);
  }

  return {
    __esModule: true,
    default: {
      launch: async () => ({
        newPage: async () => {
          let currentUrl = '';
          return {
            setUserAgent: async () => {},
            setExtraHTTPHeaders: async () => {},
            goto: async (url) => {
              currentUrl = url;
              if (url === process.env.WECHAT_NOTEBANK_TEST_FAIL_URL) {
                throw new Error(`测试无法获取文章: ${url}`);
              }
            },
            waitForSelector: async () => {},
            content: async () => {
              if (currentUrl === process.env.WECHAT_NOTEBANK_TEST_FAIL_URL) {
                throw new Error(`测试无法获取文章: ${currentUrl}`);
              }
              return fs.readFileSync(
                process.env.WECHAT_NOTEBANK_TEST_HTML_FILE,
                'utf8'
              );
            },
          };
        },
        close: async () => {},
      }),
    },
  };
};
