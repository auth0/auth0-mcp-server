import { findAndUpdateClaudeConfig } from '../clients/claude.js';
import { findAndUpdateWindsurfConfig } from '../clients/windsurf.js';
import { findAndUpdateCursorConfig } from '../clients/cursor.js';
import { log, logError } from '../utils/logger.js';
import { requestAuthorization } from '../auth/device-auth-flow.js';
import { promptForScopeSelection } from '../utils/cli-utility.js';
import { getAllScopes } from '../utils/scopes.js';
import { Glob } from '../utils/glob.js';
import chalk from 'chalk';

/**
 * Client configuration options supported by the application
 */
export type ClientName = 'claude' | 'windsurf' | 'cursor';

/**
 * Command options for the init command
 */
export interface InitOptions {
  client: ClientName;
  scopes?: string[];
}

/**
 * Resolves scopes based on command options
 *
 * @param {string[] | undefined} scopesOption - Scopes option from commander
 * @returns {Promise<string[]>} - The selected scopes
 */
async function resolveScopes(scopesOption?: string[]): Promise<string[]> {
  if (!scopesOption || scopesOption.length === 0) {
    return promptForScopeSelection();
  }

  // Match patterns against available scopes
  const allAvailableScopes = getAllScopes();
  const matchedScopes = new Set<string>();
  const invalidScopes = new Set<string>();

  for (const pattern of scopesOption) {
    let foundMatch = false;
    const glob = new Glob(pattern);

    for (const scope of allAvailableScopes) {
      if (glob.matches(scope)) {
        matchedScopes.add(scope);
        foundMatch = true;
      }
    }

    // Track invalid scopes (non-wildcard patterns with no matches)
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
 * Client configuration mapping
 */
interface ClientConfig {
  message: string;
  action: () => Promise<void>;
}

/**
 * Configures the specified client
 *
 * @param {ClientName} clientName - Name of the client to configure
 * @returns {Promise<void>}
 */
async function configureClient(clientName: ClientName): Promise<void> {
  const clientConfigs: Record<ClientName, ClientConfig> = {
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

  const config = clientConfigs[clientName];
  log(config.message);
  await config.action();
}

/**
 * Initializes the Auth0 MCP server by handling scope selection, authorization,
 * and client configuration.
 *
 * @param {InitOptions} options - Command options from commander
 * @returns {Promise<void>}
 */
const init = async (options: InitOptions): Promise<void> => {
  log('Initializing Auth0 MCP server...');

  // Handle scope resolution
  const selectedScopes = await resolveScopes(options.scopes);
  await requestAuthorization(selectedScopes);

  // Handle client configuration
  await configureClient(options.client);
};

export default init;
