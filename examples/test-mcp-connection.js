#!/usr/bin/env node

/**
 * MCP Server Connection Test Script (Updated)
 *
 * This script tests the connection to the Auth0 MCP server by simulating
 * the Claude client's JSON-RPC calls and analyzing the responses.
 * Updated to use direct token retrieval instead of Auth0 CLI.
 */

import fs from 'fs';
import path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';
import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import os from 'os';
import { getValidAccessToken } from '../dist/device-auth-flow.js';

const execAsync = promisify(exec);
const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Configuration
const DEBUG = process.env.DEBUG || true;
const SERVER_PATH = path.join(__dirname, '../dist/index.js');
const AUTH0_DOMAIN = process.env.AUTH0_DOMAIN || 'your-tenant.auth0.com';
const NODE_PATH = process.env.NODE || process.env.NODE_PATH || 'node';

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
 * Get Auth0 token using the built-in token retrieval mechanism
 */
async function getToken() {
  log('Getting Auth0 token from built-in mechanism...');

  try {
    const token = await getValidAccessToken();
    if (token) {
      log(`Successfully retrieved token (length: ${token.length})`);
      return token;
    }

    throw new Error('Failed to get token from built-in mechanism');
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

// MCP server test function
async function testMCPServerConnection(useLiveServer = false) {
  let serverProcess = null;
  let closeServerProcess = () => {};

  // Define a response handler variable to collect server output
  let responseHandler = null;
  let buffer = '';

  try {
    log('Starting MCP server locally for testing...');

    // If we're using a live server, don't start a local one
    if (!useLiveServer) {
      // Debug info
      log('Server path: %s', SERVER_PATH);
      log('NODE_PATH: %s', NODE_PATH);
      log('AUTH0_DOMAIN: %s', AUTH0_DOMAIN);

      // Start the server process
      serverProcess = spawn(NODE_PATH, [SERVER_PATH, 'run', AUTH0_DOMAIN], {
        env: {
          ...process.env,
          DEBUG: 'auth0-mcp:*',
        },
        stdio: ['pipe', 'pipe', 'pipe'], // Ensure all stdio is set up for communication
      });

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
        buffer += message;

        // Process buffer for complete JSON responses
        let newlineIndex;
        while ((newlineIndex = buffer.indexOf('\n')) !== -1) {
          const line = buffer.substring(0, newlineIndex);
          buffer = buffer.substring(newlineIndex + 1);

          log('[Server stdout]: %s', line.trim());

          // If line is JSON and someone is waiting for a response, call the handler
          if (line.trim() && responseHandler) {
            try {
              const json = JSON.parse(line.trim());
              responseHandler(json);
            } catch (e) {
              // Not valid JSON, ignore
            }
          }
        }
      });

      serverProcess.stderr.on('data', data => {
        log('[Server stderr]: %s', data.toString().trim());
      });

      serverProcess.on('error', error => {
        log('[Server error]: %s', error.message);
      });

      // Wait for server to start
      await new Promise(resolve => setTimeout(resolve, 1000));
    }

    // Start the initialize request
    const initRequest = {
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: {
        protocolVersion: '0.1',
        clientInfo: {
          name: 'test-client',
          version: '1.0.0',
        },
        capabilities: {
          tools: {},
        },
      },
    };

    console.log('Sending initialize request...');
    console.log('Initialize Request:', formatJson(initRequest));

    // Send the initialize request
    const initResponse = await new Promise((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        reject(new Error('Server response timeout after 5 seconds'));
      }, 5000);

      // Set up response handler for this request
      responseHandler = json => {
        if (json.id === 1) {
          clearTimeout(timeoutId);
          resolve(json);
          // Clear the handler to avoid handling this response multiple times
          responseHandler = null;
          return true;
        }
        return false;
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

    console.log('Initialize response:', formatJson(initResponse));

    // Now send the listTools request
    console.log('Sending tools/list request...');

    // Create request for listTools
    const listToolsRequest = {
      jsonrpc: '2.0',
      id: 2,
      method: 'tools/list',
      params: {},
    };

    console.log('tools/list Request:', formatJson(listToolsRequest));

    // Send the request
    const listToolsResponse = await new Promise((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        reject(new Error('Server response timeout after 5 seconds'));
      }, 5000);

      // Set up response handler for this request
      responseHandler = json => {
        if (json.id === 2) {
          clearTimeout(timeoutId);
          resolve(json);
          // Clear the handler to avoid handling this response multiple times
          responseHandler = null;
          return true;
        }
        return false;
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

    console.log('tools/list response:', formatJson(listToolsResponse));

    // Check if we got an error
    if (listToolsResponse.error) {
      throw new Error(`Server error: ${listToolsResponse.error.message}`);
    }

    // Validate the response contains tools
    if (!listToolsResponse.result || !listToolsResponse.result.tools) {
      throw new Error('Invalid response: missing tools array');
    }

    // Display tool categories
    const toolsByCategory = {};
    listToolsResponse.result.tools.forEach(tool => {
      const name = tool.name;
      const category = name.split('_')[0]; // Extract category from name

      if (!toolsByCategory[category]) {
        toolsByCategory[category] = [];
      }

      toolsByCategory[category].push(tool);
    });

    console.log('\nAvailable tool categories:');
    Object.keys(toolsByCategory).forEach(category => {
      console.log(`- ${category} (${toolsByCategory[category].length} tools)`);
    });

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

      console.log('tools/call Request:', formatJson(callToolRequest));

      // Send the request
      const callToolResponse = await new Promise((resolve, reject) => {
        const timeoutId = setTimeout(() => {
          reject(new Error('Server response timeout after 10 seconds'));
        }, 10000);

        // Set up response handler for this request
        responseHandler = json => {
          if (json.id === 3) {
            clearTimeout(timeoutId);
            resolve(json);
            // Clear the handler to avoid handling this response multiple times
            responseHandler = null;
            return true;
          }
          return false;
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

      console.log('tools/call response:', formatJson(callToolResponse));

      // Check if the tool call was successful
      if (callToolResponse.error) {
        console.log(`Tool call error: ${callToolResponse.error.message}`);
      } else {
        console.log('Tool call completed successfully');
      }
    } catch (error) {
      console.error('Error in tool call:', error.message);
      throw error;
    }

    console.log('\nTest completed successfully');
    return true;
  } catch (error) {
    console.error('Error in MCP server connection test:', error.message);
    return false;
  } finally {
    closeServerProcess();
  }
}

// Run the test
testMCPServerConnection(false)
  .then(success => {
    if (success) {
      console.log('✅ All tests passed!');
      process.exit(0);
    } else {
      console.error('❌ Tests failed');
      process.exit(1);
    }
  })
  .catch(error => {
    console.error('Test failed:', error.message);
    process.exit(1);
  });
