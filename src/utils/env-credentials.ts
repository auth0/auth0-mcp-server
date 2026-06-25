import * as fs from 'fs';
import * as path from 'path';
import { randomBytes } from 'crypto';
import { log } from './logger.js';
import { fetchQuickstartSpec } from './quickstarts.js';
import type { QuickstartSpec, DefaultAppOrigin } from './quickstarts.js';
import { isFrameworkSupported, hasProjectMarker } from './onboarding.js';
import { getManagementClient } from './auth0-client.js';
import { writeCredentialsToEnv, parseEnvFile, detectExistingEnvFile, ensureGitignore } from './credentials-writer.js';
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
  dry_run?: boolean;
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
const WEB_SERVED_SEGMENT_NAMES = new Set([
  'public', 'dist', 'build', 'static', 'www', 'wwwroot', 'html', 'assets', 'out',
]);

// Detects whether a directory is likely web-served based on its final path segment.
// Absolute web server roots (/srv, /var/www, etc.) are hard-blocked by hasProjectMarker.
function isLikelyWebServedDirectory(resolvedDir: string): boolean {
  return WEB_SERVED_SEGMENT_NAMES.has(path.basename(resolvedDir).toLowerCase());
}

function validateProjectPath(projectPath: string): string | null {
  const resolved = path.resolve(projectPath);
  if (resolved !== projectPath && projectPath.includes('..')) {
    return 'project_path must not contain path traversal sequences';
  }

  if (!fs.existsSync(resolved) || !fs.statSync(resolved).isDirectory()) {
    return 'project_path does not exist or is not a directory';
  }
  if (!hasProjectMarker(resolved)) {
    return 'project_path must not be a system or home directory';
  }

  return null;
}

