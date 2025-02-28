#!/usr/bin/env node
import { spawn } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

// Handle ESM module __dirname equivalent
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Helper for colorized output
const colors = {
  red: text => `\x1b[31m${text}\x1b[0m`,
  green: text => `\x1b[32m${text}\x1b[0m`,
  yellow: text => `\x1b[33m${text}\x1b[0m`,
  blue: text => `\x1b[34m${text}\x1b[0m`,
  magenta: text => `\x1b[35m${text}\x1b[0m`,
  cyan: text => `\x1b[36m${text}\x1b[0m`,
};

// Set up logging
const log = (...args) => console.log('[TEST]', ...args);
const error = (...args) => console.error(colors.red('[ERROR]'), ...args);

async function runTest() {
  // Create test logs directory if it doesn't exist
  const logsDir = path.join(__dirname, 'logs');
  if (!fs.existsSync(logsDir)) {
    fs.mkdirSync(logsDir);
  }

  // Create log file streams
  const stdoutLog = fs.createWriteStream(path.join(logsDir, 'test-stdout.log'));
  const stderrLog = fs.createWriteStream(path.join(logsDir, 'test-stderr.log'));

  log(colors.yellow('Starting Auth0 MCP server test'));
  log(colors.cyan('This test will verify that the server can properly communicate over stdio'));

  // Path to the server script
  const serverPath = path.join(__dirname, 'dist', 'index.js');
  log(`Server path: ${serverPath}`);

  // Standard MCP test messages
  const testMessages = [
    JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize', params: {} }),
    JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} }),
  ];

  try {
    // Start the server process
    log('Spawning server process...');
    const serverProcess = spawn('node', [serverPath, 'run'], {
      stdio: ['pipe', 'pipe', 'pipe'],
      env: {
        ...process.env,
        DEBUG: 'auth0-mcp:*',
      },
    });

    // Set up logging for process output
    serverProcess.stdout.pipe(stdoutLog);
    serverProcess.stderr.pipe(stderrLog);

    let responseCount = 0;
    let errorOutput = '';

    // Handle process events
    serverProcess.on('error', err => {
      error(`Failed to start server process: ${err.message}`);
    });

    serverProcess.on('exit', (code, signal) => {
      if (code !== null) {
        log(colors.red(`Server process exited with code ${code}`));
      } else {
        log(colors.red(`Server process killed with signal ${signal}`));
      }
    });

    // Collect stderr output for debugging
    serverProcess.stderr.on('data', data => {
      const text = data.toString();
      errorOutput += text;

      // Print debug output to console
      const lines = text.trim().split('\n');
      for (const line of lines) {
        if (line.trim()) {
          console.error(colors.magenta('[SERVER LOG]'), line);
        }
      }
    });

    // Process stdout responses
    serverProcess.stdout.on('data', data => {
      const text = data.toString().trim();
      log(
        colors.green(
          `Received response: ${text.substring(0, 100)}${text.length > 100 ? '...' : ''}`
        )
      );
      responseCount++;

      try {
        const response = JSON.parse(text);
        if (response.id === 2 && response.result && response.result.tools) {
          log(
            colors.green(
              `✓ Successfully received tools list with ${response.result.tools.length} tools`
            )
          );
          log(colors.yellow('Test passed! The server is working correctly.'));

          // Clean up and exit after a successful test
          setTimeout(() => {
            serverProcess.kill();
            process.exit(0);
          }, 1000);
        }
      } catch (e) {
        error(`Failed to parse server response: ${e.message}`);
      }
    });

    // Send test messages with delay
    log('Sending test messages...');
    setTimeout(() => {
      for (const message of testMessages) {
        log(colors.blue(`Sending: ${message}`));
        serverProcess.stdin.write(message + '\n');
      }
    }, 2000);

    // Set a timeout to kill the process if we don't get responses
    setTimeout(() => {
      if (responseCount < testMessages.length) {
        error('Test timed out waiting for responses');
        error(`Last error output: ${errorOutput.substring(errorOutput.length - 500)}`);
        serverProcess.kill();
        process.exit(1);
      }
    }, 10000);
  } catch (err) {
    error(`Test failed: ${err.message}`);
    process.exit(1);
  }
}

runTest().catch(err => {
  error(`Unhandled error: ${err.message}`);
  process.exit(1);
});
