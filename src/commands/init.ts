import { clients } from '../clients/index.js';
import type { ClientType } from '../clients/types.js';
import { log, logError } from '../utils/logger.js';
import { requestAuthorization } from '../auth/device-auth-flow.js';
import { requestClientCredentialsAuthorization } from '../auth/client-credentials-flow.js';
import { promptForScopeSelection } from '../utils/terminal.js';
import { getAllScopes } from '../utils/scopes.js';
import { Glob } from '../utils/glob.js';
import chalk from 'chalk';
import trackEvent from '../utils/analytics.js';
import type { ClientOptions } from '../utils/types.js';

/**
 * Command options for the init command
 */
export interface InitOptions {
  client: ClientType;
  scopes?: string[];
  tools: string[];
  readOnly?: boolean;
  auth0Domain?: string;
  auth0ClientId?: string;
  auth0ClientSecret?: string;
}

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
 * @param {ClientType} clientType - Type of the client to configure
 * @param {InitOptions} options - Configuration options
 */
async function configureClient(clientType: ClientType, options: InitOptions): Promise<void> {
  const manager = clients[clientType];

  if (!manager) {
    logError(`Invalid client type specified: ${clientType}`);
    logError(`Available clients are: ${Object.keys(clients).join(', ')}`);
    process.exit(1);
  }

  log(`Configuring ${manager.displayName} as client...`);

  const clientOptions: ClientOptions = {
    tools: options.tools,
    readOnly: options.readOnly,
  };

  await manager.configure(clientOptions);
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
 *   - client: The target client type to configure ('claude', 'windsurf', or 'cursor')
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
  if (options.readOnly) {
    log('Running in read-only mode - only read operations will be available');
  }

  trackEvent.trackInit(options.client);

  // Check if client credentials parameters are provided for Private Cloud authentication
  const { auth0Domain, auth0ClientId, auth0ClientSecret } = options;
  const hasClientCredentials = Boolean(auth0Domain && auth0ClientId && auth0ClientSecret);

  // Check if client credentials are partially provided (which is invalid)
  if (
    (auth0Domain && (!auth0ClientId || !auth0ClientSecret)) ||
    (auth0ClientId && (!auth0Domain || !auth0ClientSecret)) ||
    (auth0ClientSecret && (!auth0Domain || !auth0ClientId))
  ) {
    logError(
      'Error: When using client credentials authentication, all three parameters are required:'
    );
    logError(
      '--auth0-domain <auth0domain> --auth0-client-id <auth0-client-id> --auth0-client-secret <auth0-client-secret>'
    );
    process.exit(1);
    return;
  }

  if (hasClientCredentials) {
    // Client credentials flow for Private Cloud
    log('Using client credentials flow for authentication');

    if (!auth0Domain || !auth0ClientId || !auth0ClientSecret) {
      logError(
        'Error: When using client credentials authentication, all three parameters are required:'
      );
      logError(
        '--auth0-domain <auth0domain> --auth0-client-id <auth0-client-id> --auth0-client-secret <auth0-client-secret>'
      );
      process.exit(1);
      return;
    }

    await requestClientCredentialsAuthorization({
      auth0Domain: auth0Domain,
      auth0ClientId: auth0ClientId,
      auth0ClientSecret: auth0ClientSecret,
    });
  } else {
    // Device authorization flow for public cloud
    log('Using device authorization flow for authentication');

    // Handle scope resolution
    const selectedScopes = await resolveScopes(options.scopes);

    await requestAuthorization(selectedScopes);
  }

  // Configure the requested client
  await configureClient(options.client, options);
};

export default init;
