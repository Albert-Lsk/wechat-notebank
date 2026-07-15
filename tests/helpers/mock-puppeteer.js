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
        newPage: async () => ({
          setUserAgent: async () => {},
          setExtraHTTPHeaders: async () => {},
          goto: async () => {},
          waitForSelector: async () => {},
          content: async () => fs.readFileSync(
            process.env.WECHAT_NOTEBANK_TEST_HTML_FILE,
            'utf8'
          ),
        }),
        close: async () => {},
      }),
    },
  };
};
