#!/usr/bin/env node
import { Command } from 'commander';
import chalk from 'chalk';
import init from './commands/init.js';
import run from './commands/run.js';
import logout from './commands/logout.js';
import session from './commands/session.js';
import { logError } from './utils/logger.js';
import { createRequire } from 'module';

// For importing JSON files in ES modules
const require = createRequire(import.meta.url);
const packageJson = require('../package.json');

// Extract package coordinates
const packageName = packageJson.name;
const packageVersion = packageJson.version;

// Set process title
process.title = 'auth0-mcp-server';

// Global error handlers
['uncaughtException', 'unhandledRejection'].forEach((event) => {
  process.on(event, (error) => {
    logError(`${event}:`, error);
    process.exit(1);
  });
});

// Top-level CLI
const program = new Command()
  .name('auth0-mcp-server')
  .description('Auth0 MCP Server - Model Context Protocol server for Auth0 Management API')
  .version(packageVersion)
  .addHelpText(
    'before',
    `
${chalk.bold('Auth0 MCP Server')}

A Model Context Protocol (MCP) server implementation that integrates Auth0 Management API 
with Claude Desktop, enabling AI-assisted management of your Auth0 tenant.`
  )
  .addHelpText(
    'after',
    `
Examples:
  npx ${packageName} init
  npx ${packageName} init --client claude
  npx ${packageName} init --client windsurf
  npx ${packageName} init --client cursor
  npx ${packageName} run
  npx ${packageName} session
  npx ${packageName} logout
  
For more information, visit: https://github.com/auth0/auth0-mcp-server
`
  );

// Init command
program
  .command('init')
  .description('Initialize the server (authenticate and configure)')
  .option('--client <client>', 'Configure specific client (claude, windsurf, or cursor)', 'claude')
  .option('--scopes <scopes>', 'Comma-separated list of Auth0 API scopes', (text) =>
    text
      .split(',')
      .map((scope) => scope.trim())
      .filter(Boolean)
  )
  .action(init);

// Run command
program.command('run').description('Start the MCP server').action(run);

// Logout command
program
  .command('logout')
  .description('Remove all stored Auth0 tokens from the system keychain')
  .action(logout);

// Session command
program
  .command('session')
  .description('Display current authentication session information')
  .action(session);

// Parse arguments and handle potential errors
program.parseAsync().catch((error) => {
  logError('Command execution error:', error);
  process.exit(1);
});
