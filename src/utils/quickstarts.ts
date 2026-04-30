import { log } from './logger.js';
import { fetchWithOptions } from './fetch.js';
import { QuickstartSpec } from './types.js';

const CDN_BASE = 'https://cdn.auth0.com/manhattan/quickstarts';
const QUICKSTART_RELEASE_URL = `${CDN_BASE}/releases/production.json`;

const FRAMEWORK_FILENAMES: Record<string, string> = {
  react: 'react-quickstart-definition.json',
  vue: 'vuejs-quickstart-definition.json',
  angular: 'angular-quickstart-definition.json',
  nextjs: 'nextjs-quickstart-definition.json',
};

const CACHE_TTL_MS = 60 * 60 * 1000;
const FETCH_OPTIONS = { retries: 1 };

interface CacheEntry {
  spec: QuickstartSpec;
  fetchedAt: number;
}

interface QuickstartReleaseResponse {
  name: string;
  scheme: string;
  current: string;
  fallback: string;
}

const cache = new Map<string, CacheEntry>();

class QuickstartCDNNotFoundError extends Error {
  constructor(url: string) {
    super(`Quickstart CDN resource not found: ${url}`);
    this.name = 'QuickstartCDNNotFoundError';
  }
}

const stripUnusedFields = (raw: any): QuickstartSpec => ({
  appType: raw.appType,
  defaultAppOrigin: raw.defaultAppOrigin,
  callbackPath: raw.callBackPath,
  logoutPath: raw.logoutPath,
  inputs: raw.inputs,
  placeholders: raw.placeholders,
  environment: raw.environment,
  llmPromptUrl: raw.llmPromptUrl,
  envSnippet: raw.envSnippet,
});

const fetchFromCDN = async (framework: string): Promise<QuickstartSpec> => {
  const quickstartReleaseResponse = await fetchWithOptions(QUICKSTART_RELEASE_URL, FETCH_OPTIONS);
  if (!quickstartReleaseResponse.ok) {
    throw new Error(`Failed to fetch latest.json: ${quickstartReleaseResponse.status}`);
  }

  const { current: version } =
    (await quickstartReleaseResponse.json()) as QuickstartReleaseResponse;

  const fileName = FRAMEWORK_FILENAMES[framework];
  const url = `${CDN_BASE}/versions/${version}/assets/definitions/${fileName}`;

  const definitionResponse = await fetchWithOptions(url, FETCH_OPTIONS);
  if (definitionResponse.status === 404) {
    throw new QuickstartCDNNotFoundError(url);
  }

  if (!definitionResponse.ok) {
    throw new Error(`Failed to fetch definition: ${definitionResponse.status}`);
  }

  const raw = await definitionResponse.json();
  return stripUnusedFields(raw);
};

export const fetchQuickstartSpec = async (framework: string): Promise<QuickstartSpec | null> => {
  const key = framework.toLowerCase();

  if (!FRAMEWORK_FILENAMES[key]) {
    return null;
  }

  const now = Date.now();
  const cached = cache.get(key);

  if (cached && now - cached.fetchedAt < CACHE_TTL_MS) {
    return cached.spec;
  }

  try {
    const spec = await fetchFromCDN(key);
    cache.set(key, { spec, fetchedAt: Date.now() });
    return spec;
  } catch (error) {
    if (error instanceof QuickstartCDNNotFoundError) {
      log(`Quickstart spec not found for framework: ${key}`);
      return null;
    }

    if (cached) {
      log(`Returning stale quickstart spec for ${key} due to CDN error`);
      return cached.spec;
    }

    log(`CDN fetch failed and no cached data for ${key}: ${error}`);
    return null;
  }
};
