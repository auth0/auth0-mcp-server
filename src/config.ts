import { exec, execSync } from 'child_process';
import debug from 'debug';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { promisify } from 'util';
import keytar from 'keytar';
import { getValidAccessToken, isTokenExpired, refreshAccessToken } from './device-auth-flow.js';

// Promisify exec
const execAsync = promisify(exec);

// Set up debug logger
const log = debug('auth0-mcp:config');

// Handle ESM module __dirname equivalent
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Ensure HOME is set
if (!process.env.HOME) {
  process.env.HOME = os.homedir();
  log(`HOME environment variable was not set, setting to: ${process.env.HOME}`);
}

// Determine if we're in debug mode
const isDebugMode =
  process.env.AUTH0_MCP_DEBUG === 'true' || process.env.DEBUG?.includes('auth0-mcp');
log(`Debug mode: ${isDebugMode}`);

export interface Auth0Config {
  token: string;
  domain: string;
  tenantName: string;
}

export async function loadConfig(): Promise<Auth0Config | null> {
  // Check if token is expired and refresh if needed
  const isExpired = await isTokenExpired();
  if (isExpired) {
    log('Access token is expired or will expire soon, attempting to refresh');
    const newToken = await refreshAccessToken();
    if (newToken) {
      log('Successfully refreshed access token');
    } else {
      log('Failed to refresh access token, will use existing token if available');
    }
  }

  // Get the valid token (either refreshed or existing)
  const token = await getValidAccessToken();
  const domain = await keytar.getPassword('auth0-mcp', 'AUTH0_DOMAIN');
  
  return {
    token: token || '',
    domain: domain || '',
    tenantName: domain || 'default',
  };
}

export function validateConfig(config: Auth0Config | null): config is Auth0Config {
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

  return true;
}
