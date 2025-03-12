import { exec } from 'child_process';
import { promises as fs } from 'fs';
import keytar from 'keytar';
import debug from 'debug';
import chalk from 'chalk';
import { startSpinner, stopSpinner, getTenantFromToken } from './utility.js';

const log = debug('auth0-mcp:device-auth-flows');
const requiredScopes = `read:clients read:client_grants read:roles read:rules read:users read:branding read:email_templates read:email_provider read:flows read:forms read:flows_vault_connections read:connections read:client_keys read:logs read:tenant_settings read:custom_domains read:anomaly_blocks read:log_streams read:actions read:organizations read:organization_members read:organization_member_roles read:organization_connections read:prompts`;

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
      openChrome(jsonRes.verification_uri_complete);
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
  return new Promise(resolve => setTimeout(resolve, ms));
}

function openChrome(url: string) {
  exec(`open -a "Google Chrome" ${url}`, err => {
    if (err) {
      console.error('Failed to open Chrome:', err);
    } else {
      log('Chrome opened successfully');
    }
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

  try {
    let envContent = '';
    try {
      envContent = await fs.readFile('.env', 'utf-8');
    } catch (error) {
      log(JSON.stringify(error));
    }

    for (const [key, value] of Object.entries(envValues)) {
      const regex = new RegExp(`^${key}=.*$`, 'm');
      const newLine = `${key}=${value}`;

      if (regex.test(envContent)) {
        envContent = envContent.replace(regex, newLine);
      } else {
        envContent = envContent ? `${envContent}\n${newLine}` : newLine;
      }
    }
    await fs.writeFile('.env', envContent);
    log('Updated .env file successfully');

    Object.assign(process.env, envValues);
  } catch (error) {
    log(' Error updating .env file:', error);
  }
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

export { requestAuthorization };
