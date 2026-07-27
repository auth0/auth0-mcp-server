import { ResolvedCallbackUrls, hasNonVerifiableCallbacks } from './onboarding.js';

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
