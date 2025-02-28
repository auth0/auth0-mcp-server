#!/usr/bin/env node

/**
 * Simple MCP Server Connection Test
 *
 * A lightweight test script that focuses only on establishing
 * a connection with the Auth0 MCP server and performing basic commands.
 */

import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import path from 'path';
import os from 'os';

// Set up basic configuration
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const AUTH0_DOMAIN = process.env.AUTH0_DOMAIN || 'your-tenant.auth0.com';
const NODE_PATH = process.env.NODE_PATH || 'node';
const DEBUG = process.env.DEBUG === 'true';

// Paths
const SERVER_PATH = path.join(__dirname, 'dist', 'index.js');

// Utility for logging
function log(...args) {
  console.log(...args);
}

// Format JSON nicely
function formatJSON(obj) {
  return JSON.stringify(obj, null, 2);
}

// Read a line from a stream with timeout
function readLineFromStream(stream, timeoutMs = 5000) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error(`Stream read timeout after ${timeoutMs}ms`));
    }, timeoutMs);

    const onData = data => {
      clearTimeout(timeout);
      stream.removeListener('data', onData);
      resolve(data.toString());
    };

    stream.on('data', onData);
  });
}

// Simple JSON-RPC client for MCP
class MCPClient {
  constructor(serverProcess) {
    this.serverProcess = serverProcess;
    this.nextId = 1;
    this.pendingRequests = new Map();
  }

  createRequest(method, params) {
    const id = this.nextId++;
    return {
      jsonrpc: '2.0',
      id,
      method,
      params,
    };
  }

  async sendRequest(request, timeoutMs = 5000) {
    return new Promise((resolve, reject) => {
      const requestId = request.id;
      const timeout = setTimeout(() => {
        this.pendingRequests.delete(requestId);
        reject(new Error(`Server response timeout after ${timeoutMs}ms`));
      }, timeoutMs);

      const handleResponse = data => {
        try {
          const responseText = data.toString();
          const responses = responseText.split('\n').filter(Boolean);

          for (const line of responses) {
            try {
              const response = JSON.parse(line);
              if (response.id === requestId) {
                clearTimeout(timeout);
                this.serverProcess.stdout.removeListener('data', handleResponse);
                this.pendingRequests.delete(requestId);
                resolve(response);
                return;
              }
            } catch (err) {
              // Not JSON or not our response, continue
            }
          }
        } catch (err) {
          // Continue listening
        }
      };

      this.serverProcess.stdout.on('data', handleResponse);
      this.pendingRequests.set(requestId, { resolve, reject, timeout });

      const requestStr = JSON.stringify(request) + '\n';
      log(`Sending request: ${requestStr.trim()}`);
      this.serverProcess.stdin.write(requestStr);
    });
  }
}

// Main test function
async function testAuthMCPServer() {
  log('====== Simple Auth0 MCP Server Test ======\n');
  log('Configuration:');
  log(`AUTH0_DOMAIN: ${AUTH0_DOMAIN}`);
  log(`SERVER_PATH: ${SERVER_PATH}`);
  log(`DEBUG: ${DEBUG ? 'enabled' : 'disabled'}`);
  log('');

  let serverProcess = null;
  let client = null;

  try {
    // 1. Start the server process
    log('1. Starting Auth0 MCP server...');

    serverProcess = spawn(NODE_PATH, [SERVER_PATH, 'run', AUTH0_DOMAIN], {
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    log(`Server started with PID: ${serverProcess.pid}`);

    // Wait for server to initialize
    log('Waiting for server to initialize...');

    // Set up data listeners
    serverProcess.stdout.on('data', data => {
      log(`[Server stdout]: ${data.toString().trim()}`);
    });

    serverProcess.stderr.on('data', data => {
      log(`[Server stderr]: ${data.toString().trim()}`);
    });

    // Give more time for server to initialize
    await new Promise(resolve => setTimeout(resolve, 5000));

    // 2. Create client
    client = new MCPClient(serverProcess);

    // 3. Send initialize request
    log('\n2. Sending initialize request...');
    const initializeRequest = client.createRequest('initialize', {
      protocolVersion: '0.1',
      clientInfo: {
        name: 'simple-test-client',
        version: '1.0.0',
      },
      capabilities: {
        tools: {},
      },
    });

    log(`Initialize Request: ${formatJSON(initializeRequest)}`);
    const initializeResponse = await client.sendRequest(initializeRequest);
    log(`Initialize Response: ${formatJSON(initializeResponse)}`);

    if (initializeResponse.error) {
      throw new Error(`Initialization failed: ${initializeResponse.error.message}`);
    }

    // 4. Send tools/list request
    log('\n3. Listing available tools...');
    const listToolsRequest = client.createRequest('tools/list', {});
    log(`List Tools Request: ${formatJSON(listToolsRequest)}`);
    const listToolsResponse = await client.sendRequest(listToolsRequest);
    log(`List Tools Response: ${formatJSON(listToolsResponse)}`);

    if (listToolsResponse.error) {
      throw new Error(`List tools failed: ${listToolsResponse.error.message}`);
    }

    // 5. Send tools/call request for auth0_list_applications
    log('\n4. Calling auth0_list_applications tool...');
    const callToolRequest = client.createRequest('tools/call', {
      name: 'auth0_list_applications',
      parameters: {},
    });

    log(`Call Tool Request: ${formatJSON(callToolRequest)}`);
    const callToolResponse = await client.sendRequest(callToolRequest, 15000); // Longer timeout for API call
    log(`Call Tool Response: ${formatJSON(callToolResponse)}`);

    if (callToolResponse.error) {
      throw new Error(`Tool call failed: ${callToolResponse.error.message}`);
    }

    log('\n===== Test completed successfully! =====');
    return true;
  } catch (error) {
    log(`\nERROR: ${error.message}`);
    return false;
  } finally {
    // Clean up
    log('\nShutting down server process...');
    if (serverProcess) {
      serverProcess.kill();
    }
  }
}

// Run the test
testAuthMCPServer()
  .then(success => {
    process.exit(success ? 0 : 1);
  })
  .catch(error => {
    console.error(`Unhandled error: ${error.message}`);
    process.exit(1);
  });
