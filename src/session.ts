import chalk from 'chalk';
import { keychain } from './utils/keychain.js';
import { cliOutput } from './utils/cli-utility.js';
import { log } from './utils/logger.js';

/**
 * Formats a date for display in user-friendly format
 * @param timestamp - The timestamp to format
 * @returns A formatted date string
 */
const formatDate = (timestamp: number): string => {
  return new Date(timestamp).toLocaleString();
};

/**
 * Creates a message for when no active session is found
 * @returns A formatted message string
 */
const createNoSessionMessage = (): string => {
  return [
    `\n${chalk.yellow('!')} No active authentication session found.\n`,
    `Run ${chalk.cyan('npx @auth0/auth0-mcp-server init')} to authenticate.\n`,
  ].join('');
};

/**
 * Creates a header for the session information display
 * @param domain - The authenticated domain
 * @returns A formatted header string
 */
const createSessionHeader = (domain: string): string => {
  return [
    `\n${chalk.green('✓')} Active authentication session:\n`,
    `${chalk.bold('Domain:')} ${domain}\n`,
  ].join('');
};

/**
 * Creates a message about token expiration status
 * @param expiresAt - The timestamp when the token expires
 * @returns A formatted expiration message
 */
const createExpirationMessage = (expiresAt: number): string => {
  const now = Date.now();
  const expiresIn = expiresAt - now;

  if (expiresIn > 0) {
    const hoursRemaining = Math.floor(expiresIn / (1000 * 60 * 60));
    return `${chalk.bold('Token expires:')} in ${hoursRemaining} hours (${formatDate(expiresAt)})\n`;
  } else {
    return `${chalk.bold('Token status:')} ${chalk.red('Expired')} on ${formatDate(expiresAt)}\n`;
  }
};

/**
 * Creates a footer with logout instructions
 * @returns A formatted instruction string
 */
const createLogoutInstructions = (): string => {
  return `\nTo use different credentials, run ${chalk.cyan('npx @auth0/auth0-mcp-server logout')}\n`;
};

/**
 * Creates an error message when session info can't be retrieved
 * @returns A formatted error message
 */
const createErrorMessage = (): string => {
  return `\n${chalk.red('✗')} Failed to retrieve session information.\n`;
};

/**
 * Displays information about the current authentication session
 * @returns A promise that resolves when the display is complete
 */
async function session(): Promise<void> {
  try {
    log('Retrieving session information');

    // Get session data from keychain
    const token = await keychain.getToken();
    const domain = await keychain.getDomain();
    const expiresAt = await keychain.getTokenExpiresAt();

    // Handle case where no session exists
    if (!token || !domain) {
      cliOutput(createNoSessionMessage());
      return;
    }

    // Display session information
    cliOutput(createSessionHeader(domain));

    // Add expiration information if available
    if (expiresAt) {
      cliOutput(createExpirationMessage(expiresAt));
    }

    // Add logout instructions
    cliOutput(createLogoutInstructions());
  } catch (error) {
    log('Error retrieving session information:', error);
    cliOutput(createErrorMessage());
  }
}

export default session;
