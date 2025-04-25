import chalk from 'chalk';
import { log, logError } from '../utils/logger.js';
import { cliOutput } from '../utils/cli-utility.js';
import { keychain, KeychainItem, type KeychainOperationResult } from '../utils/keychain.js';
import { revokeRefreshToken } from '../auth/device-auth-flow.js';
/**
 * Maps technical keychain item names to user-friendly descriptions
 * @param item - The keychain item key
 * @returns A user-friendly description of the item
 */
const getItemDescription = (item: string): string => {
  const descriptions: Record<string, string> = {
    [KeychainItem.TOKEN]: 'access token',
    [KeychainItem.REFRESH_TOKEN]: 'refresh token',
    [KeychainItem.DOMAIN]: 'domain information',
    [KeychainItem.TOKEN_EXPIRES_AT]: 'token expiration',
  };
  return descriptions[item] ?? item;
};

/**
 * Creates a formatted message for successful token removal
 * @param successfulItems - Array of successfully removed items
 * @returns A formatted success message
 */
const createSuccessMessage = (successfulItems: KeychainOperationResult[]): string => {
  if (successfulItems.length === 0) return '';

  const tokenNames = successfulItems.map((result) => getItemDescription(result.item));
  return `${chalk.green('✓')} Successfully removed ${tokenNames.join(', ')} from your system keychain.\n`;
};

/**
 * Creates a formatted message for items that failed to be removed
 * @param failedItems - Array of items that failed to be removed
 * @returns A formatted error message
 */
const createErrorMessage = (failedItems: KeychainOperationResult[]): string => {
  if (failedItems.length === 0) return '';

  const errorLines = failedItems.map(
    (result) =>
      `${chalk.red('✗')} ${getItemDescription(result.item)}: ${result.error?.message ?? 'Unknown error'}`
  );

  return [
    `${chalk.yellow('!')} Some credentials could not be removed and may require manual cleanup:`,
    ...errorLines,
    `\n${chalk.blue('i')} To manually remove credentials, use your system's keychain manager and search for 'auth0-mcp'.`,
  ].join('\n');
};

/**
 * Categorizes deletion results into successful and failed operations
 * @param results - Array of keychain operation results
 * @returns Object containing arrays of successful and failed operations
 */
const categorizeResults = (
  results: KeychainOperationResult[]
): {
  successful: KeychainOperationResult[];
  failed: KeychainOperationResult[];
} => {
  return {
    successful: results.filter((result) => result.success),
    failed: results.filter((result) => !result.success),
  };
};

/**
 * Command options for the logout command
 */
export type LogoutOptions = Record<string, never>;

/**
 * Removes all Auth0 MCP related tokens from the system keychain
 *
 * @param {LogoutOptions} _options - Command options from commander (unused)
 * @returns A promise that resolves when logout is complete
 */
async function logout(_options?: LogoutOptions): Promise<void> {
  try {
    log('Removing Auth0 tokens from keychain');
    cliOutput(`\n${chalk.blue('i')} Clearing authentication data...\n`);

    log('Revoke refresh token if present');
    await revokeRefreshToken();

    // Delete all items from the keychain
    const deletionResults = await keychain.clearAll();
    const { successful, failed } = categorizeResults(deletionResults);

    if (successful.length > 0) {
      cliOutput(createSuccessMessage(successful));
    } else if (deletionResults.length === failed.length) {
      cliOutput(
        `${chalk.yellow('!')} No Auth0 MCP authentication data was found in your system keychain.\n`
      );
    }

    if (failed.length > 0) {
      cliOutput(createErrorMessage(failed));
    }
  } catch (error) {
    logError('Error during logout:', error);
    cliOutput(
      `\n${chalk.red('✗')} Failed to clear authentication data. ${error instanceof Error ? error.message : ''}\n`
    );
    process.exit(1);
  }
}

export default logout;
