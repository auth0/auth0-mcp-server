#!/usr/bin/env node

import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

// Get the directory of the current module
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Configuration
const serverPath = resolve(__dirname, '../dist/index.js');
const nodePath = process.execPath;

console.log(`Using Node: ${nodePath}`);
console.log(`Server path: ${serverPath}`);

// Environment variables - replace these with your values for testing
const env = {
  ...process.env,
  AUTH0_DOMAIN: process.env.AUTH0_DOMAIN || 'your-tenant.auth0.com',
  AUTH0_TOKEN: process.env.AUTH0_TOKEN || 'your-token-here',
  DEBUG: 'auth0-mcp:*',
};

// Start the MCP server process
console.log('Starting MCP server...');
const server = spawn(nodePath, [serverPath, 'run'], {
  env,
  stdio: ['pipe', 'pipe', 'pipe'],
});

// Handle process events
server.on('error', error => {
  console.error('Failed to start MCP server:', error);
  process.exit(1);
});

// Handle stdout data (from MCP server)
server.stdout.on('data', data => {
  try {
    const message = JSON.parse(data.toString().trim());
    console.log('← Server sent:', JSON.stringify(message, null, 2));

    // If we get an initialized notification, send a list_tools request
    if (message.method === 'notifications/initialized') {
      console.log('Server initialized, sending list_tools request');
      sendListTools();
    }
  } catch (error) {
    console.log('← Server output (raw):', data.toString());
  }
});

// Handle stderr data (from MCP server)
server.stderr.on('data', data => {
  console.log('← Server log:', data.toString());
});

// Prepare a message to send to the server
function sendMessage(message) {
  console.log('→ Sending to server:', JSON.stringify(message, null, 2));
  server.stdin.write(JSON.stringify(message) + '\n');
}

// Send a list_tools request
function sendListTools() {
  sendMessage({
    jsonrpc: '2.0',
    id: 1,
    method: 'list_tools',
  });

  // After listing tools, send a tool call
  setTimeout(() => {
    sendCallTool();
  }, 1000);
}

// Send a call_tool request
function sendCallTool() {
  sendMessage({
    jsonrpc: '2.0',
    id: 2,
    method: 'call_tool',
    params: {
      name: 'auth0_list_applications',
      parameters: {
        per_page: 5,
      },
    },
  });
}

// Listen for server exit
server.on('exit', (code, signal) => {
  console.log(`MCP server exited with code ${code} and signal ${signal}`);
});

// Clean up on exit
process.on('SIGINT', () => {
  console.log('Shutting down...');
  server.kill();
  process.exit(0);
});

console.log('Test running, waiting for server to initialize...');

// Auto-shutdown after 20 seconds
setTimeout(() => {
  console.log('Test complete, shutting down...');
  server.kill();
  process.exit(0);
}, 20000);
