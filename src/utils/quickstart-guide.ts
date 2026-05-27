import { ResolvedCallbackUrls } from './onboarding.js';

export interface UrlUpdatePayload {
  callbacks?: string[];
  allowed_logout_urls?: string[];
  web_origins?: string[];
  skip_non_verifiable_callback_uri_confirmation_prompt?: boolean;
}

export interface ConfiguredUrls {
  callbacks: string[];
  allowed_logout_urls: string[];
  web_origins?: string[];
  skip_non_verifiable_callback_uri_confirmation_prompt?: boolean;
}

export interface UrlUpdateResult {
  updatePayload: UrlUpdatePayload | null;
  finalUrls: ConfiguredUrls;
}

// TODO: Replace with hasNonVerifiableCallbacks from src/utils/onboarding.ts
// when https://github.com/auth0/auth0-mcp-server/pull/162 is merged
export function hasNonVerifiableCallbacks(urls: string[]): boolean {
  return urls.some((url) => {
    try {
      const parsed = new URL(url);
      if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return true;
      const host = parsed.hostname.toLowerCase();
      if (host === 'localhost' || host === '[::1]' || host === '::1') return true;
      if (host === '0.0.0.0') return true;
      if (/^127\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(host)) return true;
      return false;
    } catch {
      return true;
    }
  });
}

export function resolvePlaceholders(
  prompt: string,
  placeholders: Record<string, unknown>,
  inputValues: Record<string, string>,
  environment: Record<string, string>
): string {
  let result = prompt;

  for (const [placeholder, definition] of Object.entries(placeholders)) {
    let resolved: string | undefined;

    if (typeof definition === 'string') {
      resolved = definition;
    } else if (definition && typeof definition === 'object') {
      const def = definition as Record<string, unknown>;

      if (typeof def.inputKey === 'string') {
        resolved = inputValues[def.inputKey];
      } else if (typeof def.environmentKey === 'string') {
        resolved = environment[def.environmentKey];
      }

      if (resolved !== undefined && (def.prefix || def.suffix)) {
        const prefix = typeof def.prefix === 'string' ? def.prefix : '';
        const suffix = typeof def.suffix === 'string' ? def.suffix : '';
        resolved = `${prefix}${resolved}${suffix}`;
      }
    }

    if (resolved !== undefined) {
      result = result.split(placeholder).join(resolved);
    }
  }

  return result;
}

export function calculateUrlUpdates(
  resolvedUrls: ResolvedCallbackUrls,
  currentApp: Record<string, any>
): UrlUpdateResult {
  const fieldMapping: Array<{
    resolvedKey: keyof ResolvedCallbackUrls;
    appKey: string;
    payloadKey: keyof UrlUpdatePayload;
  }> = [
    { resolvedKey: 'callback_urls', appKey: 'callbacks', payloadKey: 'callbacks' },
    {
      resolvedKey: 'logout_urls',
      appKey: 'allowed_logout_urls',
      payloadKey: 'allowed_logout_urls',
    },
    { resolvedKey: 'web_origins', appKey: 'web_origins', payloadKey: 'web_origins' },
  ];

  const updatePayload: UrlUpdatePayload = {};
  const finalUrls: ConfiguredUrls = {
    callbacks: [],
    allowed_logout_urls: [],
  };
  let hasUpdates = false;

  for (const { resolvedKey, appKey, payloadKey } of fieldMapping) {
    const resolved = resolvedUrls[resolvedKey] as string[] | undefined;
    if (!resolved) continue;

    const existing: string[] = currentApp[appKey] || [];
    const missing = resolved.filter((url) => !existing.includes(url));

    const merged = missing.length > 0 ? [...existing, ...missing] : existing;

    if (payloadKey === 'callbacks') {
      finalUrls.callbacks = merged;
    } else if (payloadKey === 'allowed_logout_urls') {
      finalUrls.allowed_logout_urls = merged;
    } else if (payloadKey === 'web_origins') {
      finalUrls.web_origins = merged;
    }

    if (missing.length > 0) {
      hasUpdates = true;
      (updatePayload as any)[payloadKey] = merged;
    }
  }

  if (hasUpdates && hasNonVerifiableCallbacks(finalUrls.callbacks)) {
    updatePayload.skip_non_verifiable_callback_uri_confirmation_prompt = true;
    finalUrls.skip_non_verifiable_callback_uri_confirmation_prompt = true;
  }

  return {
    updatePayload: hasUpdates ? updatePayload : null,
    finalUrls,
  };
}
