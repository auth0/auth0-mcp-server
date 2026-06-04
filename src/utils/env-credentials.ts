import * as fs from 'fs';
import * as path from 'path';
import { randomBytes } from 'crypto';
import { log } from './logger.js';
import { fetchQuickstartSpec } from './quickstarts.js';
import type { QuickstartSpec, DefaultAppOrigin } from './quickstarts.js';
import { isFrameworkSupported } from './onboarding.js';
import { getManagementClient } from './auth0-client.js';
import { writeCredentialsToEnv, parseEnvFile, detectExistingEnvFile } from './credentials-writer.js';
import type { HandlerConfig } from './types.js';
import trackEvent from './analytics.js';
import type { CredentialResolutionFallbackReason } from './analytics.js';

type EnvSnippet = NonNullable<QuickstartSpec['envSnippet']>;

export interface EnvCredentialsParams {
  client_id: string;
  framework: string;
  project_path: string;
  base_url?: string;
  callback_url?: string;
  port?: number;
}

export type EnvCredentialsResult =
  | {
      success: true;
      client_id: string;
      credentials_saved_to?: string;
      keys_written: string[];
      generated_keys: string[];
      file_created: boolean;
      message: string;
    }
  | { success: false; error: string };

type ResolvedCredentials =
  | {
      success: true;
      credentialMap: Record<string, string>;
      envFilePath: string;
      generated_keys: string[];
    }
  | { success: false; error: string };

/**
 * Resolves Auth0 credentials for the given framework and writes them to the project's env file.
 *
 * Uses the CDN quickstart spec when available (spec-driven path). Falls back to hardcoded
 * Auth0 variables when the framework is unsupported or the CDN fetch fails — no error is
 * returned to the LLM in the fallback case.
 *
 * @param params - Credential resolution parameters (client_id, framework, project_path, etc.)
 * @param config - Handler config containing the Auth0 domain
 * @param token - Auth0 Management API access token
 * @returns Result indicating success (with file metadata) or failure (with error message)
 */
export async function resolveAndWriteCredentials(
  params: EnvCredentialsParams,
  config: HandlerConfig,
  token: string
): Promise<EnvCredentialsResult> {
  const { client_id: clientId, framework, project_path: projectPath } = params;

  if (!fs.existsSync(projectPath) || !fs.statSync(projectPath).isDirectory()) {
    return {
      success: false,
      error: `project_path "${projectPath}" does not exist or is not a directory`,
    };
  }

  const spec = await fetchQuickstartSpec(framework);

  if (spec !== null && !spec.envSnippet) {
    return {
      success: true,
      client_id: params.client_id,
      keys_written: [],
      generated_keys: [],
      file_created: false,
      message: 'No .env file needed for this framework.',
    };
  }

  const resolutionPath: 'spec' | 'fallback' = spec?.envSnippet ? 'spec' : 'fallback';
  // spec is null whenever we reach the fallback path (the no-envSnippet case returns early above),
  // so a supported framework here means its spec couldn't be fetched rather than being unsupported.
  const fallbackReason: CredentialResolutionFallbackReason | undefined =
    resolutionPath === 'fallback'
      ? isFrameworkSupported(framework)
        ? 'cdn_unavailable'
        : 'unsupported'
      : undefined;
  const resolved = spec?.envSnippet
    ? await buildSpecCredentials(params, spec.envSnippet, spec.defaultAppOrigin, config, token, spec.placeholders)
    : await buildFallbackCredentials(params, config, token);

  if (!resolved.success) return resolved;

  const credentialsInfo = await writeCredentialsToEnv(resolved.credentialMap, {
    filePath: resolved.envFilePath,
    allowedDir: projectPath,
  });
  log(`Credentials saved to: ${credentialsInfo.file_path}`);

  const generatedKeys = resolved.generated_keys;

  trackEvent.trackCredentialResolution(
    framework,
    resolutionPath,
    generatedKeys.includes('AUTH0_SECRET'),
    credentialsInfo.keys_written,
    fallbackReason
  );

  return {
    success: true,
    client_id: clientId,
    credentials_saved_to: credentialsInfo.file_path,
    keys_written: credentialsInfo.keys_written,
    generated_keys: generatedKeys,
    file_created: credentialsInfo.file_created,
    message:
      generatedKeys.length > 0
        ? `Credentials saved securely to ${credentialsInfo.file_path}. ${generatedKeys.join(', ')} was generated automatically and saved to the file. You can rotate it at any time by replacing the value with a new 32-byte hex string.`
        : `Credentials saved securely to ${credentialsInfo.file_path}`,
  };
}

/**
 * Builds a credential map from the CDN quickstart spec's envSnippet.
 *
 * Resolves each entry's value template by substituting placeholders (e.g. %AUTH0_DOMAIN%)
 * with actual values derived from the spec's placeholder→inputKey mapping.
 *
 * SPA frameworks (empty secretKeys) skip the Management API call entirely.
 * AUTH0_SECRET is generated only when required and not already present in the existing env file.
 */
