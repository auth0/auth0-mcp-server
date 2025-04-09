import { findAndUpdateClaudeConfig } from './clients/claude.js';
import { findAndUpdateWindsurfConfig } from './clients/windsurf.js';
import { findAndUpdateCursorConfig } from './clients/cursor.js';
import { log, logError } from './utils/logger.js';
import { requestAuthorization } from './auth/device-auth-flow.js';
import { promptForScopeSelection } from './utils/cli-utility.js';
import { getAllScopes } from './utils/scopes.js';
import chalk from 'chalk';

/**
 * Resolves scopes based on command line arguments
 *
 * @param {string[]} args - Command line arguments
 * @returns {Promise<string[]>} - The selected scopes
 */
async function resolveScopes(args: string[]): Promise<string[]> {
  const scopesFlagIndex = args.findIndex((arg) => arg === '--scopes');

  // If no --scopes flag or no value provided, prompt for selection
  if (
    scopesFlagIndex === -1 ||
    scopesFlagIndex + 1 >= args.length ||
    args[scopesFlagIndex + 1].startsWith('--')
  ) {
    return promptForScopeSelection();
  }

  // Parse scope patterns
  const scopesArg = args[scopesFlagIndex + 1];
  const scopePatterns = scopesArg
    .split(',')
    .map((pattern) => pattern.trim())
    .filter(Boolean);

  if (scopePatterns.length === 0) {
    return promptForScopeSelection();
  }

  // Match patterns against available scopes
  const allAvailableScopes = getAllScopes();
  const matchedScopes = new Set<string>();
  const invalidScopes = new Set<string>();

  for (const pattern of scopePatterns) {
    let foundMatch = false;
    const regexPattern = new RegExp(`^${pattern.replace(/\*/g, '.*')}$`);

    for (const scope of allAvailableScopes) {
      if (regexPattern.test(scope)) {
        matchedScopes.add(scope);
        foundMatch = true;
      }
    }

    // Track invalid scopes (non-wildcard patterns with no matches)
    if (!pattern.includes('*') && !foundMatch) {
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
 * Client configuration options supported by the application
 */
type ClientName = 'claude' | 'windsurf' | 'cursor';

/**
 * Resolves the client to use based on command line arguments
 *
 * @param {string[]} args - Command line arguments
 * @returns {ClientName} - The selected client name
 */
function resolveClient(args: string[]): ClientName {
  const clientFlagIndex = args.findIndex((arg) => arg === '--client');

  if (clientFlagIndex !== -1 && clientFlagIndex < args.length - 1) {
    const clientValue = args[clientFlagIndex + 1].toLowerCase();

    if (clientValue === 'windsurf' || clientValue === 'cursor' || clientValue === 'claude') {
      return clientValue;
    }
  }

  return 'claude'; // Default client
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
 * @param {string[]} args - Command line arguments passed to the application
 * @returns {Promise<void>}
 */
const init = async (args: string[]): Promise<void> => {
  try {
    log('Initializing Auth0 MCP server...');

    // Handle scope resolution
    const selectedScopes = await resolveScopes(args);
    await requestAuthorization(selectedScopes);

    // Handle client configuration
    const clientName = resolveClient(args);
    await configureClient(clientName);
  } catch (error) {
    log('Error initializing server:', error);
  }
};

export default init;
