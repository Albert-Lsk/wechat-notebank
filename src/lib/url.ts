/**
 * 抓取地址的安全校验：只允许 http/https 公网地址，
 * 阻断 file://、内网 / 回环 / 链路本地地址以及云元数据端点，避免 SSRF 与本地文件读取。
 */

// 私有 / 回环 / 链路本地等不应被抓取的网段
const BLOCKED_IPV4_PATTERNS: RegExp[] = [
  /^127\./, // 回环
  /^10\./, // 私有 A
  /^192\.168\./, // 私有 C
  /^169\.254\./, // 链路本地 / 云元数据 169.254.169.254
  /^0\./, // 当前网络
  /^192\.0\.2\./, // TEST-NET
];

function isBlockedIpv4(host: string): boolean {
  // 172.16.0.0 – 172.31.255.255（私有 B）
  const privateB = host.match(/^172\.(\d{1,3})\./);
  if (privateB) {
    const second = Number(privateB[1]);
    if (second >= 16 && second <= 31) {
      return true;
    }
  }

  return BLOCKED_IPV4_PATTERNS.some((pattern) => pattern.test(host));
}

function isBlockedHostname(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, '');

  if (host === 'localhost' || host.endsWith('.localhost')) {
    return true;
  }

  // IPv6 回环 / 未指定地址，以及 IPv4 映射的回环
  if (host === '::1' || host === '::' || host.includes('::ffff:127.')) {
    return true;
  }

  // IPv6 唯一本地地址 (fc00::/7) 与链路本地 (fe80::/10)
  if (/^f[cd][0-9a-f]{2}:/.test(host) || /^fe[89ab][0-9a-f]:/.test(host)) {
    return true;
  }

  return isBlockedIpv4(host);
}

/**
 * 校验抓取地址；不合法时抛出带原因的错误。
 */
export function assertSafeArticleUrl(rawUrl: string): URL {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new Error(`无效的链接: ${rawUrl}`);
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error(`不支持的协议 "${parsed.protocol}"，只允许 http/https 链接`);
  }

  if (isBlockedHostname(parsed.hostname)) {
    throw new Error(`拒绝抓取内网 / 本地地址: ${parsed.hostname}`);
  }

  return parsed;
}
