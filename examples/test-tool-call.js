#!/usr/bin/env node

import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs';
import os from 'os';
import { exit } from 'process';
import { fileURLToPath } from 'url';
import { getValidAccessToken } from '../dist/device-auth-flow.js';

// Get current directory
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Configuration
const AUTH0_DOMAIN = process.env.AUTH0_DOMAIN || 'your-tenant.auth0.com';
const SERVER_PATH = path.join(__dirname, '../dist/index.js');
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
      responseHandler = response => {
        if (response.id === expectedId) {
          clearTimeout(timeoutId);
          resolve(response);
          return true; // Indicate this response was handled
        }
        return false; // Not our response
      };

      // Send the request to the server
      log('Sending request:', request);
      serverProcess.stdin.write(JSON.stringify(request) + '\n');
    });
  }

  try {
    // Start the server process
    log('Starting MCP server process...');
    serverProcess = spawn('node', [SERVER_PATH, 'serve', '--stdio'], {
      stdio: ['pipe', 'pipe', 'pipe'],
      env: {
        ...process.env,
        NODE_ENV: 'development',
      },
    });

    // Set up stdout handling
    let buffer = '';
    serverProcess.stdout.on('data', data => {
      const chunk = data.toString();
      buffer += chunk;

      // Process complete JSON objects in the buffer
      let newlineIndex;
      while ((newlineIndex = buffer.indexOf('\n')) !== -1) {
        const line = buffer.substring(0, newlineIndex);
        buffer = buffer.substring(newlineIndex + 1);

        if (line.trim()) {
          try {
            const response = JSON.parse(line);
            log('Received response:', response);

            // Call response handler if set
            if (responseHandler && responseHandler(response)) {
              responseHandler = null;
            }
          } catch (err) {
            console.error('Error parsing JSON response:', err);
            console.error('Line:', line);
          }
        }
      }
    });

    // Handle stderr
    serverProcess.stderr.on('data', data => {
      console.error('Server error:', data.toString());
    });

    // Initialize the server
    console.log('Initializing server...');
    const initRequest = { jsonrpc: '2.0', id: 1, method: 'initialize', params: {} };
    const initResponse = await sendRequest(initRequest, 1, 10000);
    console.log('Server initialized successfully');

    // List available tools
    console.log('\nListing available tools...');
    const toolsRequest = { jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} };
    const toolsResponse = await sendRequest(toolsRequest, 2);

    if (toolsResponse.result && toolsResponse.result.tools) {
      console.log(`\nFound ${toolsResponse.result.tools.length} tools:`);

      // Display tools in a organized way
      const toolsByCategory = {};
      toolsResponse.result.tools.forEach(tool => {
        const name = tool.name;
        const category = name.split('_')[0]; // Extract category from name (e.g., auth0_list_applications -> auth0)

        if (!toolsByCategory[category]) {
          toolsByCategory[category] = [];
        }

        toolsByCategory[category].push(tool);
      });

      // Print tools by category
      Object.keys(toolsByCategory).forEach(category => {
        console.log(`\n${category.toUpperCase()} Tools:`);
        toolsByCategory[category].forEach(tool => {
          console.log(`- ${tool.name}: ${tool.description}`);
        });
      });

      // Get a token for API access
      console.log('\nRetrieving access token...');
      const token = await getValidAccessToken();

      if (!token) {
        console.error('Failed to get a valid token. Please run "node dist/index.js init" first.');
        exit(1);
      }

      console.log('Token retrieved successfully');

      // Now test calling an actual tool
      const testToolName = 'auth0_list_applications'; // You can change this to test other tools
      console.log(`\nTesting tool call: ${testToolName}`);

      const toolCallRequest = {
        jsonrpc: '2.0',
        id: 3,
        method: 'tools/call',
        params: {
          tool: testToolName,
          parameters: {},
        },
      };

      const toolCallResponse = await sendRequest(toolCallRequest, 3, 15000);

      if (toolCallResponse.error) {
        console.error('Tool call failed:', toolCallResponse.error);
      } else {
        console.log('Tool call successful:');
        console.log(formatJSON(toolCallResponse.result));
      }
    } else {
      console.error('Failed to list tools:', toolsResponse.error || 'No tools found');
    }
  } catch (err) {
    console.error('Error:', err);
  } finally {
    // Clean up
    if (serverProcess) {
      console.log('\nShutting down server...');
      serverProcess.kill();
    }
  }
}

// Run the main function
callAuth0Tool().catch(err => {
  console.error('Unhandled error:', err);
  exit(1);
});
