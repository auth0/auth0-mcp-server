import chalk from 'chalk';
import open from 'open';
import {
  startSpinner,
  stopSpinner,
  getTenantFromToken,
  cliOutput,
  promptForBrowserPermission,
} from '../utils/cli-utility.js';
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
    tenant: 'auth0-tus1.tus.auth0.com',
    clientId: 'iB6OlqHQDHN1dbwapBZ0cWPIErUfLxQT',
    audience: `https://*.tus.auth0.com/api/v2/`,
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
        fetchUserInfo(jsonRes, selectedScopes); // Success case
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

async function fetchUserInfo(tokenSet: any, selectedScopes?: string[]) {
  const tenantName = getTenantFromToken(tokenSet.access_token);
  const envValues = {
    AUTH0_TOKEN: tokenSet.access_token,
    AUTH0_DOMAIN: tenantName,
    AUTH0_TENANT_NAME: tenantName,
    AUTH0_CLIENT_ID: getConfig(selectedScopes).clientId,
  };

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

  Object.assign(process.env, envValues);
  log('Updated environment variables');
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

    process.env.AUTH0_TOKEN = tokenSet.access_token;

    log('Successfully refreshed access token');
    return tokenSet.access_token;
  } catch (error) {
    log('Error refreshing access token:', error);
    return null;
  }
}

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

export async function getValidAccessToken(): Promise<string | null> {
  try {
    const expired = await isTokenExpired();

    if (expired) {
      //[TODO] Implement refresh token flow
      log('Refresh token flow is not implemented yet, please try npx @auth0/auth0-mcp-server init');
      return null;
    }

    return await keychain.getToken();
  } catch (error) {
    log('Error getting valid access token:', error);
    return null;
  }
}

export { requestAuthorization };
