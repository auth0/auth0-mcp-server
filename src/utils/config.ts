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

export interface Auth0Config {
  token: string;
  domain: string;
  tenantName?: string;
}

export async function loadConfig(): Promise<Auth0Config | null> {
  const token = await getValidAccessToken();
  const domain = await keychain.getDomain();

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
