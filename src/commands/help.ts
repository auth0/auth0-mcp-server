import chalk from 'chalk';
import { cliOutput } from '../utils/cli-utility.js';

/**
 * Display help information for the Auth0 MCP Server CLI
 */
const help = async (): Promise<void> => {
  cliOutput(`
${chalk.bold('Auth0 MCP Server')}

A Model Context Protocol (MCP) server implementation that integrates Auth0 Management API 
with Claude Desktop, enabling AI-assisted management of your Auth0 tenant.

${chalk.bold('USAGE:')}
  npx @auth0/auth0-mcp-server <command> [options]

${chalk.bold('COMMANDS:')}
  ${chalk.cyan('init')}    Initialize the server (authenticate and configure)
         ${chalk.gray('Options:')}
         ${chalk.gray('--client <client>')}  Configure specific client (claude, windsurf, or cursor)
                           
  ${chalk.cyan('run')}     Start the MCP server
  
  ${chalk.cyan('logout')}  Remove all stored Auth0 tokens from the system keychain
  
  ${chalk.cyan('session')} Display current authentication session information
  
  ${chalk.cyan('help')}    Display this help information

${chalk.bold('EXAMPLES:')}
  npx @auth0/auth0-mcp-server init
  npx @auth0/auth0-mcp-server init --client claude
  npx @auth0/auth0-mcp-server init --client windsurf
  npx @auth0/auth0-mcp-server init --client cursor
  npx @auth0/auth0-mcp-server run
  npx @auth0/auth0-mcp-server session
  npx @auth0/auth0-mcp-server logout
  
For more information, visit: https://github.com/auth0/auth0-mcp-server
`);
};

export default help;