export async function resolveAndWriteCredentials(
  params: EnvCredentialsParams,
  config: HandlerConfig,
  token: string
): Promise<EnvCredentialsResult> {
  const { client_id: clientId, framework, project_path: projectPath } = params;

  // Validation: ensure projectPath is a valid directory with no path traversal
  const projectPathError = validateProjectPath(projectPath);
  if (projectPathError) return { success: false, error: projectPathError };
  const resolvedProjectPath = path.resolve(projectPath);

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

  // For supported frameworks, a null spec means CDN failed with no cache — surface the error
  if (spec === null && isFrameworkSupported(framework)) {
    return {
      success: false,
      error:
        `Could not fetch quickstart spec for "${framework}". ` +
        'Please check your network connection and try again.',
    };
  }

  const resolutionPath: 'spec' | 'fallback' = spec?.envSnippet ? 'spec' : 'fallback';
  
  // After the guard above, the only remaining fallback case is an unsupported framework.
  const fallbackReason: CredentialResolutionFallbackReason | undefined =
    resolutionPath === 'fallback' ? 'unsupported' : undefined;
  const resolvedParams = { ...params, project_path: resolvedProjectPath };
  const resolved = spec?.envSnippet
    ? await buildSpecCredentials(resolvedParams, spec.envSnippet, spec.defaultAppOrigin, config, token, spec.placeholders)
    : await buildFallbackCredentials(resolvedParams, config, token);

  if (!resolved.success) return resolved;

  if (params.dry_run) {
    return {
      success: true,
      client_id: clientId,
      keys_written: Object.keys(resolved.credentialMap),
      generated_keys: resolved.generated_keys,
      file_created: false,
      message:
        `Dry run: would write ${Object.keys(resolved.credentialMap).length} key(s) to ${resolved.envFilePath}. ` +
        'Pass dry_run: false (or omit) to write.',
    };
  }

  const guardError = checkWriteGuard(resolvedProjectPath, Object.keys(resolved.credentialMap));
  if (guardError) return { success: false, error: guardError };

  let credentialsInfo;
  try {
    credentialsInfo = await writeCredentialsToEnv(resolved.credentialMap, {
      filePath: resolved.envFilePath,
      allowedDir: resolvedProjectPath,
    });
  } catch (err: any) {
    return { success: false, error: err.message ?? 'Failed to write credentials' };
  }
  log(`Credentials saved to: ${credentialsInfo.file_path}`);

  updateWriteGuard(resolvedProjectPath, credentialsInfo.keys_written, framework);
  appendAuditLog(resolvedProjectPath, framework, credentialsInfo);
  ensureGitignore(resolvedProjectPath, WRITE_GUARD_FILE);
  ensureGitignore(resolvedProjectPath, AUDIT_LOG_FILE);

  const generatedKeys = resolved.generated_keys;

  trackEvent.trackCredentialResolution(
    framework,
    resolutionPath,
    generatedKeys.includes('AUTH0_SECRET'),
    credentialsInfo.keys_written,
    fallbackReason
  );

  const auditLogPath = path.join(resolvedProjectPath, AUDIT_LOG_FILE);
  const securityNotice =
    `Verify that ${path.basename(credentialsInfo.file_path)} is listed in .gitignore ` +
    'before committing this project to version control.';

  const baseMessage =
    generatedKeys.length > 0
      ? `Credentials saved securely to ${credentialsInfo.file_path}. ${generatedKeys.join(', ')} was generated automatically and saved to the file. You can rotate it at any time by replacing the value with a new 32-byte hex string.`
      : `Credentials saved securely to ${credentialsInfo.file_path}`;

  const webServedWarning = isLikelyWebServedDirectory(resolvedProjectPath)
    ? ' Warning: project_path appears to be a web-served directory. Ensure your web server is configured to deny access to .env files to prevent credentials from being exposed over HTTP.'
    : '';

  return {
    success: true,
    client_id: clientId,
    credentials_saved_to: credentialsInfo.file_path,
    keys_written: credentialsInfo.keys_written,
    generated_keys: generatedKeys,
    file_created: credentialsInfo.file_created,
    message: `${baseMessage} A write audit log is available at ${auditLogPath}. ${securityNotice}${webServedWarning}`,
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
  const fileName = envSnippet.fileName;
  if (fileName !== path.basename(fileName) || fileName.includes('..')) {
    return { success: false, error: 'Quickstart spec contained an invalid env file name' };
  }
  const envFilePath = detectExistingEnvFile(projectPath) ?? path.join(projectPath, fileName);

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

// ── Write guard ──────────────────────────────────────────────────────────────
// Prevents accidental double-writes within a 30-second window by persisting the
// last-written keys and timestamp to .auth0-mcp-state.json in the project directory.
// Can be bypassed by deleting .auth0-mcp-state.json from the project directory.

const WRITE_GUARD_FILE = '.auth0-mcp-state.json';
// 30 seconds: long enough to catch rapid double-invocations in a multi-step AI
// flow, short enough not to block an intentional re-run after a failed attempt.
const WRITE_GUARD_WINDOW_MS = 30 * 1000;

interface WriteGuardState {
  lastWrittenAt: string;
  keysWritten: string[];
  framework: string;
}

const MAX_WRITE_GUARD_SIZE_BYTES = 4096;

function checkWriteGuard(projectPath: string, incomingKeys: string[]): string | null {
  const statePath = path.join(projectPath, WRITE_GUARD_FILE);
  if (!fs.existsSync(statePath)) return null;
  try {
    const guardStat = fs.statSync(statePath);
    if (!guardStat.isFile() || guardStat.size > MAX_WRITE_GUARD_SIZE_BYTES) return null;
    const state: WriteGuardState = JSON.parse(fs.readFileSync(statePath, 'utf-8'));
    const elapsed = Date.now() - new Date(state.lastWrittenAt).getTime();
    if (elapsed < WRITE_GUARD_WINDOW_MS) {
      const overlap = incomingKeys.filter((k) => state.keysWritten.includes(k));
      if (overlap.length > 0) {
        const secondsAgo = Math.round(elapsed / 1000);
        return (
          `Credentials were already written to this project ${secondsAgo} second(s) ago ` +
          `(keys: ${overlap.join(', ')}). To write again, delete ${WRITE_GUARD_FILE} from the project directory and retry, or wait ${Math.ceil((WRITE_GUARD_WINDOW_MS - elapsed) / 1000)} second(s) for the window to expire.`
        );
      }
    }
  } catch {
    // Corrupt state file — allow the write to proceed
  }
  return null;
}

function updateWriteGuard(projectPath: string, keysWritten: string[], framework: string): void {
  const statePath = path.join(projectPath, WRITE_GUARD_FILE);
  const state: WriteGuardState = { lastWrittenAt: new Date().toISOString(), keysWritten, framework };
  try {
    fs.writeFileSync(statePath, JSON.stringify(state, null, 2), 'utf-8');
  } catch (error) {
    log(`Warning: could not save write guard state to ${WRITE_GUARD_FILE}: ${error}`);
  }
}

// ── Audit log ────────────────────────────────────────────────────────────────
// Appends a timestamped entry to .auth0-mcp-writes.log on every successful write.
// Capped at MAX_AUDIT_LOG_LINES to prevent unbounded growth.

const AUDIT_LOG_FILE = '.auth0-mcp-writes.log';
// Cap log size
const MAX_AUDIT_LOG_LINES = 200;

function appendAuditLog(
  projectPath: string,
  framework: string,
  info: { file_path: string; keys_written: string[] }
): void {
  const logPath = path.join(projectPath, AUDIT_LOG_FILE);
  const entry =
    `${new Date().toISOString()} | WRITE | framework=${framework} | ` +
    `keys=${info.keys_written.join(',')} | file=${path.basename(info.file_path)}\n`;
  try {
    let lines: string[] = [];
    if (fs.existsSync(logPath)) {
      lines = fs.readFileSync(logPath, 'utf-8').split('\n').filter(Boolean);
    }
    if (lines.length >= MAX_AUDIT_LOG_LINES) {
      // Keep only the most recent entries so the file stays bounded
      lines = lines.slice(lines.length - (MAX_AUDIT_LOG_LINES - 1));
    }
    const content = (lines.length > 0 ? lines.join('\n') + '\n' : '') + entry;
    const tmpPath = logPath + '.tmp';
    try {
      fs.writeFileSync(tmpPath, content, 'utf-8');
      fs.renameSync(tmpPath, logPath);
    } catch (writeErr) {
      try { fs.unlinkSync(tmpPath); } catch { /* ignore */ }
      throw writeErr;
    }
  } catch (error) {
    log(`Warning: could not write to audit log ${AUDIT_LOG_FILE}: ${error}`);
  }
}
