import { QuickstartSpec, QuickstartAppType, DefaultAppOrigin } from './types';

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
