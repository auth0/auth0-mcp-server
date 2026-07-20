import * as fs from 'fs';
import * as path from 'path';
import type { HandlerConfig, HandlerRequest, HandlerResponse, Tool } from '../utils/types.js';
import { log } from '../utils/logger.js';
import { createErrorResponse, createSuccessResponse } from '../utils/http-utility.js';
import { fetchQuickstartSpec } from '../utils/quickstarts.js';
import {
  resolveCallbackUrls,
  isFrameworkSupported,
  SUPPORTED_FRAMEWORKS,
} from '../utils/onboarding.js';
import { fetchWithOptions } from '../utils/fetch.js';
import { calculateUrlUpdates } from '../utils/quickstart-guide.js';
import { resolvePlaceholders } from '../utils/quickstart-placeholders.js';
import { detectExistingEnvFile } from '../utils/credentials-writer.js';
import { APPLICATION_HANDLERS } from './applications.js';
import trackEvent, { OnboardingStep, OnboardingStepStatus } from '../utils/analytics.js';

export const QUICKSTART_TOOLS: Tool[] = [
  {
    name: 'auth0_get_quickstart_guide',
    description:
      'Fetch and return the Auth0 quickstart implementation prompt for a specific framework. ' +
      'Resolves callback URLs from the project configuration and updates them on the Auth0 ' +
      'application. Fetches the quickstart prompt from CDN and injects runtime values. ' +
      "The returned prompt contains code that should be implemented in the user's project. " +
      'If you have file-write capabilities, implement the code directly at project_path. ' +
      'If you do not have file-write capabilities, present the code to the user with clear ' +
      'instructions for where each file should be created or modified. ' +
      'Requires client_id, framework, and project_path. If the application does not exist, call auth0_onboarding first. ' +
      'After updating, always inform the user about any automatically applied settings (such as skip_non_verifiable_callback_uri_confirmation_prompt).',
    inputSchema: {
      type: 'object',
      properties: {
        client_id: {
          type: 'string',
          description: 'Auth0 application client_id',
        },
        framework: {
          type: 'string',
          enum: SUPPORTED_FRAMEWORKS,
          description: 'Supported framework for the quickstart',
        },
        project_path: {
          type: 'string',
          description:
            'Absolute path to the project directory. Used for .env file check and project config port detection.',
        },
        base_url: {
          type: 'string',
          description:
            'Explicit base URL override for callback resolution (e.g. http://localhost:3000)',
        },
        app_package_name: {
          type: 'string',
          description:
            'Android only. The app package name / Gradle applicationId (e.g. "com.auth0.samples"), ' +
            'used in the callback URL and registered as mobile.android.app_package_name. ' +
            'Required when framework is "android".',
        },
        callback_url_type: {
          type: 'string',
          enum: ['universal_links', 'custom_scheme'],
          description:
            'Android only. The callback style: "universal_links" (https App Link, requires ' +
            'android_sha256_fingerprint) or "custom_scheme" (custom URL scheme, requires auth0_scheme). ' +
            'Required when framework is "android".',
        },
        android_sha256_fingerprint: {
          type: 'string',
          description:
            'Android only. The app signing certificate SHA256 fingerprint (colon-separated hex). ' +
            'Registered as mobile.android.sha256_cert_fingerprints so Auth0 can serve the App Link ' +
            'assetlinks association. Obtain via `./gradlew signingReport` (debug builds) or ' +
            '`keytool -list -v -keystore <path>`. Required when callback_url_type is "universal_links".',
        },
        auth0_scheme: {
          type: 'string',
          description:
            'Android only. The custom URL scheme the app claims (e.g. "com.auth0.samples" or "demo"). ' +
            'Drives the scheme of the registered callback URL. Required when callback_url_type is "custom_scheme".',
        },
      },
      required: ['client_id', 'framework', 'project_path'],
      additionalProperties: false,
    },
    _meta: {
      requiredScopes: ['read:clients', 'update:clients'],
      localOnly: true,
    },
    annotations: {
      title: 'Get Quickstart Guide',
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: true,
      openWorldHint: true,
    },
  },
];

