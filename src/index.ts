#!/usr/bin/env node
import debug from 'debug';
import * as os from 'os';

import { startServer } from './server.js';
import { requestAuthorization } from './device-auth-flow.js';
import { findAndUpdatedClaudeConfig } from './claude-init-config.js';

// Set up debug logger that writes to stderr only
const log = debug('auth0-mcp:index');

// Make sure debug output goes to stderr
debug.log = (...args) => {
  const msg = args.join(' ');
  process.stderr.write(msg + '\n');
  return true;
};

// Enable all debug logs for this package by default
process.env.DEBUG = (process.env.DEBUG || '') + ',auth0-mcp:*';

// Set process title
process.title = 'auth0-mcp-server';

// Handle process events
process.on('uncaughtException', error => {
  console.error('Uncaught exception:', error);
  process.exit(1);
});

process.on('unhandledRejection', error => {
  console.error('Unhandled rejection:', error);
  process.exit(1);
});

// Network diagnostic helper
async function checkNetworkConnectivity() {
  try {
    log('Testing network connectivity...');

    // Try to connect to common domains
    const testDomains = [
      { url: 'https://auth0.com', name: 'Auth0 Website' },
      { url: 'https://google.com', name: 'Google' },
    ];

    const results = await Promise.allSettled(
      testDomains.map(async ({ url, name }) => {
        const startTime = Date.now();
        const response = await fetch(url, {
          method: 'HEAD',
          signal: AbortSignal.timeout(5000),
        });
        const elapsed = Date.now() - startTime;
        return { name, url, status: response.status, elapsed };
      })
    );

    results.forEach((result, index) => {
      const domain = testDomains[index];
      if (result.status === 'fulfilled') {
        log(`✓ Connected to ${domain.name} (${result.value.elapsed}ms)`);
      } else {
        log(`✕ Failed to connect to ${domain.name}: ${result.reason}`);
      }
    });

    return results.some(r => r.status === 'fulfilled');
  } catch (error) {
    log('Network diagnosis failed:', error);
    return false;
  }
}

// Main function to start server
async function run(args: string[]) {
  try {
    log(`Platform: ${process.platform} (${process.arch})`);
    log(`Node.js version: ${process.version}`);
    log(`Hostname: ${os.hostname()}`);

    if (!process.env.HOME) {
      process.env.HOME = os.homedir();
      log(`Set HOME environment variable to ${process.env.HOME}`);
    }

    const networkOk = await checkNetworkConnectivity();
    if (!networkOk) {
      log('Warning: Network connectivity issues detected. API calls might fail.');
    }

    await startServer();
    log('✅ Server started successfully');
  } catch (error) {
    console.error('Fatal error starting server:', error);
    process.exit(1);
  }
}

// Parse command line arguments
const command = process.argv[2];
if (command === 'run') {
  // Pass any additional arguments to the run function
  const args = process.argv.slice(3);
  run(args);
} else if (command === 'init') {
  await requestAuthorization();
  await findAndUpdatedClaudeConfig();
} else {
  console.error('Usage: auth0-mcp run [domain] [token]');
  process.exit(1);
}

// Export for use in bin script
export { startServer, run };
