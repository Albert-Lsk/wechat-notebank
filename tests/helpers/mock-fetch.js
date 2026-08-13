const fs = require('fs');
const path = require('path');

function extensionToContentType(filePath) {
  switch (path.extname(filePath).toLowerCase()) {
    case '.png':
      return 'image/png';
    case '.gif':
      return 'image/gif';
    case '.webp':
      return 'image/webp';
    case '.jpg':
    case '.jpeg':
      return 'image/jpeg';
    default:
      return 'application/octet-stream';
  }
}

function readImageMap() {
  const raw = process.env.WECHAT_NOTEBANK_TEST_IMAGE_MAP;
  if (!raw) {
    return {};
  }

  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? parsed
      : {};
  } catch {
    return {};
  }
}

const originalFetch = globalThis.fetch;
globalThis.fetch = async (url) => {
  const imageMap = readImageMap();
  const filePath = imageMap[String(url)];
  if (typeof filePath !== 'string') {
    return new Response('mock image not found', { status: 403 });
  }

  try {
    const body = fs.readFileSync(filePath);
    return new Response(body, {
      status: 200,
      headers: {
        'Content-Type': extensionToContentType(filePath),
      },
    });
  } catch {
    return new Response('mock image not found', { status: 403 });
  }
};

// Keep a reference for tests that explicitly restore the process-wide mock.
globalThis.__WECHAT_NOTEBANK_ORIGINAL_FETCH__ = originalFetch;
