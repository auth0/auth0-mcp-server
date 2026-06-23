import * as path from 'path';
import * as os from 'os';
import type { QuickstartSpec, QuickstartAppType, DefaultAppOrigin } from './quickstarts';

// Directories that must never receive credential files.
const POSIX_DENIED_PREFIXES = [
  '/etc', '/var', '/usr', '/bin', '/sbin', '/lib', '/lib64',
  '/boot', '/run', '/root', '/tmp', '/opt',
];

const WINDOWS_DENIED_PREFIXES = [
  'C:\\Windows', 'C:\\Program Files', 'C:\\Program Files (x86)',
  'C:\\ProgramData', 'C:\\System Volume Information',
];

export function hasProjectMarker(resolvedDir: string): boolean {
  const homeDir = os.homedir();
  if (resolvedDir === homeDir) return false;
  
  // Block hidden config directories directly inside home (e.g. ~/.ssh, ~/.config)
  if (
    resolvedDir.startsWith(homeDir + path.sep) &&
    path.basename(resolvedDir).startsWith('.')
  ) return false;

  if (process.platform === 'win32') {
    const lower = resolvedDir.toLowerCase();
    return !WINDOWS_DENIED_PREFIXES.some(
      (p) => lower === p.toLowerCase() || lower.startsWith(p.toLowerCase() + path.sep)
    );
  }

  return !POSIX_DENIED_PREFIXES.some(
    (p) => resolvedDir === p || resolvedDir.startsWith(p + path.sep)
  );
}

export const FRAMEWORK_FILENAMES = {
  react: 'react-quickstart-definition.json',
  vue: 'vuejs-quickstart-definition.json',
  angular: 'angular-quickstart-definition.json',
  nextjs: 'nextjs-quickstart-definition.json',
} as const;

export const SUPPORTED_FRAMEWORKS = Object.keys(FRAMEWORK_FILENAMES) as Array<
  keyof typeof FRAMEWORK_FILENAMES
>;
export type SupportedFramework = keyof typeof FRAMEWORK_FILENAMES;

export function isFrameworkSupported(framework: string): framework is SupportedFramework {
  return SUPPORTED_FRAMEWORKS.includes(framework.toLowerCase() as SupportedFramework);
}

export enum UrlSource {
  Detected = 'detected',
  FrameworkDefault = 'framework_default',
}

export interface ResolvedCallbackUrls {
  base_url: string;
  callback_urls?: string[];
  logout_urls?: string[];
  web_origins?: string[];
  url_source: UrlSource;
}

const APP_TYPE_URL_CONFIGS: Record<QuickstartAppType, Set<string>> = {
  spa: new Set(['callback_urls', 'logout_urls', 'web_origins']),
  webapp: new Set(['callback_urls', 'logout_urls']),
  native: new Set(['callback_urls', 'logout_urls']),
};

export const resolveDefaultOrigin = (defaultAppOrigin: DefaultAppOrigin): string => {
  const { scheme, domain, port } = defaultAppOrigin;
  const resolvedPort = port !== undefined ? String(port) : '';

  return new URL(`${scheme}://${domain}${resolvedPort ? `:${resolvedPort}` : ''}`).origin;
};

export const resolveCallbackUrls = (quickstartSpec: QuickstartSpec, baseUrl?: string) => {
  const resolvedBaseUrl = baseUrl
    ? baseUrl.trim().replace(/\/+$/, '')
    : resolveDefaultOrigin(quickstartSpec.defaultAppOrigin);

  const urlSource = baseUrl ? UrlSource.Detected : UrlSource.FrameworkDefault;

  const urlKeys = APP_TYPE_URL_CONFIGS[quickstartSpec.appType];

  const callbackUrl = quickstartSpec.callbackPath
    ? `${resolvedBaseUrl}${quickstartSpec.callbackPath}`
    : resolvedBaseUrl;

  const logoutUrl = quickstartSpec.logoutPath
    ? `${resolvedBaseUrl}${quickstartSpec.logoutPath}`
    : resolvedBaseUrl;

  return {
    base_url: resolvedBaseUrl,
    ...(urlKeys.has('callback_urls') && { callback_urls: [callbackUrl] }),
    ...(urlKeys.has('logout_urls') && { logout_urls: [logoutUrl] }),
    ...(urlKeys.has('web_origins') && { web_origins: [resolvedBaseUrl] }),
    url_source: urlSource,
  };
};

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
