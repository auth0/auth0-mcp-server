#!/usr/bin/env node

/**
 * MCP Server Connection Test Script
 *
 * This script tests the connection to the Auth0 MCP server by simulating
 * the Claude client's JSON-RPC calls and analyzing the responses.
 */

import fs from 'fs';
import path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';
import readline from 'readline';
import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import os from 'os';

const execAsync = promisify(exec);
const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Configuration
const DEBUG = process.env.DEBUG || true;
const SERVER_PATH = path.join(__dirname, 'dist', 'index.js');
const WRAPPER_PATH = path.join(__dirname, 'dynamic-wrapper.sh');
const AUTH0_DOMAIN = process.env.AUTH0_DOMAIN || 'your-tenant.auth0.com';
const NODE_PATH = process.env.NODE || process.env.NODE_PATH || 'node';
const LOCAL_AUTH0_CLI_PATH = process.env.AUTH0_CLI_PATH || '';

// Utility functions
function log(...args) {
  if (DEBUG) {
    console.log(`[${new Date().toISOString()}]`, ...args);
  }
}

function formatJson(obj) {
  return JSON.stringify(obj, null, 2);
}

// Test functions
/**
 * Get Auth0 token using the CLI
 */
async function getToken() {
  log('Getting Auth0 token...');

  try {
    // Try local Auth0 CLI first
    if (fs.existsSync(LOCAL_AUTH0_CLI_PATH)) {
      try {
        // Make it executable
        fs.chmodSync(LOCAL_AUTH0_CLI_PATH, '755');

        // Get token with local CLI
        const { stdout } = await execAsync(`"${LOCAL_AUTH0_CLI_PATH}" api get-token`);
        const token = stdout.trim();

        if (token) {
          log(`Successfully retrieved token using local CLI (length: ${token.length})`);
          return token;
        }
      } catch (error) {
        log(`Failed to get token with local CLI: ${error.message}`);
        // Fall through to next method
      }
    }

    // Try global Auth0 CLI
    try {
      const { stdout } = await execAsync('auth0 api get-token');
      const token = stdout.trim();

      if (token) {
        log(`Successfully retrieved token using CLI (length: ${token.length})`);
        return token;
      }
    } catch (error) {
      log(`Failed to get token with global CLI: ${error.message}`);
      // Fall through to next method
    }

    // Try environment variables
    if (process.env.AUTH0_TOKEN) {
      log('Using token from environment variable');
      return process.env.AUTH0_TOKEN;
    }

    // Try to pull from Claude Desktop config
    try {
      const configPath = path.join(os.homedir(), '.claude-desktop', 'config.json');
      if (fs.existsSync(configPath)) {
        const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
        if (config && config.auth0 && config.auth0.token) {
          log('Using token from Claude Desktop config');
          return config.auth0.token;
        }
      }
    } catch (err) {
      log(`Error reading Claude Desktop config: ${err.message}`);
    }

    throw new Error('Failed to get Auth0 token through any method');
  } catch (err) {
    log(`Token retrieval error: ${err.message}`);
    throw err;
  }
}

async function testDirectApiConnection() {
  log('Testing direct connection to Auth0 API...');
  try {
    const token = await getToken();
    const curlCommand = `curl -s -H "Authorization: Bearer ${token}" "https://${AUTH0_DOMAIN}/api/v2/clients?per_page=1"`;
    const { stdout } = await execAsync(curlCommand);
    const response = JSON.parse(stdout);
    log(
      'API connection successful:',
      Array.isArray(response) ? `Retrieved ${response.length} client(s)` : 'Retrieved data'
    );
    return true;
  } catch (error) {
    log('Error testing API connection:', error.message);
    return false;
  }
}

// Simulate the JSON-RPC protocol for MCP
class MCP_JSONRPC_Client {
  constructor(serverProcess) {
    this.serverProcess = serverProcess;
    this.id = 1;
  }

  createRequest(method, params) {
    return {
      jsonrpc: '2.0',
      id: this.id++,
      method,
      params,
    };
  }

  parseResponse(responseText) {
    try {
      return JSON.parse(responseText);
    } catch (error) {
      log('Error parsing JSON-RPC response:', error.message);
      log('Raw response:', responseText);
      throw new Error('Invalid JSON-RPC response');
    }
  }
}

