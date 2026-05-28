function isLoopbackUri(url: URL): boolean {
  const hostname = url.hostname.toLowerCase();
  if (hostname === 'localhost') return true;

  const clean =
    hostname.startsWith('[') && hostname.endsWith(']') ? hostname.slice(1, -1) : hostname;

  if (/^127\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(clean)) return true;
  if (clean === '::1') return true;

  return false;
}

function isCustomUriScheme(url: URL): boolean {
  return url.protocol !== 'http:' && url.protocol !== 'https:';
}

function isRedirectUriVerifiable(url: URL): boolean {
  return !isCustomUriScheme(url) && !isLoopbackUri(url);
}

export function hasNonVerifiableCallbacks(callbackUrls: string[]): boolean {
  return callbackUrls.some((urlStr) => {
    try {
      return !isRedirectUriVerifiable(new URL(urlStr));
    } catch {
      return false;
    }
  });
}
