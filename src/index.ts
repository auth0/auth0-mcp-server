#!/usr/bin/env node
import init from './init.js';
import run from './run.js';
import help from './help.js';
import { logError } from './utils/logger.js';

// Enable all debug logs for this package by default
//process.env.DEBUG = (process.env.DEBUG || '') + ',auth0-mcp:*';

// Set process title
process.title = 'auth0-mcp-server';

// Handle process events
process.on('uncaughtException', (error) => {
  logError('Uncaught exception:', error);
  process.exit(1);
});

process.on('unhandledRejection', (error) => {
  logError('Unhandled rejection:', error);
  process.exit(1);
});

// Parse command line arguments
const command = process.argv[2];

// Wrap the main execution in an async function to handle top-level await properly
async function main() {
  try {
    if (command === 'run') {
      // Main function to start server
      await run();
    } else if (command === 'init') {
      const args = process.argv.slice(3);
      await init(args);
    } else if (command === 'help') {
      await help();
    } else {
      logError(`Usage: auth0-mcp <command>\nValid commands: 'init', 'run', or 'help'`);
      logError(`Run 'auth0-mcp help' for more information.`);
      process.exit(1);
    }
  } catch (error) {
    logError('Error executing command:', error);
    process.exit(1);
  }
}

// Execute the main function
main().catch((error) => {
  logError('Unhandled error in main execution:', error);
  process.exit(1);
});

// Export for use in bin script
export { run };
