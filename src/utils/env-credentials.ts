import * as fs from 'fs';
import * as path from 'path';
import { randomBytes } from 'crypto';
import { log } from './logger.js';
import { fetchQuickstartSpec } from './quickstarts.js';
import type { QuickstartSpec, DefaultAppOrigin } from './quickstarts.js';
import { getManagementClient } from './auth0-client.js';
import { writeCredentialsToEnv, parseEnvFile } from './credentials-writer.js';
import type { HandlerConfig } from './types.js';

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
      credentials_saved_to: string;
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
      credentials_saved_to: '',
      keys_written: [],
      generated_keys: [],
      file_created: false,
      message: 'No .env file needed for this framework.',
    };
  }

  const resolved = spec?.envSnippet
    ? await buildSpecCredentials(params, spec.envSnippet, spec.defaultAppOrigin, config, token)
    : await buildFallbackCredentials(params, config, token);

  if (!resolved.success) return resolved;

  const credentialsInfo = await writeCredentialsToEnv(resolved.credentialMap, {
    filePath: resolved.envFilePath,
  });
  log(`Credentials saved to: ${credentialsInfo.file_path}`);

  const generatedKeys = resolved.generated_keys;

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
 * SPA frameworks (empty secretKeys) skip the Management API call entirely.
 * AUTH0_SECRET is generated only when required and not already present in the existing env file.
 */
async function buildSpecCredentials(
  params: EnvCredentialsParams,
  envSnippet: EnvSnippet,
  defaultAppOrigin: DefaultAppOrigin,
  config: HandlerConfig,
  token: string
): Promise<ResolvedCredentials> {
  const {
    client_id: clientId,
    project_path: projectPath,
    base_url: baseUrl,
    callback_url: callbackUrl,
    port,
  } = params;
  const envFilePath = path.join(projectPath, envSnippet.fileName);

  const varEntries = envSnippet.entries.filter((e) => e.type === 'var') as {
    type: 'var'; name: string; value: string; comment?: string; sensitive?: boolean;
  }[];
  const requiredKeys = varEntries.map((e) => e.name);
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

  const existingEnv = parseEnvFile(envFilePath);
  const credentialMap: Record<string, string> = {};
  const generated_keys: string[] = [];

  // Resolve each required env key to its value based on pattern matching against the key name.
  // AUTH0_SECRET is handled separately as it must be generated server-side.
  for (const key of requiredKeys) {
    const upper = key.toUpperCase();

    if (key === 'AUTH0_SECRET') {
      if (!existingEnv['AUTH0_SECRET']) {
        // Always generated server-side — never accepted as a parameter to prevent secret exposure through the LLM
        credentialMap[key] = randomBytes(32).toString('hex');
        generated_keys.push(key);
      }
      continue;
    }

    const resolvedPort = port
      ? String(port)
      : baseUrl
        ? new URL(baseUrl).port || String(defaultAppOrigin.port ?? 3000)
        : String(defaultAppOrigin.port ?? 3000);

    const keyPatterns: [string, string | undefined][] = [
      ['ISSUER', `https://${config.domain}`],
      ['DOMAIN', config.domain!],
      ['CLIENT_SECRET', secretKeys.includes(key) ? clientSecret : undefined],
      ['CLIENT_ID', clientId],
      ['BASE_URL', baseUrl || `http://localhost:${resolvedPort}`],
      ['CALLBACK', callbackUrl],
      ['PORT', resolvedPort],
    ];

    const match = keyPatterns.find(([pattern]) => upper.includes(pattern));
    if (match) {
      const [, value] = match;
      if (value) credentialMap[key] = value;
    }
  }

  return { success: true, credentialMap, envFilePath, generated_keys };
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
  const envFilePath = path.join(projectPath, '.env.local');

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
