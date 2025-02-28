#!/usr/bin/env node

/**
 * Test Simple Auth0 MCP Server
 *
 * A client script to test the simplified Auth0 MCP server implementation.
 */

import { spawn } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

// Configuration
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SERVER_SCRIPT = path.join(__dirname, 'simple-auth0-server.js');

// Logging with timestamp
function log(message) {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] ${message}`);
}

// Format JSON for better display
function formatJSON(obj) {
  return JSON.stringify(obj, null, 2);
}

// Simple JSONRPC client for MCP
class MCPClient {
  constructor(serverProcess) {
    this.serverProcess = serverProcess;
    this.nextId = 1;
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

  async sendRequest(request, timeoutMs = 10000) {
    return new Promise((resolve, reject) => {
      const requestId = request.id;
      const timeout = setTimeout(() => {
        reject(new Error(`Response timeout after ${timeoutMs}ms`));
      }, timeoutMs);

      // Store received data chunks
      let responseBuffer = '';

      const handleData = data => {
        const chunk = data.toString();
        responseBuffer += chunk;

        // Try to parse complete JSON objects from the buffer
        const lines = responseBuffer.split('\n');

        // Keep the last line which might be incomplete
        responseBuffer = lines.pop() || '';

        // Process complete lines
        for (const line of lines) {
          if (!line.trim()) continue;

          try {
            const response = JSON.parse(line);
            if (response.id === requestId) {
              clearTimeout(timeout);
              this.serverProcess.stdout.removeListener('data', handleData);
              resolve(response);
              return;
            }
          } catch (err) {
            // Not valid JSON or not our response, continue
          }
        }
      };

      this.serverProcess.stdout.on('data', handleData);

      // Send the request
      const requestJSON = JSON.stringify(request) + '\n';
      this.serverProcess.stdin.write(requestJSON);
      log(`Sent request: ${request.method} (ID: ${request.id})`);
    });
  }
}

// Main test function
async function runTest() {
  log('=== Testing Simple Auth0 MCP Server ===');
  log(`Server script: ${SERVER_SCRIPT}`);

  let serverProcess = null;

  try {
    // Start the server
    log('Starting Auth0 MCP server...');
    serverProcess = spawn('node', [SERVER_SCRIPT], {
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    log(`Server started with PID: ${serverProcess.pid}`);

    // Pipe server stderr to console
    serverProcess.stderr.on('data', data => {
      process.stderr.write(data);
    });

    // Wait for server to initialize
    log('Waiting for server to initialize (5s)...');
    await new Promise(resolve => setTimeout(resolve, 5000));

    // Create client
    const client = new MCPClient(serverProcess);

    // Test 1: Initialize
    log('\n=== Test 1: Initialize ===');
    const initRequest = client.createRequest('initialize', {
      protocolVersion: '0.1',
      clientInfo: {
        name: 'test-client',
        version: '1.0.0',
      },
      capabilities: {
        tools: {},
      },
    });

    log(`Request: ${formatJSON(initRequest)}`);
    const initResponse = await client.sendRequest(initRequest);
    log(`Response: ${formatJSON(initResponse)}`);

    if (initResponse.error) {
      throw new Error(`Initialization failed: ${initResponse.error.message}`);
    }

    // Test 2: List Tools
    log('\n=== Test 2: List Tools ===');
    const listRequest = client.createRequest('tools/list', {});
    log(`Request: ${formatJSON(listRequest)}`);
    const listResponse = await client.sendRequest(listRequest);
    log(`Response: ${formatJSON(listResponse)}`);

    if (listResponse.error) {
      throw new Error(`List tools failed: ${listResponse.error.message}`);
    }

    const tools = listResponse.result.tools;
    log(`Available tools: ${tools.map(t => t.name).join(', ')}`);

    // Test 3: Call Tool
    log('\n=== Test 3: Call Tool (auth0_list_applications) ===');
    const callRequest = client.createRequest('tools/call', {
      name: 'auth0_list_applications',
      parameters: {},
    });

    log(`Request: ${formatJSON(callRequest)}`);
    const callResponse = await client.sendRequest(callRequest, 15000);
    log(`Response: ${formatJSON(callResponse)}`);

    if (callResponse.error) {
      throw new Error(`Tool call failed: ${callResponse.error.message}`);
    }

    // Success
    log('\n=== All tests completed successfully! ===');
    return true;
  } catch (error) {
    log(`ERROR: ${error.message}`);
    return false;
  } finally {
    // Clean up
    if (serverProcess) {
      log('Terminating server process...');
      serverProcess.kill();
    }
  }
}

// Run the test
runTest()
  .then(success => {
    process.exit(success ? 0 : 1);
  })
  .catch(error => {
    console.error(`Unhandled error: ${error.message}`);
    process.exit(1);
  });