/**
 * Whether `raw` is a well-formed SHA256 certificate fingerprint (a 32-byte value = 64 hex
 * digits). Lenient on separators and case — colon-, space-, or unseparated input all pass, so a
 * paste from `./gradlew signingReport` is accepted regardless of incidental formatting. Only
 * clearly-malformed values (truncated, non-hex, wrong length) are rejected. Does not transform
 * the value; the original is registered as-is.
 */
function isValidSha256Fingerprint(raw: string): boolean {
  return /^[0-9a-f]{64}$/.test(normalizeFingerprint(raw));
}

/**
 * Canonical identity form of a fingerprint: separators stripped, lowercased. Used only for
 * equality/dedup — the caller's original text is what gets registered.
 */
function normalizeFingerprint(raw: string): string {
  return raw.replace(/[\s:]/g, '').toLowerCase();
}

/**
 * Validate the Android-only callback configuration inputs. Android requires the app package name,
 * the callback style, and the style-specific value (a signing fingerprint for App Links, or the
 * scheme string for a custom scheme). Reports every missing/invalid input in a single message —
 * with a hint on where to source each value and the conditional follow-ups — so the caller can
 * gather everything in one pass and supply it in one further call, rather than discovering the
 * requirements one error at a time. Rejects base_url, which has no meaning for a native app.
 * Returns null when the inputs are valid (or not Android).
 */
