const assert = require('assert');
const { assertSafeArticleUrl } = require('../dist/lib/url');

function run() {
  // 合法的公网 https 链接应通过
  assert.strictEqual(
    assertSafeArticleUrl('https://mp.weixin.qq.com/s/abc').hostname,
    'mp.weixin.qq.com'
  );
  assert.doesNotThrow(() => assertSafeArticleUrl('http://example.com/article'));

  // 非 http(s) 协议应被拒绝（含本地文件读取）
  assert.throws(() => assertSafeArticleUrl('file:///etc/passwd'), /协议/);
  assert.throws(() => assertSafeArticleUrl('ftp://example.com/x'), /协议/);
  assert.throws(() => assertSafeArticleUrl('not-a-url'), /无效的链接/);

  // SSRF：回环 / 内网 / 链路本地 / 云元数据应被拒绝
  const blocked = [
    'http://127.0.0.1/admin',
    'http://localhost:8080/',
    'http://169.254.169.254/latest/meta-data/',
    'http://10.0.0.5/',
    'http://192.168.1.1/',
    'http://172.16.0.1/',
    'http://172.31.255.255/',
    'http://[::1]/',
  ];
  for (const url of blocked) {
    assert.throws(() => assertSafeArticleUrl(url), /内网|本地/, `should block ${url}`);
  }

  // 公网范围的 172（非 16-31 段）应通过
  assert.doesNotThrow(() => assertSafeArticleUrl('http://172.32.0.1/'));

  console.log('url validation tests passed');
}

run();
