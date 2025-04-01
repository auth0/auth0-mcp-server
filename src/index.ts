#!/usr/bin/env node
import init from './init.js';
import run from './run.js';

// Enable all debug logs for this package by default
//process.env.DEBUG = (process.env.DEBUG || '') + ',auth0-mcp:*';

// Set process title
process.title = 'auth0-mcp-server';

// Handle process events
process.on('uncaughtException', (error) => {
  console.error('Uncaught exception:', error);
  process.exit(1);
});

process.on('unhandledRejection', (error) => {
  console.error('Unhandled rejection:', error);
  process.exit(1);
});

// Parse command line arguments
const command = process.argv[2];
if (command === 'run') {
  // Pass any additional arguments to the run function
  const args = process.argv.slice(3);

  // Main function to start server
  await run(args);
} else if (command === 'init') {
  const args = process.argv.slice(3);
  await init(args);
} else {
  console.error(`Usage: auth0-mcp run 'init' or 'run'.`);
  process.exit(1);
}

// Export for use in bin script
export { run };
