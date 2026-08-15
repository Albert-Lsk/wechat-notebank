const fs = require('fs');
const Module = require('module');

const originalLoad = Module._load;

function readJsonMap(envName) {
  const raw = process.env[envName];
  if (!raw) {
    return {};
  }
  return JSON.parse(raw);
}

function resolveHtmlFile(currentUrl) {
  const htmlMap = readJsonMap('WECHAT_NOTEBANK_TEST_HTML_MAP');
  if (Object.prototype.hasOwnProperty.call(htmlMap, currentUrl)) {
    return htmlMap[currentUrl];
  }
  for (const [prefix, filePath] of Object.entries(htmlMap)) {
    if (currentUrl.startsWith(prefix)) {
      return filePath;
    }
  }
  return process.env.WECHAT_NOTEBANK_TEST_HTML_FILE;
}

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
              const delayMs = Number(process.env.WECHAT_NOTEBANK_TEST_GOTO_DELAY_MS || 0);
              if (delayMs > 0) {
                await new Promise((resolve) => setTimeout(resolve, delayMs));
              }
              if (url === process.env.WECHAT_NOTEBANK_TEST_FAIL_URL) {
                throw new Error(`测试无法获取文章: ${url}`);
              }
              const redirectMap = readJsonMap('WECHAT_NOTEBANK_TEST_REDIRECT_MAP');
              if (Object.prototype.hasOwnProperty.call(redirectMap, url)) {
                currentUrl = redirectMap[url];
              }
            },
            waitForSelector: async () => {},
            url: () => currentUrl,
            content: async () => {
              if (currentUrl === process.env.WECHAT_NOTEBANK_TEST_FAIL_URL) {
                throw new Error(`测试无法获取文章: ${currentUrl}`);
              }
              return fs.readFileSync(resolveHtmlFile(currentUrl), 'utf8');
            },
          };
        },
        close: async () => {},
      }),
    },
  };
};