async function buildSpecCredentials(
  params: EnvCredentialsParams,
  envSnippet: EnvSnippet,
  defaultAppOrigin: DefaultAppOrigin,
  config: HandlerConfig,
  token: string,
  placeholders: Record<string, unknown>
): Promise<ResolvedCredentials> {
  const {
    client_id: clientId,
    project_path: projectPath,
    base_url: baseUrl,
    callback_url: callbackUrl,
    port,
  } = params;
  const envFilePath = detectExistingEnvFile(projectPath) ?? path.join(projectPath, envSnippet.fileName);

  const varEntries = envSnippet.entries.filter((e) => e.type === 'var') as {
    type: 'var'; name: string; value: string; comment?: string; sensitive?: boolean;
  }[];
  const secretKeys = varEntries.filter((e) => e.sensitive).map((e) => e.name);

  let clientSecret: string | undefined;
  if (secretKeys.length > 0) {
    try {
      const managementClient = await getManagementClient({ domain: config.domain!, token });
      const { data: application } = await managementClient.clients.get({ client_id: clientId });
      clientSecret = application.client_secret;
    } catch (sdkError: any) {
      let error = `Failed to retrieve application: ${sdkError.message || 'Unknown error'}`;
      if (sdkError.statusCode === 404) {
        error = `Application with client_id '${clientId}' not found.`;
      } else if (sdkError.statusCode === 401) {
        error += '\nYour token may be expired or missing read:clients scope. Try running "npx @auth0/auth0-mcp-server init" to refresh your token.';
      }
      return { success: false, error };
    }
  }

  let parsedBaseUrl: URL | undefined;
  if (baseUrl) {
    try {
      parsedBaseUrl = new URL(baseUrl);
    } catch {
      return {
        success: false,
        error: `Invalid base_url "${baseUrl}". Expected a full URL including scheme, e.g. "http://localhost:3000".`,
      };
    }
  }

  const resolvedPort = port
    ? String(port)
    : parsedBaseUrl
      ? parsedBaseUrl.port || String(defaultAppOrigin.port ?? 3000)
      : String(defaultAppOrigin.port ?? 3000);

  const inputValues: Record<string, string | undefined> = {
    auth0Domain: config.domain,
    auth0ClientId: clientId,
    auth0ClientSecret: clientSecret,
    port: resolvedPort,
    appDomain: parsedBaseUrl ? parsedBaseUrl.hostname : (defaultAppOrigin.domain ?? 'localhost'),
    appScheme: parsedBaseUrl ? parsedBaseUrl.protocol.replace(':', '') : (defaultAppOrigin.scheme ?? 'http'),
  };

  if (callbackUrl) {
    inputValues.callbackUrl = callbackUrl;
  }

  const placeholderMap = buildPlaceholderMap(placeholders, inputValues);

  const existingEnv = parseEnvFile(envFilePath);
  const credentialMap: Record<string, string> = {};
  const generated_keys: string[] = [];

  for (const entry of varEntries) {
    if (entry.name === 'AUTH0_SECRET') {
      if (!existingEnv['AUTH0_SECRET']) {
        credentialMap[entry.name] = randomBytes(32).toString('hex');
        generated_keys.push(entry.name);
      }
      continue;
    }

    const resolved = resolvePlaceholders(entry.value, placeholderMap);
    if (resolved && !resolved.includes('%')) {
      credentialMap[entry.name] = resolved;
    }
  }

  return { success: true, credentialMap, envFilePath, generated_keys };
}

/**
 * Builds a map from placeholder token (e.g. "%AUTH0_DOMAIN%") to resolved value
 * using the spec's placeholders definition and the resolved input values.
 */
function buildPlaceholderMap(
  placeholders: Record<string, unknown>,
  inputValues: Record<string, string | undefined>
): Record<string, string> {
  const map: Record<string, string> = {};

  for (const [token, definition] of Object.entries(placeholders)) {
    if (typeof definition === 'object' && definition !== null && 'inputKey' in definition) {
      const inputKey = (definition as { inputKey: string }).inputKey;
      const value = inputValues[inputKey];
      if (value) map[token] = value;
    }
  }

  return map;
}

/**
 * Resolves all %PLACEHOLDER% tokens in a template string using the placeholder map.
 */
function resolvePlaceholders(template: string, placeholderMap: Record<string, string>): string {
  return template.replace(/%[A-Z0-9_]+%/g, (token) => placeholderMap[token] ?? token);
}

/**
 * Builds a hardcoded credential map for unsupported frameworks or when the CDN is unavailable.
 * Matches the tool's original behavior: AUTH0_DOMAIN, AUTH0_CLIENT_ID, AUTH0_CLIENT_SECRET, AUTH0_CALLBACK_URL.
 */
async function buildFallbackCredentials(
  params: EnvCredentialsParams,
  config: HandlerConfig,
  token: string
): Promise<ResolvedCredentials> {
  const { client_id: clientId, project_path: projectPath, callback_url: callbackUrl } = params;
  const envFilePath = detectExistingEnvFile(projectPath) ?? path.join(projectPath, '.env.local');

  log(
    `Spec unavailable for framework "${params.framework}", falling back to hardcoded credentials`
  );

  try {
    const managementClient = await getManagementClient({ domain: config.domain!, token });
    const { data: application } = await managementClient.clients.get({ client_id: clientId });
    const appData = application as any;

    if (!appData.client_secret) {
      return {
        success: false,
        error: `Application ${clientId} does not have a client_secret (may be a public client type)`,
      };
    }

    const resolvedCallbackUrl = callbackUrl || appData.callbacks?.[0];
    const credentialMap: Record<string, string> = {
      AUTH0_DOMAIN: config.domain!,
      AUTH0_CLIENT_ID: clientId,
      AUTH0_CLIENT_SECRET: appData.client_secret,
      ...(resolvedCallbackUrl ? { AUTH0_CALLBACK_URL: resolvedCallbackUrl } : {}),
    };

    return { success: true, credentialMap, envFilePath, generated_keys: [] };
  } catch (sdkError: any) {
    let error = `Failed to retrieve application: ${sdkError.message || 'Unknown error'}`;
    if (sdkError.statusCode === 404) {
      error = `Application with client_id '${clientId}' not found.`;
    } else if (sdkError.statusCode === 401) {
      error += '\nYour token may be expired or missing read:clients scope. Try running "npx @auth0/auth0-mcp-server init" to refresh your token.';
    }
    return { success: false, error };
  }
}
