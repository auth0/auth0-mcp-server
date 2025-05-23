import chalk from 'chalk';
import open from 'open';
import {
  startSpinner,
  stopSpinner,
  getTenantFromToken,
  cliOutput,
  promptForBrowserPermission,
} from '../utils/terminal.js';
import { log, logError } from '../utils/logger.js';
import { keychain } from '../utils/keychain.js';
import { DEFAULT_SCOPES } from '../utils/scopes.js';

function getConfig(selectedScopes?: string[]) {
  // If selectedScopes is provided, use those scopes
  // If not provided or empty, use DEFAULT_SCOPES (which is now empty by default)
  const scopes =
    selectedScopes && selectedScopes.length > 0
      ? selectedScopes.join(' ')
      : DEFAULT_SCOPES.join(' ');

  return {
    tenant: 'auth0.auth0.com',
    clientId: '2lhnuYMRQ8IpR5hNsOhDFQqrGQUQMRm5',
    audience: 'https://*.auth0.com/api/v2/',
    scopes,
  };
}

async function requestAuthorization(selectedScopes?: string[]) {
  const config = getConfig(selectedScopes);
  const body: any = {
    client_id: config.clientId,
  };

  if (config.audience) {
    body.audience = config.audience;
  }

  if (config.scopes.length) {
    body.scope = config.scopes;
  }
  try {
    const response = await fetch(`https://${config.tenant}/oauth/device/code`, {
      method: 'POST',
      body: new URLSearchParams(body),
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/x-www-form-urlencoded',
      },
    });

    const jsonRes = await response.json();
    if (!jsonRes.error) {
      cliOutput(`\nVerify this code on screen: ${chalk.bold.green(jsonRes.user_code)}\n`);
      // Wait for user to press Enter to open browser
      await promptForBrowserPermission();
      openBrowser(jsonRes.verification_uri_complete);
      await exchangeDeviceCodeForToken(jsonRes, selectedScopes);
    } else {
      logError('Error', jsonRes);
      process.exit(1);
    }
  } catch (err) {
    logError('Error', err);
    process.exit(1);
  }
}

function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isValidUrl(url: string): boolean {
  try {
    const parsedUrl = new URL(url);
    // Check for safe protocols
    return ['http:', 'https:'].includes(parsedUrl.protocol);
  } catch (error) {
    logError('Error', error);
    return false;
  }
}

function openBrowser(url: string) {
  if (!url || !isValidUrl(url)) {
    logError('Invalid URL provided:', url);
    return;
  }

  open(url)
    .then(() => {
      log('Browser opened successfully');
    })
    .catch((err) => {
      logError('Failed to open browser:', err);
    });
}

async function exchangeDeviceCodeForToken(deviceCode: any, selectedScopes?: string[]) {
  const config = getConfig(selectedScopes);
  startSpinner('Waiting for authorization...');
  while (true) {
    try {
      const response = await fetch(`https://${config.tenant}/oauth/token`, {
        method: 'POST',
        body: new URLSearchParams({
          client_id: config.clientId,
          device_code: deviceCode.device_code,
          grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
        }),
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/x-www-form-urlencoded',
        },
      });

      const jsonRes = await response.json();

      if (!jsonRes.error) {
        fetchUserInfo(jsonRes); // Success case
        break; // Exit loop once successful
      } else if (['authorization_pending', 'slow_down'].includes(jsonRes.error)) {
        await wait(5000); // Wait before polling again
      } else {
        stopSpinner();
        logError('Unexpected error:', jsonRes.error);
        break; // Exit loop on unknown error
      }
    } catch (err) {
      stopSpinner();
      logError('Error in token exchange:', err);
      break; // Exit loop on fetch failure
    }
  }
  stopSpinner();
}

async function fetchUserInfo(tokenSet: any) {
  const tenantName = getTenantFromToken(tokenSet.access_token);

  // Store tokens in keychain
  await keychain.setToken(tokenSet.access_token);
  await keychain.setDomain(tenantName);

  if (tokenSet.refresh_token) {
    await keychain.setRefreshToken(tokenSet.refresh_token);
    log('Refresh token stored in keychain');
  }

  if (tokenSet.expires_in) {
    const expiresAt = Date.now() + tokenSet.expires_in * 1000;
    await keychain.setTokenExpiresAt(expiresAt);
    log(`Token expires at: ${new Date(expiresAt).toISOString()}`);
  }
}

