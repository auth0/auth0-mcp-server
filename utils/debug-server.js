#!/usr/bin/env node

/**
 * Debug Auth0 MCP Server
 *
 * A minimal script to test if the Auth0 MCP server can properly
 * startup and handle an initialization request.
 */

import { spawn } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

// Configuration
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SERVER_PATH = path.join(__dirname, '..', 'dist', 'index.js');
const WRAPPER_PATH = path.join(__dirname, 'dynamic-wrapper.sh');

// Set debug mode
process.env.AUTH0_MCP_DEBUG = 'true';

// Helper for logging with timestamp
function log(message) {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] ${message}`);
}

async function testServerStartup() {
  log('=== Auth0 MCP Server Debug Test ===');
  log(`Server path: ${SERVER_PATH}`);

  // Verify the server file exists
  if (!fs.existsSync(SERVER_PATH)) {
    log(`ERROR: Server file not found at ${SERVER_PATH}`);
    log('Try running: npm run build');
    return false;
  }

  log('Starting server process...');

  // Start the server process
  const serverProcess = spawn('node', [SERVER_PATH, 'run'], {
    env: {
      ...process.env,
      DEBUG: 'auth0-mcp:*',
    },
    stdio: ['pipe', 'pipe', 'pipe'],
  });

  log(`Server started with PID: ${serverProcess.pid}`);

  // Log all server output
  serverProcess.stdout.on('data', data => {
    console.log(`[SERVER STDOUT] ${data.toString().trim()}`);
  });

  serverProcess.stderr.on('data', data => {
    console.log(`[SERVER STDERR] ${data.toString().trim()}`);
  });

  // Handle server exit
  serverProcess.on('exit', (code, signal) => {
    log(`Server process exited with code ${code}, signal: ${signal}`);
  });

  // Wait for server to initialize
  log('Waiting for server to initialize (5 seconds)...');
  await new Promise(resolve => setTimeout(resolve, 5000));

  // Send a simple initialization request
  log('Sending initialization request...');
  const initRequest = {
    jsonrpc: '2.0',
    id: 1,
    method: 'initialize',
    params: {
      protocolVersion: '0.1',
      clientInfo: {
        name: 'debug-client',
        version: '1.0.0',
      },
      capabilities: {
        tools: {},
      },
    },
  };

  const requestJSON = JSON.stringify(initRequest) + '\n';
  serverProcess.stdin.write(requestJSON);
  log(`Sent request: ${requestJSON.trim()}`);

  // Wait for response
  log('Waiting for response (10 seconds)...');
  await new Promise(resolve => setTimeout(resolve, 10000));

  // Clean up
  log('Test complete, shutting down server...');
  serverProcess.kill();

  return true;
}

// Run the test
testServerStartup()
  .then(() => {
    process.exit(0);
  })
  .catch(error => {
    console.error(`Unhandled error: ${error.message}`);
    process.exit(1);
  });
