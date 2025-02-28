#!/usr/bin/env node

/**
 * Simple Auth0 MCP Server
 *
 * A simplified implementation of the Auth0 MCP server
 * with direct token handling and improved debugging.
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { exec, execSync } from 'child_process';
import { promisify } from 'util';
import fs from 'fs';
import path from 'path';
import os from 'os';

const execAsync = promisify(exec);

// Set up logging
const DEBUG = true;
function log(message) {
  if (DEBUG) {
    const timestamp = new Date().toISOString();
    console.error(`[${timestamp}] ${message}`);
  }
}

// Define the tools
const TOOLS = [
  {
    name: 'auth0_list_applications',
    description: 'List all applications in your Auth0 tenant',
    inputSchema: {
      type: 'object',
      properties: {
        page: {
          type: 'number',
          description: 'Page number (1-based)',
        },
        per_page: {
          type: 'number',
          description: 'Number of results per page',
        },
      },
    },
  },
];

// Tool handlers
const HANDLERS = {
  auth0_list_applications: async (request, config) => {
    log(`Executing handler for auth0_list_applications`);

    try {
      const token = request.token;
      const domain = config.domain;

      if (!token) {
        throw new Error('No Auth0 token available');
      }

      if (!domain) {
        throw new Error('No Auth0 domain specified');
      }

      const page = request.parameters.page || 0;
      const per_page = request.parameters.per_page || 50;

      log(`Fetching applications from Auth0 (page ${page}, per_page ${per_page})`);

      // Construct API URL
      const apiUrl = `https://${domain}/api/v2/clients?page=${page}&per_page=${per_page}`;

      // Make the request
      const response = await fetch(apiUrl, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Auth0 API error (${response.status}): ${errorText}`);
      }

      const data = await response.json();

      // Format the response
      const applications = data.map(app => ({
        client_id: app.client_id,
        name: app.name,
        description: app.description || '',
        app_type: app.app_type || '',
        is_first_party: app.is_first_party || false,
      }));

      log(`Found ${applications.length} applications`);

      return {
        toolResult: {
          content: [
            {
              type: 'text',
              text: `Found ${applications.length} applications in your Auth0 tenant:`,
            },
            {
              type: 'json',
              json: applications,
            },
          ],
          isError: false,
        },
      };
    } catch (error) {
      log(`Error in auth0_list_applications: ${error.message}`);
      return {
        toolResult: {
          content: [
            {
              type: 'text',
              text: `Error: ${error.message}`,
            },
          ],
          isError: true,
        },
      };
    }
  },
};

// Get Auth0 token with timeout
async function getTokenWithTimeout(timeoutMs = 5000) {
  log('Getting Auth0 token...');

  // First try environment variable
  if (process.env.AUTH0_TOKEN) {
    log('Using token from environment variable');
    return process.env.AUTH0_TOKEN;
  }

  // Try to get token from local Auth0 CLI
  try {
    log('Trying to get token using local Auth0 CLI...');
    const localCliPath = '/Users/bharath/dev/mcp/auth0-cli/auth0';

    if (fs.existsSync(localCliPath)) {
      try {
        fs.chmodSync(localCliPath, '755');
        const { stdout, stderr } = await execWithTimeout(
          `${localCliPath} api get-token`,
          timeoutMs
        );
        if (stdout.trim()) {
          log('Successfully got token from local Auth0 CLI');
          return stdout.trim();
        }
      } catch (error) {
        log(`Failed to get token from local Auth0 CLI: ${error.message}`);
      }
    }

    // Try to get token from standard Auth0 CLI
    log('Trying to get token from standard Auth0 CLI...');
    const { stdout, stderr } = await execWithTimeout('auth0 api get-token', timeoutMs);
    if (stdout.trim()) {
      log('Successfully got token from standard Auth0 CLI');
      return stdout.trim();
    }

    throw new Error('Failed to get Auth0 token');
  } catch (error) {
    log(`Error getting Auth0 token: ${error.message}`);
    throw error;
  }
}

// Execute command with timeout
function execWithTimeout(command, timeoutMs) {
  return new Promise((resolve, reject) => {
    const child = exec(command);
    let stdout = '';
    let stderr = '';

    const timeout = setTimeout(() => {
      child.kill();
      reject(new Error(`Command timed out after ${timeoutMs}ms: ${command}`));
    }, timeoutMs);

    child.stdout.on('data', data => {
      stdout += data;
    });

    child.stderr.on('data', data => {
      stderr += data;
    });

    child.on('close', code => {
      clearTimeout(timeout);
      if (code === 0) {
        resolve({ stdout, stderr });
      } else {
        reject(new Error(`Command failed with code ${code}: ${stderr}`));
      }
    });

    child.on('error', error => {
      clearTimeout(timeout);
      reject(error);
    });
  });
}

// Get Auth0 domain
function getAuth0Domain() {
  // Try from environment variable first
  if (process.env.AUTH0_DOMAIN) {
    return process.env.AUTH0_DOMAIN;
  }

  // Try to get from Auth0 CLI
  try {
    const cliPath = process.env.AUTH0_CLI_PATH || 'auth0';
    const tenantInfo = execSync(`${cliPath} tenants list --json`, { encoding: 'utf8' });
    const tenants = JSON.parse(tenantInfo);

    if (tenants && tenants.length > 0) {
      const activeTenant = tenants.find(t => t.active) || tenants[0];
      log(`Found tenant from CLI: ${activeTenant.name}`);
      return activeTenant.name;
    }
  } catch (error) {
    log(`Unable to get domain from CLI: ${error.message}`);
  }

  // Default fallback
  return 'your-tenant.auth0.com';
}

// Start the server
async function startServer() {
  try {
    log('Starting simple Auth0 MCP server...');

    // Get Auth0 credentials
    const domain = getAuth0Domain();
    log(`Using Auth0 domain: ${domain}`);

    let token;
    try {
      token = await getTokenWithTimeout(10000);
      log('Successfully obtained Auth0 token');
    } catch (error) {
      log(`Failed to get Auth0 token: ${error.message}`);
      log('Continuing without token, will attempt to get token for each request');
    }

    // Create server
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

        // Get token for this request if not already available
        let currentToken = token;
        if (!currentToken) {
          try {
            currentToken = await getTokenWithTimeout(10000);
            log('Got token for current request');
          } catch (error) {
            throw new Error(`Failed to get Auth0 token: ${error.message}`);
          }
        }

        // Add auth token to request
        const requestWithToken = {
          token: currentToken,
          parameters: request.params.parameters || {},
        };

        // Execute handler
        log(`Executing handler for tool: ${toolName}`);
        const result = await HANDLERS[toolName](requestWithToken, { domain });
        log(`Handler execution completed for: ${toolName}`);

        return {
          toolResult: result.toolResult,
        };
      } catch (error) {
        log(`Error handling tool call: ${error.message}`);
        return {
          toolResult: {
            content: [
              {
                type: 'text',
                text: `Error: ${error.message}`,
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

    log('Connecting server to transport...');
    await server.connect(transport);

    log('Server connected and running. Waiting for requests...');
    return server;
  } catch (error) {
    log(`Error starting server: ${error.message}`);
    log(error.stack);
    throw error;
  }
}

// Start the server
startServer().catch(error => {
  console.error(`Fatal error: ${error.message}`);
  process.exit(1);
});