export async function refreshAccessToken(selectedScopes?: string[]): Promise<string | null> {
  try {
    log('Attempting to refresh access token');

    const refreshToken = await keychain.getRefreshToken();
    if (!refreshToken) {
      log('No refresh token found in keychain');
      return null;
    }

    const config = getConfig(selectedScopes);
    const response = await fetch(`https://${config.tenant}/oauth/token`, {
      method: 'POST',
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        client_id: config.clientId,
        refresh_token: refreshToken,
      }),
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
    });

    const tokenSet = await response.json();

    if (tokenSet.error) {
      log(`Error refreshing token: ${tokenSet.error}`);
      return null;
    }

    // Store new tokens
    const tenantName = getTenantFromToken(tokenSet.access_token);
    await keychain.setToken(tokenSet.access_token);
    await keychain.setDomain(tenantName);

    if (tokenSet.refresh_token) {
      await keychain.setRefreshToken(tokenSet.refresh_token);
    }

    if (tokenSet.expires_in) {
      const expiresAt = Date.now() + tokenSet.expires_in * 1000;
      await keychain.setTokenExpiresAt(expiresAt);
    }

    log('Successfully refreshed access token');
    return tokenSet.access_token;
  } catch (error) {
    log('Error refreshing access token:', error);
    return null;
  }
}

/**
 * Revokes the refresh token that is previously set within keychain when offline_access is requested.
 * Returns true if the call is successful or if the refresh token does not exist.
 * @returns {Promise<boolean>}
 */
export async function revokeRefreshToken(): Promise<boolean> {
  try {
    log('Attempting to revoke refresh token');

    const refreshToken = await keychain.getRefreshToken();
    if (!refreshToken) {
      log('No refresh token found in keychain');
      return true;
    }
    const config = getConfig();
    const response = await fetch(`https://${config.tenant}/oauth/revoke`, {
      method: 'POST',
      body: new URLSearchParams({
        client_id: config.clientId,
        token: refreshToken,
      }),
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
    });

    if (response.status === 200) {
      log('Refresh token successfully revoked');
      return true;
    } else {
      log('Error calling revoke API: ', response.statusText);
      return false;
    }
  } catch (error) {
    log('Error revoking refresh token:', error);
    return false;
  }
}

/**
 * Determines if the current access token is expired or will expire soon.
 *
 * This security check is crucial for maintaining continuous authenticated access
 * to Auth0 APIs. It includes a configurable buffer time to proactively detect
 * tokens that will expire soon, preventing potential disruptions during operations
 * that might span multiple API calls. This proactive approach allows the system to
 * initiate refresh flows before actual expiration occurs.
 *
 * The function considers a token expired in the following cases:
 * - No expiration time is found in the keychain via `keychain.getTokenExpiresAt()`
 * - Current time + buffer exceeds the token's expiration time
 * - Error occurs during expiration check (fails secure)
 *
 * This function is used both by `validateAuthorization()` in `run.ts` for user-friendly
 * startup validation and by `validateConfig()` for continuous runtime validation.
 *
 * @param {number} bufferSeconds - Seconds before actual expiration to consider token expired (default: 300s/5min)
 * @returns {Promise<boolean>} True if token is expired or will expire within the buffer period
 */
export async function isTokenExpired(bufferSeconds = 300): Promise<boolean> {
  try {
    const expiresAt = await keychain.getTokenExpiresAt();
    if (!expiresAt) {
      log('No token expiration time found');
      return true;
    }

    const now = Date.now();
    const isExpired = now + bufferSeconds * 1000 >= expiresAt;

    if (isExpired) {
      log(`Token is expired or will expire soon. Expires at: ${new Date(expiresAt).toISOString()}`);
    }

    return isExpired;
  } catch (error) {
    log('Error checking token expiration:', error);
    return true;
  }
}

/**
 * Retrieves a valid access token for Auth0 API operations.
 *
 * This function serves as the main entry point for credential retrieval,
 * ensuring that only valid, non-expired tokens are provided to API operations.
 * It implements a critical security checkpoint that prevents operations from
 * proceeding with invalid authentication, which could lead to API failures
 * or unpredictable behavior.
 *
 * The function performs these key security checks:
 * 1. Verifies token expiration status using isTokenExpired
 * 2. Provides clear guidance to users when re-authentication is needed
 * 3. Handles errors gracefully with a fail-secure approach
 *
 * @returns {Promise<string|null>} A valid access token, or null if no valid token is available
 */
export async function getValidAccessToken(): Promise<string | null> {
  try {
    const expired = await isTokenExpired();

    if (expired) {
      log('Token is expired. Please authenticate again using `npx @auth0/auth0-mcp-server init`');
      return null;
    }

    return await keychain.getToken();
  } catch (error) {
    log('Error getting valid access token:', error);
    return null;
  }
}

export { requestAuthorization };
