import { startServer } from '../server.js';
import trackEvent from '../utils/analytics.js';
import { log, logError, logInfo } from '../utils/logger.js';
import * as os from 'os';
import { keychain } from '../utils/keychain.js';
import { isTokenExpired } from '../auth/device-auth-flow.js';
import chalk from 'chalk';

/**
 * Command options for the run command
 */
export interface RunOptions {
  tools: string[];
  readOnly?: boolean;
}

/**
 * Validates authorization preconditions before starting the server
 * @returns {Promise<boolean>} True if authorization is valid, false otherwise
 */
const validateAuthorization = async (): Promise<boolean> => {
  // Check if token exists
  const token = await keychain.getToken();
  if (!token) {
    logError(`${chalk.red('Authorization Error:')} No valid authorization token found`);
    logError(`${chalk.bold('Recommended actions:')}`);
    logError(`1. Run ${chalk.cyan('npx @auth0/auth0-mcp-server init')} to authorize with Auth0`);
    logError(
      `2. Use ${chalk.cyan('npx @auth0/auth0-mcp-server session')} to check your current session status`
    );
    return false;
  }

  // Check if token is expired
  const expired = await isTokenExpired();
  if (expired) {
    const expiresAt = await keychain.getTokenExpiresAt();
    const expiryDate = expiresAt ? new Date(expiresAt).toLocaleString() : 'unknown';
    logError(`${chalk.red('Authorization Error:')} Token has expired (on ${expiryDate})`);
    logError(`${chalk.bold('Recommended actions:')}`);
    logError(
      `1. Run ${chalk.cyan('npx @auth0/auth0-mcp-server init')} to refresh your authorization`
    );
    logError(
      `2. Use ${chalk.cyan('npx @auth0/auth0-mcp-server session')} to check your current session details`
    );
    return false;
  }

  // Check if domain exists
  const domain = await keychain.getDomain();
  if (!domain) {
    logError(`${chalk.red('Authorization Error:')} No Auth0 domain found in configuration`);
    logError(`${chalk.bold('Recommended actions:')}`);
    logError(`1. Run ${chalk.cyan('npx @auth0/auth0-mcp-server init')} to authorize with Auth0`);
    logError(
      `2. Use ${chalk.cyan('npx @auth0/auth0-mcp-server session')} to check your current configuration`
    );
    return false;
  }

  return true;
};

/**
 * Main function to start server
 *
 * @param {RunOptions} options - Command options
 * @returns {Promise<void>}
 */
const run = async (options: RunOptions): Promise<void> => {
  try {
    if (!process.env.HOME) {
      process.env.HOME = os.homedir();
      log(`Set HOME environment variable to ${process.env.HOME}`);
    }

    trackEvent.trackServerRun();

    // Validate authorization before starting server
    const isAuthorized = await validateAuthorization();
    if (!isAuthorized) {
      // Exit with code 1 (standard error code)
      process.exit(1);
    }

    if (options.readOnly && options.tools.length === 1 && options.tools[0] === '*') {
      logInfo('Starting server in read-only mode');
    } else if (options.readOnly) {
      logInfo(
        `Starting server in read-only mode with tools matching the following pattern(s): ${options.tools.join(', ')} (--read-only has priority)`
      );
    } else {
      logInfo(
        `Starting server with tools matching the following pattern(s): ${options.tools.join(', ')}`
      );
    }
    await startServer(options);
  } catch (error) {
    logError('Fatal error starting server:', error);
    process.exit(1);
  }
};

export default run;
