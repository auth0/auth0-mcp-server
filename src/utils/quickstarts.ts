import { z } from 'zod';
import { log } from './logger.js';
import { fetchWithOptions } from './fetch.js';
import { isFrameworkSupported, FRAMEWORK_FILENAMES, type SupportedFramework } from './onboarding.js';

const CDN_BASE = 'https://cdn.auth0.com/manhattan/quickstarts';
const QUICKSTART_RELEASE_URL = `${CDN_BASE}/releases/production.json`;

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

const EnvEntrySchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('separator') }),
  z.object({
    type: z.literal('var'),
    name: z.string(),
    value: z.string(),
    comment: z.string().optional(),
    sensitive: z.boolean().optional(),
  }),
]);

const QuickstartSpecSchema = z.object({
  appType: z.enum(['spa', 'webapp', 'native']),
  defaultAppOrigin: z.object({
    scheme: z.string().min(1),
    domain: z.string().min(1),
    port: z.number().optional(),
  }),
  callbackPath: z.string().min(1),
  logoutPath: z.string().min(1),
  llmPromptPath: z.string().min(1).optional(),
  envSnippet: z.object({
    type: z.string(),
    language: z.string(),
    fileName: z.string().min(1),
    entries: z.array(EnvEntrySchema),
  }).optional(),
  placeholders: z.record(z.string(), z.unknown()),
  inputs: z.record(z.string(), z.unknown()),
  environment: z.record(z.string(), z.string()),
});

export type QuickstartSpec = z.infer<typeof QuickstartSpecSchema>;
export type QuickstartAppType = QuickstartSpec['appType'];
export type DefaultAppOrigin = QuickstartSpec['defaultAppOrigin'];

const cache = new Map<string, CacheEntry>();
const inflight = new Map<string, Promise<QuickstartSpec | null>>();

class QuickstartCDNNotFoundError extends Error {
  constructor(url: string) {
    super(`Quickstart CDN resource not found: ${url}`);
    this.name = 'QuickstartCDNNotFoundError';
  }
}


const fetchFromCDN = async (framework: string): Promise<QuickstartSpec> => {
  const quickstartReleaseResponse = await fetchWithOptions(QUICKSTART_RELEASE_URL, FETCH_OPTIONS);
  if (!quickstartReleaseResponse.ok) {
    throw new Error(`Failed to fetch production.json: ${quickstartReleaseResponse.status}`);
  }

  const { current: version } =
    (await quickstartReleaseResponse.json()) as QuickstartReleaseResponse;

  if (!/^\d+\.\d+\.\d+$/.test(version)) {
    throw new Error(`Invalid version format from CDN: ${version}`);
  }

  const fileName = FRAMEWORK_FILENAMES[framework as SupportedFramework];
  const url = `${CDN_BASE}/versions/${version}/assets/definitions/en/${fileName}`;

  const definitionResponse = await fetchWithOptions(url, FETCH_OPTIONS);
  if (definitionResponse.status === 404) {
    throw new QuickstartCDNNotFoundError(url);
  }

  if (!definitionResponse.ok) {
    throw new Error(`Failed to fetch definition: ${definitionResponse.status}`);
  }

  const raw = await definitionResponse.json();
  return QuickstartSpecSchema.parse(raw);
};

export const fetchQuickstartSpec = async (framework: string): Promise<QuickstartSpec | null> => {
  if (!isFrameworkSupported(framework)) {
    return null;
  }

  const key = framework.toLowerCase();

  const now = Date.now();
  const cached = cache.get(key);

  if (cached && now - cached.fetchedAt < CACHE_TTL_MS) {
    return cached.spec;
  }

  const existing = inflight.get(key);
  if (existing) return existing;

  // Deduplicate concurrent cache-miss fetches so only one CDN request fires per framework at a time.
  const promise = (async () => {
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
    } finally {
      inflight.delete(key);
    }
  })();

  inflight.set(key, promise);
  return promise;
};
