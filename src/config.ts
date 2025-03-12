import { exec, execSync } from 'child_process';
import debug from 'debug';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { promisify } from 'util';
import * as dotenv from 'dotenv';
import keytar from 'keytar';

// Promisify exec
const execAsync = promisify(exec);

// Set up debug logger
const log = debug('auth0-mcp:config');

// Handle ESM module __dirname equivalent
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Add this before the loadConfig function
// Load .env file from the project root
dotenv.config({ path: path.resolve(__dirname, '../.env') });

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
  return {
    token: (await keytar.getPassword('auth0-mcp', 'AUTH0_TOKEN')) || '',
    domain: (await keytar.getPassword('auth0-mcp', 'AUTH0_DOMAIN')) || '',
    tenantName: (await keytar.getPassword('auth0-mcp', 'AUTH0_DOMAIN')) || 'default',
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
