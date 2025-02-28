import { exec, execSync } from 'child_process';
import debug from 'debug';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { promisify } from 'util';

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
  try {
    // First try to get config from Auth0 CLI
    log('Prioritizing Auth0 CLI for configuration...');

    // Get token and tenant info from CLI
    const cliConfig = await getConfigFromCLI();
    if (cliConfig) {
      log('Successfully loaded configuration from Auth0 CLI');
      return cliConfig;
    }

    // Fallback to environment variables if CLI failed
    if (process.env.AUTH0_TOKEN && process.env.AUTH0_DOMAIN) {
      log('Falling back to environment variables for configuration');
      log(`Domain: ${process.env.AUTH0_DOMAIN}`);
      log(`Token length: ${process.env.AUTH0_TOKEN.length}`);

      return {
        token: process.env.AUTH0_TOKEN,
        domain: process.env.AUTH0_DOMAIN,
        tenantName: process.env.AUTH0_TENANT_NAME || 'default',
      };
    }

    // If all else fails, try to read from config files
    return await getConfigFromFiles();
  } catch (error) {
    log('Error loading configuration:', error);
    return null;
  }
}

async function getConfigFromCLI(): Promise<Auth0Config | null> {
  try {
    log('Getting configuration from Auth0 CLI...');

    // Get token from CLI
    const tokenResult = await getTokenFromCLI();
    if (!tokenResult) {
      log('Failed to get token from CLI');
      return null;
    }

    // Get tenant info
    const tenantInfo = await getTenantFromCLI();
    if (!tenantInfo) {
      log('Failed to get tenant info from CLI');
      return null;
    }

    return {
      token: tokenResult.token,
      domain: tenantInfo.domain,
      tenantName: tenantInfo.name,
    };
  } catch (error) {
    log('Error getting config from CLI:', error);
    return null;
  }
}

async function getTenantFromCLI(): Promise<{ domain: string; name: string } | null> {
  try {
    const cliPath = getAuth0CliPath();
    log(`Using Auth0 CLI at: ${cliPath}`);

    const { stdout } = await execAsync(`${cliPath} tenants list --json`, {
      env: {
        ...process.env,
        HOME: process.env.HOME || os.homedir(),
      },
    });

    const tenants = JSON.parse(stdout);
    if (!tenants || tenants.length === 0) {
      log('No tenants found in Auth0 CLI');
      return null;
    }

    const activeTenant = tenants.find((t: any) => t.active) || tenants[0];
    log(`Found active tenant via CLI: ${activeTenant.name}`);

    return {
      domain: activeTenant.name,
      name: activeTenant.name.split('.')[0],
    };
  } catch (error) {
    log('Error getting tenant from CLI:', error);
    return null;
  }
}

async function getConfigFromFiles(): Promise<Auth0Config | null> {
  try {
    // Check both possible auth0-cli config locations
    const configPaths = [
      path.join(os.homedir(), '.config', 'auth0', 'config.json'),
      path.join(os.homedir(), '.auth0', 'config.json'),
    ];

    let configPath = '';
    let configData = null;

    // Try each path
    for (const possiblePath of configPaths) {
      log(`Checking for auth0-cli config at ${possiblePath}`);
      if (fs.existsSync(possiblePath)) {
        log(`Found auth0-cli config at ${possiblePath}`);
        configPath = possiblePath;
        try {
          configData = JSON.parse(fs.readFileSync(possiblePath, 'utf8'));
          break;
        } catch (e) {
          log(`Error parsing config at ${possiblePath}:`, e);
        }
      }
    }

    if (!configData) {
      log('Auth0 CLI config not found in any expected location');
      return null;
    }

    if (!configData.default_tenant) {
      log('No default tenant configured in auth0-cli');
      return null;
    }

    const defaultTenant = configData.tenants[configData.default_tenant];
    if (!defaultTenant) {
      log(`Default tenant ${configData.default_tenant} not found in config`);
      return null;
    }

    log(`Default tenant: ${JSON.stringify(defaultTenant, null, 2)}`);

    // Check if token is expired and log a warning
    const expiresAt = new Date(defaultTenant.expires_at);
    log(`Expiration date: ${expiresAt.toISOString()}, current date: ${new Date().toISOString()}`);

    // Make sure to always compare dates using getTime() to handle string formats properly
    if (isNaN(expiresAt.getTime()) || expiresAt.getTime() < new Date().getTime()) {
      log('Warning: Auth0 token is expired. Please run `auth0 login` to refresh it');

      // Try to get a fresh token using the CLI
      const tokenResult = await getTokenFromCLI();
      if (!tokenResult) {
        return null;
      }

      return {
        token: tokenResult.token,
        domain: defaultTenant.domain,
        tenantName: defaultTenant.name,
      };
    }

    // Get token from keyring if possible
    if (!defaultTenant.access_token || defaultTenant.access_token.length === 0) {
      log('No access token in config file, trying to get one from auth0-cli');
      const tokenResult = await getTokenFromCLI();
      if (!tokenResult) {
        return null;
      }

      return {
        token: tokenResult.token,
        domain: defaultTenant.domain,
        tenantName: defaultTenant.name,
      };
    }

    log(`Using configuration for tenant: ${defaultTenant.name}`);
    return {
      token: defaultTenant.access_token,
      domain: defaultTenant.domain,
      tenantName: defaultTenant.name,
    };
  } catch (error) {
    log('Error loading configuration from files:', error);
    return null;
  }
}

