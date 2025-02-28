#!/usr/bin/env node

import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs';
import os from 'os';
import { exit } from 'process';
import { fileURLToPath } from 'url';

// Get current directory
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Configuration
const AUTH0_DOMAIN = process.env.AUTH0_DOMAIN || 'your-tenant.auth0.com';
const SERVER_PATH = process.env.SERVER_PATH || path.join(__dirname, 'dist/index.js');
const WRAPPER_PATH = process.env.WRAPPER_PATH || path.join(__dirname, 'dynamic-wrapper.sh');
const DEBUG = process.env.DEBUG === 'true';

// Utility functions
function log(...args) {
  if (DEBUG) {
    console.log(`[${new Date().toISOString()}]`, ...args);
  }
}

function formatJSON(obj) {
  return JSON.stringify(obj, null, 2);
}

// Main function
async function callAuth0Tool() {
  console.log(`\n====== Auth0 MCP Server Tool Test (${new Date().toISOString()}) ======\n`);
  console.log('Environment:');
  console.log(`AUTH0_DOMAIN: ${AUTH0_DOMAIN}`);
  console.log(`SERVER_PATH: ${SERVER_PATH}`);
  console.log(`WRAPPER_PATH: ${WRAPPER_PATH}`);
  console.log(`DEBUG: ${DEBUG}`);

  let serverProcess = null;
  let responseHandler = null;

  // Helper function to send a request and wait for response
  async function sendRequest(request, expectedId, timeout = 5000) {
    return new Promise((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        reject(new Error(`Server response timeout after ${timeout}ms`));
      }, timeout);

      // Set up response handler for this request
      responseHandler = data => {
        try {
          // Try to parse the response as JSON
          const json = JSON.parse(data);
          if (json.id === expectedId) {
            clearTimeout(timeoutId);
            resolve(json);
          }
        } catch (e) {
          // Ignore non-JSON output
          log('Failed to parse server output as JSON:', data);
        }
      };

      // Send the request
      if (serverProcess) {
        serverProcess.stdin.write(JSON.stringify(request) + '\n');
      } else {
        reject(new Error('Server process not available'));
      }
    });
  }

  try {
    // Start the server process
    console.log('\n1. Starting local MCP server...');

    if (!fs.existsSync(SERVER_PATH)) {
      throw new Error(`Server path not found: ${SERVER_PATH}`);
    }

    if (!fs.existsSync(WRAPPER_PATH)) {
      throw new Error(`Wrapper script not found: ${WRAPPER_PATH}`);
    }

    // Use bash to run the wrapper script
    serverProcess = spawn('/bin/bash', [WRAPPER_PATH, 'node', SERVER_PATH, 'run', AUTH0_DOMAIN], {
      env: {
        ...process.env,
        DEBUG: 'auth0-mcp:*',
      },
    });

    log('Server process started with PID:', serverProcess.pid);

    // Set up event handlers for the server process
    serverProcess.stdout.on('data', data => {
      const message = data.toString().trim();
      log('[Server stdout]:', message);

      // If someone is waiting for a response, call the handler
      if (responseHandler) {
        responseHandler(message);
      }
    });

    serverProcess.stderr.on('data', data => {
      const message = data.toString().trim();
      log('[Server stderr]:', message);
    });

    serverProcess.on('error', error => {
      log('[Server error]:', error.message);
    });

    // Wait for server to start
    console.log('Waiting for server to initialize...');
    await new Promise(resolve => setTimeout(resolve, 1000));

    // Step 1: Initialize request
    console.log('\n2. Sending initialize request...');
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

    console.log('Initialize Request:', formatJSON(initRequest));

    const initResponse = await sendRequest(initRequest, 1, 5000);
    console.log('Initialize Response:', formatJSON(initResponse));

    // Step 2: List tools request
    console.log('\n3. Sending tools/list request...');
    const listToolsRequest = {
      jsonrpc: '2.0',
      id: 2,
      method: 'tools/list',
      params: {},
    };

    console.log('tools/list Request:', formatJSON(listToolsRequest));

    const listToolsResponse = await sendRequest(listToolsRequest, 2, 5000);
    console.log('tools/list Response:', formatJSON(listToolsResponse));

    if (listToolsResponse.error) {
      throw new Error(`Server error: ${listToolsResponse.error.message}`);
    }

    if (!listToolsResponse.result || !listToolsResponse.result.tools) {
      throw new Error('Invalid response: missing tools array');
    }

    console.log(`Found ${listToolsResponse.result.tools.length} tools:`);
    listToolsResponse.result.tools.forEach(tool => {
      console.log(`- ${tool.name}: ${tool.description}`);
    });

    // Step 3: Call tool request
    console.log('\n4. Testing tool call: auth0_list_applications');
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

    console.log('tools/call Request:', formatJSON(callToolRequest));

    const callToolResponse = await sendRequest(callToolRequest, 3, 10000);
    console.log('tools/call Response:', formatJSON(callToolResponse));

    if (callToolResponse.error) {
      console.log(`Tool call error: ${callToolResponse.error.message}`);
      console.log(`Tool call failed: ${formatJSON(callToolResponse.error)}`);
      return false;
    } else if (callToolResponse.result && callToolResponse.result.toolResult) {
      console.log('Tool call successful!');

      if (callToolResponse.result.toolResult.isError) {
        const errorContent = callToolResponse.result.toolResult.content[0];
        console.log(`Tool execution error: ${errorContent.text}`);
        return false;
      } else {
        console.log('Tool execution successful!');
        console.log('Result:', formatJSON(callToolResponse.result.toolResult));
        return true;
      }
    }

    return false;
  } catch (error) {
    console.error('Error:', error.message);
    return false;
  } finally {
    // Clean up the server process
    if (serverProcess) {
      console.log('\nShutting down server process...');
      serverProcess.kill();
    }
  }
}

// Run the test
callAuth0Tool()
  .then(success => {
    console.log(`\nTest completed with ${success ? 'SUCCESS' : 'FAILURE'}`);
    process.exit(success ? 0 : 1);
  })
  .catch(error => {
    console.error('Unhandled error:', error);
    process.exit(1);
  });
