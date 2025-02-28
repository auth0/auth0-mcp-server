/**
 * Auth0 Token Service
 *
 * This module provides secure, reliable token retrieval with proper timeouts,
 * caching, and expiration checking.
 */

import { exec } from 'child_process';
import debug from 'debug';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { promisify } from 'util';

const execAsync = promisify(exec);
const log = debug('auth0-mcp:token');

// Token cache with expiration
interface TokenCache {
  token: string;
  expiresAt: number; // timestamp
}

// Default timeout for token retrieval (10 seconds)
const DEFAULT_TIMEOUT_MS = 10000;

// Cache settings
const CACHE_TTL_MS = 55 * 60 * 1000; // 55 minutes (tokens typically expire in 1 hour)
let tokenCache: TokenCache | null = null;

/**
 * Get an Auth0 token with proper timeout and caching
 */
export async function getToken(forceRefresh = false): Promise<string> {
  // Check for environment variable token first
  const envToken = process.env.AUTH0_TOKEN;
  if (envToken && !forceRefresh) {
    log('Using token from environment variable');
    return envToken;
  }

  // Check cache if not forcing refresh
  if (!forceRefresh && tokenCache && tokenCache.expiresAt > Date.now()) {
    log(
      'Using cached token (expires in %d minutes)',
      Math.round((tokenCache.expiresAt - Date.now()) / 60000)
    );
    return tokenCache.token;
  }

  log('Token not found or expired, retrieving fresh token');

  // Try multiple methods to get a token
  try {
    // Method 1: Use auth0 CLI from environment variable
    if (process.env.AUTH0_CLI_PATH) {
      const cliPath = process.env.AUTH0_CLI_PATH;
      if (fs.existsSync(cliPath)) {
        log('Trying token retrieval with AUTH0_CLI_PATH: %s', cliPath);
        try {
          const token = await getTokenWithTimeout(`"${cliPath}" api get-token`);
          if (token) {
            cacheToken(token);
            return token;
          }
        } catch (error) {
          log(
            'Failed to get token using AUTH0_CLI_PATH: %s',
            error instanceof Error ? error.message : String(error)
          );
        }
      }
    }

    // Method 2: Use auth0 CLI from PATH
    log('Trying token retrieval with auth0 from PATH');
    try {
      const token = await getTokenWithTimeout('auth0 api get-token');
      if (token) {
        cacheToken(token);
        return token;
      }
    } catch (error) {
      log(
        'Failed to get token using auth0 from PATH: %s',
        error instanceof Error ? error.message : String(error)
      );
    }

    // Method 3: Check config files
    log('Trying to extract token from config files');
    const configToken = await extractTokenFromConfig();
    if (configToken) {
      cacheToken(configToken);
      return configToken;
    }

    // All methods failed
    throw new Error('Failed to retrieve Auth0 token using all available methods');
  } catch (error) {
    log('Error retrieving token: %s', error instanceof Error ? error.message : String(error));
    throw new Error(
      `Token retrieval failed: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

/**
 * Execute a command with timeout to get token
 */
async function getTokenWithTimeout(
  command: string,
  timeoutMs = DEFAULT_TIMEOUT_MS
): Promise<string | null> {
  return new Promise((resolve, reject) => {
    log('Executing with timeout (%dms): %s', timeoutMs, command);

    // Start process
    const childProcess = exec(command);
    let stdout = '';
    let stderr = '';

    // Set timeout
    const timeout = setTimeout(() => {
      log('Command timed out after %dms: %s', timeoutMs, command);
      childProcess.kill();
      reject(new Error(`Command timed out after ${timeoutMs}ms`));
    }, timeoutMs);

    // Collect output
    childProcess.stdout?.on('data', data => {
      stdout += data;
    });

    childProcess.stderr?.on('data', data => {
      stderr += data;
    });

    // Handle completion
    childProcess.on('close', code => {
      clearTimeout(timeout);

      if (code === 0) {
        const token = stdout.trim();
        if (token) {
          log('Successfully retrieved token (length: %d)', token.length);
          resolve(token);
        } else {
          log('Command succeeded but returned empty token');
          resolve(null);
        }
      } else {
        log('Command failed with code %d: %s', code, stderr);
        resolve(null);
      }
    });

    // Handle errors
    childProcess.on('error', error => {
      clearTimeout(timeout);
      log('Command error: %s', error.message);
      resolve(null);
    });
  });
}

/**
 * Cache a token with expiration
 */
function cacheToken(token: string): void {
  tokenCache = {
    token,
    expiresAt: Date.now() + CACHE_TTL_MS,
  };

  log('Token cached with expiration in %d minutes', Math.round(CACHE_TTL_MS / 60000));
}

/**
 * Extract token from config files as last resort
 */
async function extractTokenFromConfig(): Promise<string | null> {
  const homeDir = os.homedir();
  const configPaths = [
    path.join(homeDir, '.config', 'auth0', 'config.json'),
    path.join(homeDir, '.auth0', 'config.json'),
  ];

  for (const configPath of configPaths) {
    log('Checking config at: %s', configPath);

    if (fs.existsSync(configPath)) {
      try {
        const configData = fs.readFileSync(configPath, 'utf8');
        const configJson = JSON.parse(configData);

        // Look for access_token in root
        if (configJson.access_token) {
          log('Found access_token in config root');
          return configJson.access_token;
        }

        // Look for token in default tenant
        if (
          configJson.default_tenant &&
          configJson.tenants &&
          configJson.tenants[configJson.default_tenant] &&
          configJson.tenants[configJson.default_tenant].access_token
        ) {
          log('Found token in default tenant');
          return configJson.tenants[configJson.default_tenant].access_token;
        }
      } catch (error) {
        log(
          'Error reading config file: %s',
          error instanceof Error ? error.message : String(error)
        );
      }
    }
  }

  log('No token found in config files');
  return null;
}