/**
 * Get the appropriate Auth0 CLI path based on mode
 * In debug mode, prefer local CLI path, otherwise prefer global
 */
function getAuth0CliPath(): string {
  const localCliPath = process.env.AUTH0_CLI_PATH;

  // Debug mode - prefer local CLI path (if set and exists)
  if (isDebugMode && localCliPath && fs.existsSync(localCliPath)) {
    log(`Using local Auth0 CLI path from AUTH0_CLI_PATH: ${localCliPath}`);
    return localCliPath;
  }

  // In production mode or if local path not available - try global path first
  try {
    const globalCliPath = execSync('which auth0', { encoding: 'utf8' }).trim();
    if (globalCliPath) {
      log(`Using global Auth0 CLI found in PATH: ${globalCliPath}`);
      return globalCliPath;
    }
  } catch (error) {
    log('Global Auth0 CLI not found in PATH');
  }

  // Fallback to local CLI path if it exists
  if (localCliPath && fs.existsSync(localCliPath)) {
    log(`Falling back to local Auth0 CLI path: ${localCliPath}`);
    return localCliPath;
  }

  // Try specific paths as last resort
  const possiblePaths = [
    localCliPath || '',
    path.join(os.homedir(), '.local', 'bin', 'auth0'),
    path.join(os.homedir(), 'bin', 'auth0'),
    './auth0',
    path.resolve(process.cwd(), 'auth0'),
    path.resolve(process.cwd(), '..', 'auth0-cli', 'auth0'),
  ].filter(p => p.length > 0);

  for (const possiblePath of possiblePaths) {
    if (fs.existsSync(possiblePath)) {
      log(`Found Auth0 CLI at: ${possiblePath}`);
      return possiblePath;
    }
  }

  // If all else fails, just return 'auth0' and hope it's in PATH
  log('No Auth0 CLI found, returning default "auth0" command');
  return 'auth0';
}

async function getTokenFromCLI(): Promise<{ token: string } | null> {
  try {
    // Ensure HOME is set before doing anything
    if (!process.env.HOME) {
      process.env.HOME = os.homedir();
      log(`HOME was undefined, set to: ${process.env.HOME}`);
    }

    log('Attempting to get token using auth0-cli');

    // Get the CLI path
    const cliPath = getAuth0CliPath();
    log(`Using Auth0 CLI at: ${cliPath}`);

    // Try to make it executable
    if (fs.existsSync(cliPath)) {
      try {
        fs.chmodSync(cliPath, '755');
        log(`Made ${cliPath} executable`);
      } catch (error) {
        log(`Warning: Could not make CLI executable: ${error}`);
      }
    }

    // Try to get token using CLI
    try {
      const { stdout } = await execAsync(`${cliPath} api get-token`, {
        env: {
          ...process.env,
          HOME: process.env.HOME || os.homedir(),
        },
      });
      const token = stdout.trim();

      if (token && token.length > 0) {
        log(`Successfully got token using CLI (length: ${token.length})`);
        if (token.length > 10) {
          log(`Token preview: ${token.substring(0, 5)}...${token.substring(token.length - 5)}`);
        }
        return { token };
      } else {
        log('Empty token returned from CLI');
        return null;
      }
    } catch (error: any) {
      log(`Error getting token from CLI: ${error.message}`);
      if (error.stderr) {
        log(`Error output: ${error.stderr}`);
      }
      return null;
    }
  } catch (e) {
    log('Error in getTokenFromCLI:', e);
    return null;
  }
}

// Helper function to validate config
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