function validateAndroidInputs(params: {
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

  // base_url is a web-dev-server concept (localhost/port). Android callbacks derive from the
  // custom scheme or the Auth0 tenant domain, so a base_url can only misconfigure them — reject
  // it outright rather than silently ignoring a value the caller believes is taking effect.
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
  if (callbackUrlType === 'custom_scheme' && !auth0Scheme) {
    missing.push('auth0_scheme — the custom URL scheme the app claims (e.g. "demo")');
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

export const QUICKSTART_HANDLERS: Record<
  string,
  (request: HandlerRequest, config: HandlerConfig) => Promise<HandlerResponse>
> = {
  auth0_get_quickstart_guide: async (
    request: HandlerRequest,
    config: HandlerConfig
  ): Promise<HandlerResponse> => {
    const {
      client_id: clientId,
      framework,
      project_path: projectPath,
      base_url: baseUrl,
      app_package_name: applicationId,
      callback_url_type: callbackUrlType,
      android_sha256_fingerprint: androidSha256Fingerprint,
      auth0_scheme: auth0Scheme,
    } = request.parameters;

    if (!clientId) {
      return createErrorResponse('Error: client_id is required');
    }
    if (!framework) {
      return createErrorResponse('Error: framework is required');
    }
    if (!isFrameworkSupported(framework)) {
      return createErrorResponse(
        `Error: Unsupported framework "${framework}". Must be one of: ${SUPPORTED_FRAMEWORKS.join(', ')}`
      );
    }

    // Android requires callback configuration; these inputs are ignored for other frameworks.
    const isAndroid = framework.toLowerCase() === 'android';
    const androidError = validateAndroidInputs({
      isAndroid,
      applicationId,
      callbackUrlType,
      androidSha256Fingerprint,
      auth0Scheme,
      baseUrl,
    });
    if (androidError) {
      return androidError;
    }

    if (!projectPath) {
      return createErrorResponse('Error: project_path is required');
    }
    if (!path.isAbsolute(projectPath)) {
      return createErrorResponse('Error: project_path must be an absolute path');
    }
    const resolvedProjectPath = path.resolve(projectPath);
    if (!fs.statSync(resolvedProjectPath, { throwIfNoEntry: false })?.isDirectory()) {
      return createErrorResponse('Error: project_path must be an existing directory');
    }

    if (!request.token) {
      log('Warning: Token is empty or undefined');
      return createErrorResponse('Error: Missing authorization token');
    }
    if (!config.domain) {
      log('Error: Auth0 domain is not configured');
      return createErrorResponse('Error: Auth0 domain is not configured');
    }

    // Step 1: Resolve quickstart spec
    const spec = await fetchQuickstartSpec(framework);
    if (!spec) {
      return createErrorResponse(
        `Error: Quickstart definition unavailable for framework "${framework}". ` +
          'The framework may not be supported or the CDN may be temporarily unavailable.'
      );
    }

    if (!spec.llmPromptUrl) {
      return createErrorResponse(
        `Error: Quickstart definition for "${framework}" does not include an LLM prompt URL.`
      );
    }

    // Step 2: Validate application exists
    const getResponse = await APPLICATION_HANDLERS['auth0_get_application'](
      { token: request.token, parameters: { client_id: clientId } },
      config
    );
    if (getResponse.isError) {
      return getResponse;
    }

    let appData: Record<string, any>;
    try {
      appData = JSON.parse(getResponse.content[0]?.text ?? '');
    } catch {
      return createErrorResponse('Error: Failed to parse application data');
    }

    // Step 3: Check .env file exists (only when spec has envSnippet).
    // Credentials may have been saved to any pre-existing env file (e.g. .env.development),
    // so detect an existing file before falling back to the spec's preferred filename.
    let envFilePath: string | null = null;
    if (spec.envSnippet) {
      const snippetFileName = spec.envSnippet.fileName;
      if (snippetFileName !== path.basename(snippetFileName)) {
        return createErrorResponse(
          `Error: Quickstart spec for "${framework}" has an invalid env file name "${snippetFileName}". ` +
            'The file name must not contain a path.'
        );
      }
      envFilePath =
        detectExistingEnvFile(resolvedProjectPath) ??
        (fs.existsSync(path.join(resolvedProjectPath, snippetFileName))
          ? path.join(resolvedProjectPath, snippetFileName)
          : null);
      if (!envFilePath) {
        return createErrorResponse(
          `Error: No environment file found in "${resolvedProjectPath}". ` +
            `Expected one of: .env.local, .env, .env.development.local, .env.development, or ${snippetFileName}. ` +
            'Please call auth0_save_credentials_to_file first to set up your environment file.'
        );
      }
    }

    // Step 4: Resolve callback URLs.
    // Assemble the base-URL-independent input values first (Auth0 domain, client id, and
    // spec.inputs defaults such as applicationId). These are needed to resolve an object-form
    // defaultAppOrigin.domain and any %PLACEHOLDER% tokens in the callback/logout paths.
    const baseInputValues: Record<string, string> = {
      auth0Domain: config.domain,
      auth0ClientId: clientId,
    };
    for (const [key, def] of Object.entries(spec.inputs)) {
      if (
        baseInputValues[key] === undefined &&
        def &&
        typeof def === 'object' &&
        'default' in def
      ) {
        baseInputValues[key] = String((def as Record<string, unknown>).default);
      }
    }

    // Caller-supplied Android values override the spec's inputs defaults. applicationId and
    // auth0Scheme drive both callback-path placeholder resolution (%APPLICATION_ID%) and the
    // LLM prompt (%AUTH0_SCHEME%).
    if (isAndroid) {
      baseInputValues.applicationId = applicationId;
      if (callbackUrlType === 'custom_scheme') {
        baseInputValues.auth0Scheme = auth0Scheme;
      }
    }

    // For a custom-scheme Android callback, the registered callback URL must use the custom scheme
    // rather than the spec's fixed https origin scheme.
    const schemeOverride =
      isAndroid && callbackUrlType === 'custom_scheme' ? auth0Scheme : undefined;

    const resolvedUrls = resolveCallbackUrls(spec, baseUrl, baseInputValues, schemeOverride);

    // Step 5: Fetch LLM prompt
    let promptText: string;
    try {
      const promptResponse = await fetchWithOptions(spec.llmPromptUrl, { retries: 1 });
      if (!promptResponse.ok) {
        log(`Failed to fetch LLM prompt from ${spec.llmPromptUrl}: ${promptResponse.status}`);
        return createErrorResponse(
          `Error: Quickstart guide unavailable for "${framework}". ` +
            `Failed to fetch LLM prompt from CDN (status: ${promptResponse.status}).`
        );
      }
      promptText = await promptResponse.text();
    } catch (error) {
      log(`Error fetching LLM prompt: ${error}`);
      return createErrorResponse(
        `Error: Quickstart guide unavailable for "${framework}". ` +
          'Failed to fetch LLM prompt from CDN due to a network error.'
      );
    }

    // Step 6: Inject runtime values
    let baseUrlParsed: URL;
    try {
      baseUrlParsed = new URL(resolvedUrls.base_url);
    } catch {
      return createErrorResponse(`Error: Invalid resolved base URL: ${resolvedUrls.base_url}`);
    }

    const specDefaultPort = spec.defaultAppOrigin?.port;
    const port =
      baseUrlParsed.port ||
      (specDefaultPort !== undefined ? String(specDefaultPort) : null) ||
      (baseUrlParsed.protocol === 'https:' ? '443' : '80');

    // Merge the base input values (incl. spec.inputs defaults) with the base-URL-derived
    // values. Derived values are spread last so they take precedence over spec defaults.
    const inputValues: Record<string, string> = {
      ...baseInputValues,
      port,
      appDomain: baseUrlParsed.hostname,
      appScheme: baseUrlParsed.protocol.replace(':', ''),
      auth0ClientSecret: '*******MASKED*********',
      sessionCookieSecret: '*******MASKED*********',
    };

    const resolvedPrompt = resolvePlaceholders(
      promptText,
      spec.placeholders,
      inputValues,
      spec.environment
    );

    // Step 7: Update application after all failure-prone non-mutating work succeeds
    const { updatePayload, finalUrls } = calculateUrlUpdates(resolvedUrls, appData);

    // For an Android App Link (universal_links) callback, Auth0 needs the app package name and
    // signing-cert fingerprint to serve the assetlinks association. Register them via
    // mobile.android unless they are already present on the application. A custom-scheme callback
    // needs no fingerprint (there is no domain verification).
    let mobilePayload: Record<string, any> | null = null;
    if (isAndroid && callbackUrlType === 'universal_links') {
      const existingFingerprints: string[] =
        appData.mobile?.android?.sha256_cert_fingerprints ?? [];
      const existingPackage: string | undefined = appData.mobile?.android?.app_package_name;
      // Append-only: existing fingerprints are always retained (never dropped, even on a package
      // rename); a genuinely new one is appended. Compare by normalized identity, not exact string,
      // so the same cert from `keytool` (colons, uppercase) vs `./gradlew signingReport` (lowercase)
      // does not register twice.
      const normalizedNew = normalizeFingerprint(androidSha256Fingerprint);
      const alreadyRegistered = existingFingerprints.some(
        (fp) => normalizeFingerprint(fp) === normalizedNew
      );
      if (existingPackage !== applicationId || !alreadyRegistered) {
        // PATCH replaces the nested `mobile` object wholesale, so spread the existing one to
        // preserve sibling config (e.g. mobile.ios).
        mobilePayload = {
          ...(appData.mobile ?? {}),
          android: {
            app_package_name: applicationId,
            sha256_cert_fingerprints: alreadyRegistered
              ? existingFingerprints
              : [...existingFingerprints, androidSha256Fingerprint],
          },
        };
      }
    }

    if (updatePayload || mobilePayload) {
      const updateResponse = await APPLICATION_HANDLERS['auth0_update_application'](
        {
          token: request.token,
          parameters: {
            client_id: clientId,
            ...(updatePayload ?? {}),
            ...(mobilePayload ? { mobile: mobilePayload } : {}),
          },
        },
        config
      );
      if (updateResponse.isError) {
        trackEvent.trackOnboardingStep(
          OnboardingStep.QuickstartGuide,
          framework,
          OnboardingStepStatus.Failure,
          {
            failure_stage: 'update_callback_urls',
          }
        );
        const errorDetail = updateResponse.content?.[0]?.text || 'Unknown error';
        return createErrorResponse(
          `Error: Failed to update application callback URLs. ${errorDetail}`
        );
      }
    }

    // Step 8: Return response
    const configuredUrls: Record<string, any> = {
      callbacks: finalUrls.callbacks,
      allowed_logout_urls: finalUrls.allowed_logout_urls,
    };
    if (finalUrls.web_origins) {
      configuredUrls.web_origins = finalUrls.web_origins;
    }
    if (finalUrls.skip_non_verifiable_callback_uri_confirmation_prompt) {
      configuredUrls.skip_non_verifiable_callback_uri_confirmation_prompt = true;
    }
    if (mobilePayload) {
      configuredUrls.mobile = mobilePayload;
    }

    const actionsTaken: string[] = [];
    if (updatePayload !== null) {
      if (finalUrls.callbacks?.length) {
        actionsTaken.push(`Set callback URL(s): ${finalUrls.callbacks.join(', ')}`);
      }
      if (finalUrls.allowed_logout_urls?.length) {
        actionsTaken.push(`Set logout URL(s): ${finalUrls.allowed_logout_urls.join(', ')}`);
      }
      if (finalUrls.web_origins?.length) {
        actionsTaken.push(`Set allowed web origin(s): ${finalUrls.web_origins.join(', ')}`);
      }
      if (finalUrls.skip_non_verifiable_callback_uri_confirmation_prompt) {
        actionsTaken.push(
          'Enabled skip_non_verifiable_callback_uri_confirmation_prompt because a non-verifiable (custom scheme or localhost) callback URL was configured'
        );
      }
    }
    if (mobilePayload) {
      actionsTaken.push(
        `Registered Android app package "${mobilePayload.android.app_package_name}" and signing-cert ` +
          `fingerprint(s) on the application (mobile.android) so the App Link callback resolves back to the app`
      );
    }
    actionsTaken.push(`Fetched quickstart guide for ${framework}`);

    const credentialsNote = envFilePath
      ? `An existing environment file was detected at "${envFilePath}"; use it as-is and skip ` +
        `any environment-variable or .env setup steps in the quickstart_prompt; do not create or copy a new .env file.`
      : '';

    const urlsUpdated = updatePayload !== null;
    const mobileUpdated = mobilePayload !== null;

    trackEvent.trackOnboardingStep(
      OnboardingStep.QuickstartGuide,
      framework,
      OnboardingStepStatus.Success,
      {
        urls_updated: urlsUpdated,
        mobile_updated: mobileUpdated,
      }
    );

    return createSuccessResponse({
      success: true,
      client_id: clientId,
      framework,
      project_path: resolvedProjectPath,
      app_type: spec.appType,
      quickstart_prompt: resolvedPrompt,
      configured_urls: configuredUrls,
      urls_updated: urlsUpdated,
      mobile_updated: mobileUpdated,
      url_source: resolvedUrls.url_source,
      actions_taken: actionsTaken,
      credentials_file: envFilePath,
      instructions:
        `First, summarize actions_taken to the user so they know what was configured on their Auth0 application. ` +
        `Then implement the code from quickstart_prompt in the user's project at project_path. ` +
        `If you have file-write capabilities, create and modify files directly. ` +
        `If you do not have file-write capabilities, present each code block to the user ` +
        `with the file path where it should be created or modified.${credentialsNote} ` +
        `Once the integration code is in place, the onboarding is complete — let the user know.`,
    });
  },
};
