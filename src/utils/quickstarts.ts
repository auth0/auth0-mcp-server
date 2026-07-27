import * as path from 'path';
import { z } from 'zod';
import { log } from './logger.js';
import { fetchWithOptions } from './fetch.js';
import {
  isFrameworkSupported,
  FRAMEWORK_FILENAMES,
  type SupportedFramework,
} from './onboarding.js';
import type { HandlerResponse } from './types.js';
import { createErrorResponse } from './http-utility.js';

const CDN_BASE = 'https://cdn.auth0.com/manhattan/quickstarts';
const QUICKSTART_RELEASE_URL = `${CDN_BASE}/releases/production.json`;
const LLM_PROMPT_PATH_PREFIX = 'assets/llm-prompts/';

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
    domain: z.union([z.string().min(1), z.object({ inputKey: z.string().min(1) })]),
    port: z.number().optional(),
  }),
  callbackPath: z.string().min(1),
  logoutPath: z.string().min(1),
  llmPromptPath: z.string().min(1).optional(),
  envSnippet: z
    .object({
      type: z.string(),
      language: z.string(),
      fileName: z
        .string()
        .min(1)
        .refine((val) => val === path.basename(val) && !val.includes('..'), {
          message: 'envSnippet.fileName must be a plain filename with no path components',
        }),
      entries: z.array(EnvEntrySchema),
    })
    .optional(),
  placeholders: z.record(z.string(), z.unknown()),
  inputs: z.record(z.string(), z.unknown()),
  environment: z.record(z.string(), z.string()),
});

export type QuickstartSpec = z.infer<typeof QuickstartSpecSchema> & {
  llmPromptUrl?: string;
};
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

