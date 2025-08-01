import chalk from 'chalk';
import { cliOutput, getTenantFromToken } from '../utils/terminal.js';
import { log, logError } from '../utils/logger.js';
import { keychain } from '../utils/keychain.js';

/**
 * Interface for client credentials configuration
 */
export interface ClientCredentialsConfig {
  auth0Domain: string;
  auth0ClientId: string;
  auth0ClientSecret: string;
  audience?: string;
  scopes?: string[];
}

/**
 * Request authorization using client credentials flow
 *
 * This method is primarily designed for Private Cloud users who cannot use the
 * device authorization flow. It uses client credentials flow to obtain an access token.
 *
 * @param {ClientCredentialsConfig} config - Configuration for client credentials flow
 * @returns {Promise<void>}
 */
export async function requestClientCredentialsAuthorization(
  config: ClientCredentialsConfig
): Promise<void> {
  log('Initiating client credentials flow authentication...');

  try {
    const body: Record<string, string> = {
      client_id: config.auth0ClientId,
      client_secret: config.auth0ClientSecret,
      grant_type: 'client_credentials',
    };

    // Set audience if provided, otherwise use a default based on the domain
    const audience = config.audience || `https://${config.auth0Domain}/api/v2/`;
    body.audience = audience;

    // Make the token request
    const response = await fetch(`https://${config.auth0Domain}/oauth/token`, {
      method: 'POST',
      body: new URLSearchParams(body),
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/x-www-form-urlencoded',
      },
    });

    const tokenSet = await response.json();

    if (tokenSet.error) {
      logError('Authentication error:', tokenSet.error_description || tokenSet.error);
      cliOutput(`\n${chalk.red('✗')} Client credentials authentication failed.\n`);
      process.exit(1);
    }

    // Store the token information
    await storeTokenInfo(tokenSet, config.auth0Domain);

    cliOutput(
      `\n${chalk.green('✓')} Successfully authenticated to ${chalk.blue(config.auth0Domain)} using client credentials.\n`
    );
  } catch (error) {
    logError('Client credentials authentication error:', error);
    cliOutput(`\n${chalk.red('✗')} Failed to authenticate with client credentials.\n`);
    process.exit(1);
  }
}

/**
 * Store token information from client credentials flow
 *
 * @param {any} tokenSet - Token response from the server
 * @param {string} domain - The domain used for authentication
 */
async function storeTokenInfo(tokenSet: any, domain: string): Promise<void> {
  // For client credentials flow, we use the provided domain directly,
  // as the token may not contain tenant information in the same format as device flow

  // Store access token
  await keychain.setToken(tokenSet.access_token);
  await keychain.setDomain(domain);

  // Client credentials flow typically doesn't return refresh tokens
  // but we'll handle it just in case
  if (tokenSet.refresh_token) {
    await keychain.setRefreshToken(tokenSet.refresh_token);
    log('Refresh token stored in keychain');
  }

  // Set token expiration
  if (tokenSet.expires_in) {
    const expiresAt = Date.now() + tokenSet.expires_in * 1000;
    await keychain.setTokenExpiresAt(expiresAt);
    log(`Token expires at: ${new Date(expiresAt).toISOString()}`);
  }
}
