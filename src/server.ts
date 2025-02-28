import debug from 'debug';

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';

import { Auth0Config, loadConfig, validateConfig } from './config.js';
import { HANDLERS, TOOLS } from './tools.js';

// Set up debug logger
const log = debug('auth0-mcp:server');

// Make sure debug output goes to stderr
debug.log = (...args) => {
  const msg = args.join(' ');
  process.stderr.write(msg + '\n');
  return true;
};

// Enable additional debug for stdio transport
process.env.DEBUG = (process.env.DEBUG || '') + ',auth0-mcp:*,mcp:transport:*';

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
      log('Please set AUTH0_TOKEN and AUTH0_DOMAIN environment variables');
      log('Or login using auth0-cli (`auth0 login`) and ensure your token is not expired');
      throw new Error('Invalid Auth0 configuration');
    }

    log(`Successfully loaded configuration for tenant: ${config.tenantName}`);
    log(`Using domain: ${config.domain}`);

    // Create server instance
    const server = new Server({ name: 'auth0', version: '1.0.0' }, { capabilities: { tools: {} } });

    // Handle list tools request
    server.setRequestHandler(ListToolsRequestSchema, async () => {
      log('Received list tools request');
      return { tools: TOOLS };
    });

    // Handle tool calls
    server.setRequestHandler(CallToolRequestSchema, async request => {
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

        // Execute handler
        log(`Executing handler for tool: ${toolName}`);
        const result = await HANDLERS[toolName](requestWithToken, { domain: config.domain });
        log(`Handler execution completed for: ${toolName}`);

        return {
          toolResult: result.toolResult,
        };
      } catch (error) {
        log(`Error handling tool call: ${error instanceof Error ? error.message : String(error)}`);
        return {
          toolResult: {
            content: [
              {
                type: 'text',
                text: `Error: ${error instanceof Error ? error.message : String(error)}`,
              },
            ],
            isError: true,
          },
        };
      }
    });

    // Connect to transport
    log('Creating stdio transport...');
    const transport = new StdioServerTransport();

    // Additional transport diagnostics
    log('Checking stdio streams:');
    log(`- process.stdin.isTTY: ${process.stdin.isTTY}`);
    log(`- process.stdout.isTTY: ${process.stdout.isTTY}`);
    log(`- process.stderr.isTTY: ${process.stderr.isTTY}`);

    // Connection with timeout
    log('Connecting server to transport...');
    try {
      await Promise.race([
        server.connect(transport),
        new Promise((_, reject) => setTimeout(() => reject(new Error('Connection timeout')), 5000)),
      ]);
      log('Server connected and running');
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