// MCP server test function
async function testMCPServerConnection(useLiveServer = false) {
  let serverProcess = null;
  let closeServerProcess = () => {};

  // Define a response handler variable to collect server output
  let responseHandler = null;

  try {
    log('Starting MCP server locally for testing...');

    // If we're using a live server, don't start a local one
    if (!useLiveServer) {
      // Make executable
      const WRAPPER_PATH = path.join(__dirname, 'dynamic-wrapper.sh');
      fs.chmodSync(WRAPPER_PATH, '755');
      log('Made wrapper executable: %s', WRAPPER_PATH);

      // Debug info
      log('Wrapper path: %s', WRAPPER_PATH);
      log('Server path: %s', SERVER_PATH);
      log('NODE_PATH: %s', process.env.NODE_PATH || 'node');
      log('AUTH0_DOMAIN: %s', process.env.AUTH0_DOMAIN || 'your-tenant.auth0.com');
      log('AUTH0_CLI_PATH: %s', process.env.AUTH0_CLI_PATH || '');

      // Create environment for the server process
      const env = {
        ...process.env,
        DEBUG: 'auth0-mcp:*',
        AUTH0_CLI_PATH: process.env.AUTH0_CLI_PATH || '',
        AUTH0_TOKEN_DYNAMIC: 'true',
      };

      // Start the server process
      serverProcess = spawn(WRAPPER_PATH, ['run'], { env });

      // Save function to close the server
      closeServerProcess = () => {
        if (serverProcess && !serverProcess.killed) {
          serverProcess.kill();
          log('Killed server process');
        }
      };

      // Log server output
      serverProcess.stdout.on('data', data => {
        const message = data.toString();
        log('[Server stdout]: %s', message.trim());

        // If someone is waiting for a response, call the handler
        if (responseHandler) {
          responseHandler(message);
        }
      });

      serverProcess.stderr.on('data', data => {
        log('[Server stderr]: %s', data.toString().trim());
      });

      serverProcess.on('error', error => {
        log('[Server error]: %s', error.message);
      });

      // Wait for server to start
      await new Promise(resolve => setTimeout(resolve, 200));
    }

    // Start the initialize request
    const initRequest = {
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: {
        client: {
          name: 'test-client',
          version: '1.0.0',
        },
        capabilities: {
          tools: {},
        },
      },
    };

    console.log('Sending initialize request...');
    console.log('Initialize Request:', JSON.stringify(initRequest, null, 2));

    // Send the initialize request
    const initResponse = await new Promise((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        reject(new Error('Server response timeout after 5 seconds'));
      }, 5000);

      // Set up response handler for this request
      responseHandler = data => {
        try {
          // Try to parse the response as JSON
          const json = JSON.parse(data);
          if (json.id === 1) {
            clearTimeout(timeoutId);
            resolve(json);
          }
        } catch (e) {
          // Ignore non-JSON output
        }
      };

      // Send the request
      if (serverProcess) {
        serverProcess.stdin.write(JSON.stringify(initRequest) + '\n');
      } else {
        reject(new Error('Server process not available'));
      }
    }).catch(error => {
      log('Error in initialize request: %s', error.message);
      throw error;
    });

    console.log('Initialize response:', JSON.stringify(initResponse));

    // Now send the listTools request
    console.log('Sending tools/list request...');

    // Create request for listTools
    const listToolsRequest = {
      jsonrpc: '2.0',
      id: 2,
      method: 'tools/list',
      params: {},
    };

    console.log('tools/list Request:', JSON.stringify(listToolsRequest, null, 2));

    // Send the request
    const listToolsResponse = await new Promise((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        reject(new Error('Server response timeout after 5 seconds'));
      }, 5000);

      // Set up response handler for this request
      responseHandler = data => {
        try {
          // Try to parse the response as JSON
          const json = JSON.parse(data);
          if (json.id === 2) {
            clearTimeout(timeoutId);
            resolve(json);
          }
        } catch (e) {
          // Ignore non-JSON output
        }
      };

      // Send the request
      if (serverProcess) {
        serverProcess.stdin.write(JSON.stringify(listToolsRequest) + '\n');
      } else {
        reject(new Error('Server process not available'));
      }
    }).catch(error => {
      log('Error in tools/list request: %s', error.message);
      throw error;
    });

    console.log('tools/list response:', JSON.stringify(listToolsResponse));

    // Parse the response
    console.log('Parsed tools/list response:', JSON.stringify(listToolsResponse, null, 2));

    // Check if we got an error
    if (listToolsResponse.error) {
      throw new Error(`Server error: ${listToolsResponse.error.message}`);
    }

    // Validate the response contains tools
    if (!listToolsResponse.result || !listToolsResponse.result.tools) {
      throw new Error('Invalid response: missing tools array');
    }

    // Test calling the list_applications tool
    try {
      console.log('\nTesting tool call: auth0_list_applications');

      // Create request for calling the tool
      const callToolRequest = {
        jsonrpc: '2.0',
        id: 3,
        method: 'tools/call',
        params: {
          name: 'auth0_list_applications',
          parameters: {
            per_page: 5,
            include_totals: true,
          },
        },
      };

      console.log('tools/call Request:', JSON.stringify(callToolRequest, null, 2));

      // Send the request
      const callToolResponse = await new Promise((resolve, reject) => {
        const timeoutId = setTimeout(() => {
          reject(new Error('Server response timeout after 10 seconds'));
        }, 10000);

        // Set up response handler for this request
        responseHandler = data => {
          try {
            // Try to parse the response as JSON
            const json = JSON.parse(data);
            if (json.id === 3) {
              clearTimeout(timeoutId);
              resolve(json);
            }
          } catch (e) {
            // Ignore non-JSON output
          }
        };

        // Send the request
        if (serverProcess) {
          serverProcess.stdin.write(JSON.stringify(callToolRequest) + '\n');
        } else {
          reject(new Error('Server process not available'));
        }
      }).catch(error => {
        log('Error in tools/call request: %s', error.message);
        throw error;
      });

      console.log('tools/call response:', JSON.stringify(callToolResponse, null, 2));

      // Check if the tool call was successful
      if (callToolResponse.error) {
        console.log(`Successful tool call.`);
      }
    } catch (error) {
      console.error('Error in tool call:', error.message);
      throw error;
    }
  } catch (error) {
    console.error('Error in MCP server connection test:', error.message);
    throw error;
  } finally {
    closeServerProcess();
  }
}

// Run the test
testMCPServerConnection(true)
  .then(() => {
    console.log('Test completed successfully');
  })
  .catch(error => {
    console.error('Test failed:', error.message);
  });
