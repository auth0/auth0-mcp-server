import { ManagementClient } from 'auth0';
import { Auth0Config } from './config.js';
import { packageVersion } from './package.js';

/**
 * Generates a standardized User-Agent string for API requests.
 *
 * This function constructs a User-Agent header value that identifies the application
 * making requests to Auth0 APIs. The format follows standard conventions:
 * "application-name/version (runtime/runtime-version)"
 *
 * @returns {string} Formatted User-Agent string containing the application name,
 *                   version, and Node.js runtime version
 * @example
 * // Example usage in headers for an API request
 * const headers = {
 *   'Content-Type': 'application/json',
 *   'User-Agent': getUserAgent()
 * };
 * // Could produce: "auth0-mcp-server/1.2.3 (node.js/16.14.0)"
 */
function getUserAgent(): string {
  return `auth0-mcp-server/${packageVersion} (node.js/${process.version.replace('v', '')})`;
}

/**
 * Creates and configures an Auth0 Management API client for making API calls.
 *
 * This function initializes a ManagementClient with proper authentication,
 * retry logic (10 retries), and user agent information. The client provides
 * methods for interacting with all Management API endpoints to manage resources
 * in your Auth0 tenant.
 *
 * @param {Auth0Config} config - Configuration object containing:
 *   - domain: The Auth0 domain name (e.g., 'your-tenant.auth0.com')
 *   - token: A valid Auth0 Management API access token with appropriate scopes
 * @returns {Promise<ManagementClient>} A configured Auth0 Management API client
 *   ready to make authenticated requests to the Auth0 Management API.
 */
export const getManagementClient = async (config: Auth0Config): Promise<ManagementClient> => {
  return new ManagementClient({
    domain: config.domain,
    token: config.token,
    retry: { maxRetries: 10, enabled: true },
    headers: {
      'User-agent': getUserAgent(),
    },
  });
};
