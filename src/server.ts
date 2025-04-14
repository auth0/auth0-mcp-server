import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';

import { loadConfig, validateConfig } from './utils/config.js';
import { HANDLERS, TOOLS } from './tools/index.js';
import { log, logInfo } from './utils/logger.js';
import { formatDomain } from './utils/http-utility.js';
import { maskTenantName } from './utils/cli-utility.js';
import { zodToJsonSchema } from 'zod-to-json-schema';
import type { ZodSchema } from 'zod';
import type { ToolSchema } from './utils/types.js';

// Server implementation
export async function startServer() {
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

    // Create server instance
    const server = new Server({ name: 'auth0', version: '1.0.0' }, { capabilities: { tools: {} } });

    // Handle list tools request
    server.setRequestHandler(ListToolsRequestSchema, async () => {
      log('Received list tools request');

      // Sanitize tools by removing _meta fields
      // See: https://github.com/modelcontextprotocol/modelcontextprotocol/issues/264
      const filteredTools = TOOLS.map(({ _meta, ...tool }) => {
        // Convert Zod schema to JSON schema
        const toolSchema = zodToJsonSchema(tool.inputSchema as ZodSchema) as ToolSchema;
        return {
          name: tool.name,
          description: tool.description,
          inputSchema: toolSchema,
        };
      });

      return { tools: filteredTools };
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
        if (!validateConfig(config)) {
          log('Config is invalid, attempting to reload');
          config = await loadConfig();

          if (!validateConfig(config)) {
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

      const logMsg = `Server started and running successfully`;

      logInfo(logMsg);
      log(logMsg);

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
