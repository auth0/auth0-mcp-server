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
import { StreamableHttpServerTransport } from './utils/http-transport.js';
import { Authorization } from './utils/authorization.js';
import type { RequestHandlerExtra } from './utils/types.js';

type ServerOptions = RunOptions;

// Server implementation
export async function startServer(options: ServerOptions) {
  try {
    log('Initializing Auth0 MCP server...');

    // Log node version
    log(`Node.js version: ${process.version}`);
    log(`Process ID: ${process.pid}`);
    log(`Platform: ${process.platform} (${process.arch})`);

    // Load configuration
    let config = await loadConfig();

    if (!validateConfig(config)) {
      log('Failed to load valid Auth0 configuration');
      throw new Error('Invalid Auth0 configuration');
    }

    log(`Successfully loaded configuration for tenant: ${maskTenantName(config.tenantName)}`);

    // Get available tools based on options if provided
    const availableTools = getAvailableTools(TOOLS, options?.tools, options?.readOnly);

    // Initialize authorization
    const auth = new Authorization({
      type: 'bearer',
      token: config.token,
    });

    // Create server instance with streaming capabilities
    const server = new Server(
      { name: 'auth0', version: packageVersion },
      {
        capabilities: {
          tools: {},
          streaming: true,
          logging: {},
        },
      }
    );

    // Handle list tools request
    server.setRequestHandler(
      ListToolsRequestSchema,
      async (request, extra: RequestHandlerExtra) => {
        log('Received list tools request');

        // Sanitize tools by removing _meta fields
        // See: https://github.com/modelcontextprotocol/modelcontextprotocol/issues/264
        const sanitizedTools = availableTools.map(({ _meta, ...rest }) => rest);
        const response = { tools: sanitizedTools };

        // Handle streaming response if available
        if (extra?.streaming) {
          extra.streaming.write(response);
          extra.streaming.end();
        }

        // Always return the response
        return response;
      }
    );

    // Handle tool calls
    server.setRequestHandler(CallToolRequestSchema, async (request, extra: RequestHandlerExtra) => {
      const toolName = request.params.name;
      log(`Received tool call: ${toolName}`);

      try {
        if (!HANDLERS[toolName]) {
          const errorResponse = {
            content: [{ type: 'text', text: `Error: Unknown tool: ${toolName}` }],
            isError: true,
          };

          if (extra?.streaming) {
            extra.streaming.write(errorResponse);
            extra.streaming.end();
          }

          return errorResponse;
        }

        // Find tool definition to get required scopes
        const toolDefinition = TOOLS.find((tool) => tool.name === toolName);
        const requiredScopes = toolDefinition?._meta?.requiredScopes || [];

        // Verify authorization if tool requires scopes
        // The headers might be in different places depending on the transport
        const headers = (request as any).headers || {};
        const authHeader = headers.authorization;
        const isAuthorized = await auth.isAuthorized(requiredScopes, authHeader);
        if (requiredScopes.length > 0 && !isAuthorized) {
          const errorResponse = {
            content: [
              { type: 'text', text: 'Unauthorized: Missing required scopes for this tool' },
            ],
            isError: true,
          };

          if (extra?.streaming) {
            extra.streaming.write(errorResponse);
            extra.streaming.end();
          }

          return errorResponse;
        }

        // Check if config is still valid, reload if needed
        if (!validateConfig(config)) {
          log('Config is invalid, attempting to reload');
          config = await loadConfig();

          if (!validateConfig(config)) {
            const errorResponse = {
              content: [
                {
                  type: 'text',
                  text: 'Auth0 configuration is invalid or missing. Please check auth0-cli login status.',
                },
              ],
              isError: true,
            };

            if (extra?.streaming) {
              extra.streaming.write(errorResponse);
              extra.streaming.end();
            }

            return errorResponse;
          }

          log('Successfully reloaded configuration');
        }

        // Add auth token to request
        const requestWithToken = {
          token: config.token,
          parameters: request.params.arguments || {},
          authHeader: authHeader,
        };

        if (!config.domain) {
          const errorResponse = {
            content: [
              { type: 'text', text: 'Error: AUTH0_DOMAIN environment variable is not set' },
            ],
            isError: true,
          };

          if (extra?.streaming) {
            extra.streaming.write(errorResponse);
            extra.streaming.end();
          }

          return errorResponse;
        }

        const domain = formatDomain(config.domain);

        // Execute handler
        log(`Executing handler for tool: ${toolName}`);

        // Standard non-streaming mode - but support streaming if available
        const result = await HANDLERS[toolName](requestWithToken, { domain });
        log(`Handler execution completed for: ${toolName}`);

        // If we have streaming capabilities, stream the result
        if (extra?.streaming) {
          extra.streaming.write({
            content: result.content,
            isError: result.isError || false,
          });
          extra.streaming.end();
        }

        // Return the standard result
        return {
          content: result.content,
          isError: result.isError || false,
        };
      } catch (error) {
        log(`Error handling tool call: ${error instanceof Error ? error.message : String(error)}`);

        const errorResponse = {
          content: [
            {
              type: 'text',
              text: `Error: ${error instanceof Error ? error.message : String(error)}`,
            },
          ],
          isError: true,
        };

        // Handle streaming response
        if (extra?.streaming) {
          extra.streaming.write(errorResponse);
          extra.streaming.end();
        }

        return errorResponse;
      }
    });

    // Select transport based on options
    let transport;
    if (options?.useHttpTransport) {
      // Use HTTP transport with streamable support
      log('Creating HTTP streamable transport...');
      transport = new StreamableHttpServerTransport({
        port: options.httpOptions?.port || 3000,
        authToken: config.token,
      });

      // Start the HTTP server
      await transport.start();
    } else {
      // Use standard stdio transport
      log('Creating stdio transport...');
      transport = new StdioServerTransport();
    }

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
      const transportType = options?.useHttpTransport ? 'HTTP' : 'stdio';
      const logMsg = `Auth0 MCP Server version ${packageVersion} running on ${transportType} with ${enabledToolsCount}/${totalToolsCount} tools available`;

      logInfo(logMsg);
      log(logMsg);
      server.sendLoggingMessage({ level: 'info', data: logMsg });

      return server;
    } catch (connectError) {
      log(
        `Transport connection error: ${connectError instanceof Error ? connectError.message : String(connectError)}`
      );
      if (connectError instanceof Error && connectError.message === 'Connection timeout') {
        log('Connection to transport timed out. This might indicate an issue with the transport.');
      }
      throw connectError;
    }
  } catch (error) {
    log('Error starting server:', error);
    throw error;
  }
}
