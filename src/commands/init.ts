import { findAndUpdateClaudeConfig } from '../clients/claude.js';
import { findAndUpdateWindsurfConfig } from '../clients/windsurf.js';
import { findAndUpdateCursorConfig } from '../clients/cursor.js';
import { log, logError } from '../utils/logger.js';
import { requestAuthorization } from '../auth/device-auth-flow.js';
import { promptForScopeSelection } from '../utils/cli-utility.js';
import { getAllScopes } from '../utils/scopes.js';
import { Glob } from '../utils/glob.js';
import chalk from 'chalk';
import type { ClientOptions } from '../utils/types.js';

/**
 * Supported client types
 */
export type ClientName = 'claude' | 'windsurf' | 'cursor';

/**
 * Command options for the init command
 */
export interface InitOptions {
  client: ClientName;
  scopes?: string[];
  tools: string[];
}

interface ClientAction {
  message: string;
  action: (options: ClientOptions) => Promise<void>;
}

/**
 * Maps client names to their config functions and messages
 */
const CLIENT_CONFIGS: Record<ClientName, ClientAction> = {
  windsurf: {
    message: 'Configuring Windsurf as client...',
    action: findAndUpdateWindsurfConfig,
  },
  cursor: {
    message: 'Configuring Cursor as client...',
    action: findAndUpdateCursorConfig,
  },
  claude: {
    message: 'Configuring Claude as client default...',
    action: findAndUpdateClaudeConfig,
  },
};

/**
 * Resolves scope patterns to actual scope values
 *
 * @param {string[] | undefined} scopePatterns - Scope patterns from command line
 * @returns {Promise<string[]>} - The selected scopes
 */
async function resolveScopes(scopePatterns?: string[]): Promise<string[]> {
  // If no scopes provided, prompt user for selection
  if (!scopePatterns?.length) {
    return promptForScopeSelection();
  }

  const allAvailableScopes = getAllScopes();
  const matchedScopes = new Set<string>();
  const invalidScopes = new Set<string>();

  // Match patterns against available scopes
  for (const pattern of scopePatterns) {
    let foundMatch = false;
    const glob = new Glob(pattern);

    for (const scope of allAvailableScopes) {
      if (glob.matches(scope)) {
        matchedScopes.add(scope);
        foundMatch = true;
      }
    }

    // Track non-wildcard patterns that didn't match anything
    if (!glob.hasWildcards() && !foundMatch) {
      invalidScopes.add(pattern);
    }
  }

  // Handle invalid scopes
  if (invalidScopes.size > 0) {
    const errorMessage = `Error: The following scopes are not valid: ${Array.from(invalidScopes).join(', ')}`;
    logError(errorMessage);
    logError(chalk.yellow(`Valid scopes are: ${allAvailableScopes.join(', ')}`));
    process.exit(1);
  }

  // Handle matched scopes
  const matchedScopesArray = Array.from(matchedScopes);
  if (matchedScopesArray.length === 0) {
    log(chalk.yellow('No scopes matched the provided patterns, proceeding to scope selection.'));
    return promptForScopeSelection();
  }

  return promptForScopeSelection(matchedScopesArray);
}

/**
 * Configures the specified client with options
 *
 * @param {ClientName} clientName - Name of the client to configure
 * @param {InitOptions} options - Configuration options
 */
async function configureClient(clientName: ClientName, options: InitOptions): Promise<void> {
  const config = CLIENT_CONFIGS[clientName];
  log(config.message);

  const clientOptions: ClientOptions = {
    tools: options.tools,
  };

  await config.action(clientOptions);
}

/**
 * Initializes the Auth0 MCP server with the specified client, tools and scopes.
 *
 * This function orchestrates the complete initialization process by:
 * 1. Resolving and validating requested scopes
 * 2. Obtaining authorization through the device flow
 * 3. Configuring the selected client (Claude, Windsurf, or Cursor)
 *
 * @param {InitOptions} options - Configuration options including:
 *   - client: The target client to configure ('claude', 'windsurf', or 'cursor')
 *   - scopes: Optional scope patterns for authorization (will prompt if omitted)
 *   - tools: Tool patterns to enable (e.g., ['auth0_list_*'])
 *
 * @returns {Promise<void>} A promise that resolves when initialization is complete
 *
 * @throws {Error} If authorization fails or client configuration encounters an error
 *
 * @example
 * // Initialize with Claude client and all tools
 * await init({ client: 'claude', tools: ['*'] });
 *
 * @example
 * // Initialize with Windsurf client and specific tools
 * await init({
 *   client: 'windsurf',
 *   tools: ['auth0_list_*', 'auth0_get_*'],
 *   scopes: ['read:*']
 * });
 */
const init = async (options: InitOptions): Promise<void> => {
  log('Initializing Auth0 MCP server...');
  log(`Configuring server with selected tools: ${options.tools.join(', ')}`);

  // Handle scope resolution and authorization
  const selectedScopes = await resolveScopes(options.scopes);
  await requestAuthorization(selectedScopes);

  // Configure the requested client
  await configureClient(options.client, options);
};

export default init;