function resolveLlmPromptUrl(version: string, llmPromptPath: string): string {
  const versionBase = `${CDN_BASE}/versions/${version}/`;
  const resolvedUrl = new URL(llmPromptPath, versionBase).href;
  const expectedPromptPrefix = `${versionBase}${LLM_PROMPT_PATH_PREFIX}`;

  if (!resolvedUrl.startsWith(expectedPromptPrefix)) {
    throw new Error('Invalid llmPromptPath: resolved URL escapes LLM prompt CDN prefix');
  }

  return resolvedUrl;
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
  const spec: QuickstartSpec = QuickstartSpecSchema.parse(raw);

  if (spec.llmPromptPath) {
    spec.llmPromptUrl = resolveLlmPromptUrl(version, spec.llmPromptPath);
  }

  return spec;
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

/**
 * Whether `raw` is a well-formed SHA256 certificate fingerprint (64 hex digits). Deliberately
 * lenient on separators and case so a paste from `./gradlew signingReport` or `keytool` is accepted
 * either way. Does not transform the value; the original is registered as-is.
 */
export function isValidSha256Fingerprint(raw: string): boolean {
  return /^[0-9a-f]{64}$/.test(normalizeFingerprint(raw));
}

/**
 * Whether `raw` is a well-formed Android package name. Beyond catching typos, this keeps the value
 * safe to concatenate into the callback URL path (%APPLICATION_ID%), which is never re-parsed or
 * escaped downstream.
 */
export function isValidAndroidPackageName(raw: string): boolean {
  return /^[a-zA-Z][a-zA-Z0-9_]*(\.[a-zA-Z][a-zA-Z0-9_]*)+$/.test(raw);
}

/**
 * Whether `raw` is a scheme usable in Auth0.Android's `<data android:scheme>` intent filter.
 * Lowercase-only: `WebAuthProvider.withScheme` warns but does not normalize, so an uppercase value
 * survives into the redirect_uri and fails as a dead redirect after login. Also gated because the
 * value reaches the `%AUTH0_SCHEME%` prompt token and the callback URL unescaped.
 */
export function isValidAndroidScheme(raw: string): boolean {
  return /^[a-z][a-z0-9+\-.]*$/.test(raw);
}

/**
 * Canonical identity form of a fingerprint: separators stripped, lowercased. Used only for
 * equality/dedup — the caller's original text is what gets registered.
 */
export function normalizeFingerprint(raw: string): string {
  return raw.replace(/[\s:]/g, '').toLowerCase();
}

/**
 * Validate the Android-only callback configuration inputs. Returns null when they are valid (or
 * not Android).
 *
 * Values are format-checked, not just checked for presence: each flows unescaped into the
 * registered callback URL and/or the LLM prompt. Every problem is reported in one message, with a
 * hint on where to source each value, so the caller can gather everything in a single pass.
 */
export function validateAndroidInputs(params: {
  isAndroid: boolean;
  applicationId?: string;
  callbackUrlType?: string;
  androidSha256Fingerprint?: string;
  auth0Scheme?: string;
  baseUrl?: string;
}): HandlerResponse | null {
  const {
    isAndroid,
    applicationId,
    callbackUrlType,
    androidSha256Fingerprint,
    auth0Scheme,
    baseUrl,
  } = params;
  if (!isAndroid) {
    return null;
  }

  // Rejected outright rather than silently ignored, so a caller who believes the value is taking
  // effect finds out now.
  if (baseUrl) {
    return createErrorResponse(
      'Error: base_url is not applicable to the android framework. Android callbacks are ' +
        'derived from the custom URL scheme (custom_scheme) or the Auth0 tenant domain ' +
        '(universal_links), not a base URL — remove base_url and call again.'
    );
  }

  const hasValidType = callbackUrlType === 'universal_links' || callbackUrlType === 'custom_scheme';
  const missing: string[] = [];
  if (!applicationId) {
    missing.push(
      'app_package_name — the app package name; read it from the Gradle `applicationId` in app/build.gradle(.kts) (e.g. "com.auth0.samples")'
    );
  } else if (!isValidAndroidPackageName(applicationId)) {
    missing.push(
      'app_package_name — the supplied value is not a valid Android package name (expected two or more dot-separated segments, each starting with a letter, e.g. "com.auth0.samples"). Copy it exactly from the Gradle `applicationId` in app/build.gradle(.kts)'
    );
  }
  if (!hasValidType) {
    missing.push(
      'callback_url_type — "universal_links" (https App Link) or "custom_scheme" (custom URL scheme)'
    );
  }
  if (callbackUrlType === 'universal_links') {
    if (!androidSha256Fingerprint) {
      missing.push(
        'android_sha256_fingerprint — the app signing-cert SHA256 fingerprint, via `./gradlew signingReport` (debug builds) or `keytool -list -v -keystore <path>`'
      );
    } else if (!isValidSha256Fingerprint(androidSha256Fingerprint)) {
      missing.push(
        'android_sha256_fingerprint — the supplied value is not a valid SHA256 fingerprint (expected a 32-byte value, i.e. 64 hex digits / 32 colon-separated pairs). Copy it exactly from `./gradlew signingReport` (the SHA-256 line)'
      );
    }
  }
  if (callbackUrlType === 'custom_scheme') {
    if (!auth0Scheme) {
      missing.push('auth0_scheme — the custom URL scheme the app claims (e.g. "demo")');
    } else if (!isValidAndroidScheme(auth0Scheme)) {
      missing.push(
        'auth0_scheme — the supplied value is not a usable Android scheme. Supply just the lowercase scheme name with no "://", slashes, or spaces (e.g. "demo" or "com.auth0.samples"). Auth0.Android requires a lowercase scheme; an uppercase value would not match the intent filter and login would fail on the redirect back to the app'
      );
    }
  }

  if (missing.length === 0) {
    return null;
  }

  // When the callback style is not yet known, spell out both branches' follow-ups so the caller
  // can supply the right one on the next call.
  const typeNote = hasValidType
    ? []
    : [
        'Note: "universal_links" additionally requires android_sha256_fingerprint; "custom_scheme" additionally requires auth0_scheme. If the signing key is managed elsewhere (e.g. Google Play App Signing) or no keystore exists yet, use "custom_scheme" (no fingerprint required).',
      ];

  const lines = [
    'Error: the android framework needs additional inputs. Gather these (inspect the project rather than asking the user where possible) and call again with all of them:',
    ...missing.map((entry) => `  - ${entry}`),
    ...typeNote,
  ];
  return createErrorResponse(lines.join('\n'));
}
