import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';

import { loadConfig, validateConfig } from './utils/config.js';
import { HANDLERS, TOOLS } from './tools/index.js';
import { log, logInfo } from './utils/logger.js';
import { formatDomain } from './utils/http-utility.js';
import { maskTenantName } from './utils/terminal.js';
import { getAvailableTools } from './utils/tools.js';
import type { RunOptions } from './commands/run.js';
import { packageVersion } from './utils/package.js';

type ServerOptions = RunOptions;

/**
 * Initializes and starts the Auth0 MCP server to provide AI assistants
 * with secure, controlled access to Auth0 Management API capabilities.
 *
 * This server acts as a secure bridge between AI models and Auth0 APIs,
 * enforcing proper authentication, authorization, and validation at every step.
 * The server validates credentials before any operations and continuously
 * monitors token validity during operation to prevent security issues.
 *
 * Security architecture:
 * - Initial user-friendly validation occurs in `run.ts` with detailed CLI feedback
 * - Startup validation here provides a secondary checkpoint
 * - Continuous validation during tool calls ensures credentials remain valid
 * - Token expiration checking prevents use of expired credentials
 *
 * This multi-layered approach balances security requirements with developer
 * experience by providing appropriate feedback at each stage.
 *
 * Key responsibilities include:
 * - Securing access to Auth0 Management API
 * - Validating user credentials and token expiration
 * - Automatically refreshing invalid configurations when possible
 * - Exposing selected tools based on user permissions and preferences
 * - Handling MCP protocol requests through configured transports
 *
 * @param {ServerOptions} [options] - Optional configuration for tool filtering and read-only mode
 * @returns {Promise<Server>} The initialized MCP server instance
 * @throws {Error} If configuration validation fails or server setup encounters errors
 */
export async function startServer(options?: ServerOptions) {
  try {
    log('Initializing Auth0 MCP server...');

    // Log node version
    log(`Node.js version: ${process.version}`);
    log(`Process ID: ${process.pid}`);
    log(`Platform: ${process.platform} (${process.arch})`);

    // Load configuration
    let config = await loadConfig();

    if (!config || !(await validateConfig(config))) {
      log('Failed to load valid Auth0 configuration');
      throw new Error('Invalid Auth0 configuration');
    }

    log(`Successfully loaded configuration for tenant: ${maskTenantName(config.tenantName)}`);

    // Get available tools based on options if provided
    const availableTools = getAvailableTools(TOOLS, options?.tools, options?.readOnly);

    // Create server instance
    const server = new Server(
      { name: 'auth0', version: packageVersion },
      { capabilities: { tools: {}, logging: {} } }
    );

    // Handle list tools request
    server.setRequestHandler(ListToolsRequestSchema, async () => {
      log('Received list tools request');

      // Sanitize tools by removing _meta fields
      // See: https://github.com/modelcontextprotocol/modelcontextprotocol/issues/264
      const sanitizedTools = availableTools.map(({ _meta, ...rest }) => rest);

      return { tools: sanitizedTools };
    });

    // Handle tool calls
    server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const toolName = request.params.name;
      log(`Received tool call: ${toolName}`);

      try {
        if (!HANDLERS[toolName]) {
          throw new Error(`Unknown tool: ${toolName}`);
        }

        // Check if config is still valid, reload if needed
        if (!config || !(await validateConfig(config))) {
          log('Config is invalid, attempting to reload');
          config = await loadConfig();

          if (!config || !(await validateConfig(config))) {
            throw new Error(
              'Auth0 configuration is invalid or missing. Please check auth0-cli login status.'
            );
          }

          log('Successfully reloaded configuration');
        }

        // Add auth token to request
        const requestWithToken = {
          token: config.token,
          parameters: request.params.arguments || {},
        };

        if (!config.domain) {
          throw new Error('Error: AUTH0_DOMAIN environment variable is not set');
        }

        const domain = formatDomain(config.domain);

        // Execute handler
        log(`Executing handler for tool: ${toolName}`);
        const result = await HANDLERS[toolName](requestWithToken, { domain: domain });
        log(`Handler execution completed for: ${toolName}`);

        return {
          content: result.content,
          isError: result.isError || false,
        };
      } catch (error) {
        log(`Error handling tool call: ${error instanceof Error ? error.message : String(error)}`);
        return {
          content: [
            {
              type: 'text',
              text: `Error: ${error instanceof Error ? error.message : String(error)}`,
            },
          ],
          isError: true,
        };
      }
    });

    // Connect to transport
    log('Creating stdio transport...');
    const transport = new StdioServerTransport();

    // Connection with timeout
    log('Connecting server to transport...');
    try {
      await Promise.race([
        server.connect(transport),
        new Promise((_, reject) => setTimeout(() => reject(new Error('Connection timeout')), 5000)),
      ]);

      // Log server start information
      const enabledToolsCount = availableTools.length;
      const totalToolsCount = TOOLS.length;
      const logMsg = `Auth0 MCP Server version ${packageVersion} running on stdio with ${enabledToolsCount}/${totalToolsCount} tools available`;
      logInfo(logMsg);
      log(logMsg);
      server.sendLoggingMessage({ level: 'info', data: logMsg });

      return server;
    } catch (connectError) {
      log(
        `Transport connection error: ${connectError instanceof Error ? connectError.message : String(connectError)}`
      );
      if (connectError instanceof Error && connectError.message === 'Connection timeout') {
        log(
          'Connection to transport timed out. This might indicate an issue with the stdio transport.'
        );
      }
      throw connectError;
    }
  } catch (error) {
    log('Error starting server:', error);
    throw error;
  }
}
