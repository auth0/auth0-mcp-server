import keytar from 'keytar';
import chalk from 'chalk';
import open from 'open';
import { startSpinner, stopSpinner, getTenantFromToken } from '../cli-utility.js';
import { log } from '../logger.js';

const requiredScopes = `offline_access create:clients read:clients read:client_grants read:roles read:rules read:users read:branding read:email_templates read:email_provider read:flows read:forms read:flows_vault_connections read:connections read:client_keys read:logs read:tenant_settings read:custom_domains read:anomaly_blocks read:log_streams read:actions read:organizations read:organization_members read:organization_member_roles read:organization_connections read:prompts`;

function getConfig() {
  return {
    tenant: 'auth0-tus1.tus.auth0.com',
    clientId: 'iB6OlqHQDHN1dbwapBZ0cWPIErUfLxQT',
    audience: `https://*.tus.auth0.com/api/v2/`,
    scopes: requiredScopes,
  };
}

async function requestAuthorization() {
  const config = getConfig();
  let body: any = {
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
      console.log('Verify this code on screen', chalk.bold.green(jsonRes.user_code));
      openBrowser(jsonRes.verification_uri_complete);
      await exchangeDeviceCodeForToken(jsonRes);
    } else {
      console.log('Error', jsonRes);
      process.exit(1);
    }
  } catch (err) {
    console.log('Error', err);
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
    return false;
  }
}

function openBrowser(url: string) {
  if (!url || !isValidUrl(url)) {
    console.error('Invalid URL provided:', url);
    return;
  }

  open(url)
    .then(() => {
      log('Browser opened successfully');
    })
    .catch((err) => {
      console.error('Failed to open browser:', err);
    });
}

async function exchangeDeviceCodeForToken(deviceCode: any) {
  const config = getConfig();
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
        console.error('Unexpected error:', jsonRes.error);
        break; // Exit loop on unknown error
      }
    } catch (err) {
      stopSpinner();
      console.error('Error in token exchange:', err);
      break; // Exit loop on fetch failure
    }
  }
  stopSpinner();
}

async function fetchUserInfo(tokenSet: any) {
  const tenantName = getTenantFromToken(tokenSet.access_token);
  const envValues = {
    AUTH0_TOKEN: tokenSet.access_token,
    AUTH0_DOMAIN: tenantName,
    AUTH0_TENANT_NAME: tenantName,
    AUTH0_CLIENT_ID: getConfig().clientId,
  };

  await storeInKeychain('auth0-mcp', 'AUTH0_TOKEN', tokenSet.access_token);
  await storeInKeychain('auth0-mcp', 'AUTH0_DOMAIN', tenantName);

  if (tokenSet.refresh_token) {
    await storeInKeychain('auth0-mcp', 'AUTH0_REFRESH_TOKEN', tokenSet.refresh_token);
    log('Refresh token stored in keychain');
  }

  if (tokenSet.expires_in) {
    const expiresAt = Date.now() + tokenSet.expires_in * 1000;
    await storeInKeychain('auth0-mcp', 'AUTH0_TOKEN_EXPIRES_AT', expiresAt.toString());
    log(`Token expires at: ${new Date(expiresAt).toISOString()}`);
  }

  Object.assign(process.env, envValues);
  log('Updated environment variables');
}

async function storeInKeychain(app: string, key: string, value: string): Promise<boolean> {
  try {
    await keytar.setPassword(app, key, value);
    log(`Successfully stored ${key} in keychain`);
    return true;
  } catch (error) {
    log(`Error storing ${key} in keychain:`, error);
    return false;
  }
}

export async function refreshAccessToken(): Promise<string | null> {
  try {
    log('Attempting to refresh access token');

    const refreshToken = await keytar.getPassword('auth0-mcp', 'AUTH0_REFRESH_TOKEN');
    if (!refreshToken) {
      log('No refresh token found in keychain');
      return null;
    }

    const config = getConfig();
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

    const tenantName = getTenantFromToken(tokenSet.access_token);
    await storeInKeychain('auth0-mcp', 'AUTH0_TOKEN', tokenSet.access_token);

    if (tokenSet.refresh_token) {
      await storeInKeychain('auth0-mcp', 'AUTH0_REFRESH_TOKEN', tokenSet.refresh_token);
    }

    if (tokenSet.expires_in) {
      const expiresAt = Date.now() + tokenSet.expires_in * 1000;
      await storeInKeychain('auth0-mcp', 'AUTH0_TOKEN_EXPIRES_AT', expiresAt.toString());
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
    const expiresAtStr = await keytar.getPassword('auth0-mcp', 'AUTH0_TOKEN_EXPIRES_AT');
    if (!expiresAtStr) {
      log('No token expiration time found');
      return true;
    }

    const expiresAt = parseInt(expiresAtStr, 10);
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
      const newToken = await refreshAccessToken();
      if (newToken) {
        return newToken;
      }

      log('Token refresh failed, trying to use existing token');
    }

    const token = await keytar.getPassword('auth0-mcp', 'AUTH0_TOKEN');
    return token;
  } catch (error) {
    log('Error getting valid access token:', error);
    return null;
  }
}

export { requestAuthorization };
