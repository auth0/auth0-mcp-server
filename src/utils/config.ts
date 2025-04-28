import * as os from 'os';
import { keychain } from './keychain.js';
import {
  isTokenExpired,
  refreshAccessToken,
  getValidAccessToken,
} from '../auth/device-auth-flow.js';
import { log } from './logger.js';

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
  const token = await getValidAccessToken();
  const domain = await keychain.getDomain();

  return {
    token: token || '',
    domain: domain || '',
    tenantName: domain || 'default',
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

  if (await isTokenExpired()) {
    log('Auth0 token is expired');
    return false;
  }

  return true;
}
