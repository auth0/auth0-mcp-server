import * as os from 'os';
import { jwtDecode } from 'jwt-decode';
import { keychain } from './keychain.js';
import {
  isTokenExpired,
  refreshAccessToken,
  getValidAccessToken,
} from '../auth/device-auth-flow.js';
import { log } from './logger.js';
import { getTenantFromToken } from './terminal.js';

// Ensure HOME is set
if (!process.env.HOME) {
  process.env.HOME = os.homedir();
  log(`HOME environment variable was not set, updating Home directory`);
}

// Determine if we're in debug mode
const isDebugMode =
  process.env.AUTH0_MCP_DEBUG === 'true' || process.env.DEBUG?.includes('auth0-mcp');
log(`Debug mode: ${isDebugMode}`);

/**
 * Auth0 configuration interface representing essential tenant
 * connection information needed for API operations.
 */
export interface Auth0Config {
  /**
   * Authentication token for Auth0 Management API access.
   * Must be valid and non-expired for API operations to succeed.
   * Used in the Authorization header for all API requests.
   */
  token: string;

  /**
   * Auth0 tenant domain (e.g., "your-tenant.auth0.com").
   * Used to construct API endpoints and identify the tenant.
   * Essential for routing requests to the correct Auth0 instance.
   */
  domain: string;

  /**
   * Human-readable name for the Auth0 tenant.
   * Used primarily for display purposes in logs and user interfaces.
   * Defaults to domain if not explicitly provided.
   */
  tenantName?: string;

  /**
   * Where the configuration was loaded from.
   * Environment-backed configuration is useful for bundle-based installs where
   * hosts can securely prompt for values and inject them at launch time.
   */
  source?: 'keychain' | 'env';
}

interface JwtPayload {
  exp?: number;
}

/**
 * Attempts to load Auth0 credentials from environment variables.
 * This enables MCP bundle hosts to provide credentials directly through
 * user_config-backed environment injection without requiring a prior init flow.
 */
function loadConfigFromEnvironment(): Auth0Config | null {
  const token = process.env.AUTH0_TOKEN?.trim();

  if (!token) {
    return null;
  }

  const explicitDomain = process.env.AUTH0_DOMAIN?.trim();
  const inferredDomain = explicitDomain || inferDomainFromToken(token) || '';

  return {
    token,
    domain: inferredDomain,
    tenantName: inferredDomain || 'default',
    source: 'env',
  };
}

function inferDomainFromToken(token: string): string | undefined {
  try {
    return getTenantFromToken(token);
  } catch (error) {
    log(
      `Unable to infer AUTH0_DOMAIN from AUTH0_TOKEN: ${error instanceof Error ? error.message : String(error)}`
    );
    return undefined;
  }
}

function isJwtTokenExpired(token: string, bufferSeconds = 300): boolean {
  try {
    const payload = jwtDecode<JwtPayload>(token);

    if (!payload.exp) {
      return false;
    }

    return Date.now() + bufferSeconds * 1000 >= payload.exp * 1000;
  } catch (error) {
    log(
      `Unable to decode AUTH0_TOKEN for expiration check, assuming non-JWT token: ${error instanceof Error ? error.message : String(error)}`
    );
    return false;
  }
}

/**
 * Loads and prepares Auth0 configuration for API interactions.
 *
 * This function retrieves stored credentials from the system keychain
 * to establish a secure connection with Auth0 tenant. It handles
 * the authentication flow behind the scenes, ensuring a valid
 * access token is available for API operations.
 *
 * @returns {Promise<Auth0Config | null>} Configuration object with token and domain
 *          or null if retrieval fails
 */
export async function loadConfig(): Promise<Auth0Config | null> {
  const envConfig = loadConfigFromEnvironment();

  if (envConfig) {
    log('Loaded Auth0 configuration from environment variables');
    return envConfig;
  }

  const token = await getValidAccessToken();
  const domain = await keychain.getDomain();

  return {
    token: token || '',
    domain: domain || '',
    tenantName: domain || 'default',
    source: 'keychain',
  };
}

/**
 * Validates Auth0 configuration to ensure it can be used for API operations.
 *
 * This comprehensive validation ensures that:
 * 1. The configuration object exists
 * 2. The required token is present
 * 3. The required domain is specified
 * 4. The token has not expired
 *
 * Security validation is critical since invalid or expired credentials could
 * lead to API failures or security vulnerabilities. This function prevents
 * operations from proceeding with invalid authentication states.
 *
 * Note: This validation complements the user-oriented validation in `run.ts`.
 * While `run.ts` provides detailed CLI error messages during startup,
 * this function serves as an ongoing validation layer during server operation,
 * particularly when handling tool requests. Both mechanisms work together
 * to create a secure yet user-friendly experience.
 *
 * @param {Auth0Config | null} config - The configuration to validate
 * @returns {Promise<boolean>} True if config is valid and usable, false otherwise
 */
export async function validateConfig(config: Auth0Config | null): Promise<boolean> {
  if (!config) {
    log('Configuration is null');
    return false;
  }

  if (!config.token) {
    log('Auth0 token is missing');
    return false;
  }

  if (!config.domain) {
    log('Auth0 domain is missing');
    return false;
  }

  if (config.source === 'env') {
    if (isJwtTokenExpired(config.token)) {
      log('AUTH0_TOKEN is expired or will expire soon');
      return false;
    }

    return true;
  }

  if (await isTokenExpired()) {
    log('Auth0 token is expired');
    return false;
  }

  return true;
}
