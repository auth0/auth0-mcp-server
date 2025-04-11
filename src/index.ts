#!/usr/bin/env node
import { Command } from 'commander';
import init from './commands/init.js';
import run from './commands/run.js';
import help from './commands/help.js';
import logout from './commands/logout.js';
import session from './commands/session.js';
import { logError } from './utils/logger.js';

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
  .name('auth0-mcp')
  .description('Auth0 MCP Server - Model Context Protocol server for Auth0 Management API')
  .version('0.1.0-beta.1');

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

// Help command
program.command('help').description('Display help information').action(help);

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
