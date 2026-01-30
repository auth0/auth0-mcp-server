#!/usr/bin/env node
import { Command } from 'commander';
import chalk from 'chalk';
import init from './commands/init.js';
import run from './commands/run.js';
import logout from './commands/logout.js';
import session from './commands/session.js';
import { logError } from './utils/logger.js';
import { TOOLS } from './tools/index.js';
import { validatePatterns } from './utils/tools.js';
import { packageName, packageVersion } from './utils/package.js';

// Set process title
process.title = packageName;

// Global error handlers
['uncaughtException', 'unhandledRejection'].forEach((event) => {
  process.on(event, (error) => {
    logError(`${event}:`, error);
    process.exit(1);
  });
});

/**
 * Parses and validates comma-separated tool patterns from command line input.
 * This function processes a comma-delimited string of tool patterns,
 * normalizes them by trimming whitespace, and validates each pattern
 * against the available tools. If the input is empty, it returns a
 * wildcard pattern ['*'] that matches all tools.
 *
 * @param {string} value - Raw command line input containing comma-separated patterns
 * @returns {string[]} Array of validated tool pattern strings
 * @throws {Error} If any pattern is invalid or doesn't match available tools
 */
function parseToolPatterns(value: string): string[] {
  if (!value) return ['*'];

  const patterns = value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);

  // Validate the patterns against available tools
  validatePatterns(patterns, TOOLS);

  return patterns;
}

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
  npx ${packageName} init --tools 'auth0_*' --client claude
  npx ${packageName} init --read-only --client claude
  npx ${packageName} init --tools 'auth0_*_applications' --client windsurf
  npx ${packageName} init --tools 'auth0_list_*,auth0_get_*' --client cursor
  npx ${packageName} init --auth0-domain <auth0-domain> --auth0-client-id <auth0-client-id> --auth0-client-secret <auth0-client-secret>
  npx ${packageName} run
  npx ${packageName} run --read-only
  npx ${packageName} session
  npx ${packageName} logout
  
  For more information, visit: https://github.com/auth0/auth0-mcp-server`
  );

// Init command
program
  .command('init')
  .description('Initialize the server (authenticate and configure)')
  .option(
    '--client <client>',
    'Configure specific client (claude, windsurf, cursor, vscode or gemini)',
    'claude'
  )
  .option(
    '--auth0-domain <auth0 domain>',
    'Auth0 domain (required for Private Cloud authentication)'
  )
  .option(
    '--auth0-client-id <auth0 ClientId>',
    'Client ID (required for Private Cloud authentication)'
  )
  .option(
    '--auth0-client-secret <auth0 Client Secret>',
    'Client secret (required for Private Cloud authentication)'
  )
  .option('--scopes <scopes>', 'Comma-separated list of Auth0 API scopes', (text) =>
    text
      .split(',')
      .map((scope) => scope.trim())
      .filter(Boolean)
  )
  .option(
    '--tools <tools>',
    'Comma-separated list of tools or glob patterns to enable (defaults to "*" if not provided)',
    parseToolPatterns,
    ['*']
  )
  .option('--read-only', 'Only expose read-only tools (list and get operations)', false)
  .option(
    '--interaction',
    'Prompt the user for any interaction, and open the browser to authenticate automatically',
    true
  )
  .option(
    '--no-interaction',
    "Don't prompt the user for any interaction, and open the browser to authenticate automatically"
  )
  .action(init);

// Run command
program
  .command('run')
  .description('Start the MCP server')
  .option(
    '--tools <tools>',
    'Comma-separated list of tools or glob patterns to enable (defaults to "*" if not provided)',
    parseToolPatterns,
    ['*']
  )
  .option('--read-only', 'Only expose read-only tools (list and get operations)', false)
  .action(run);

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
