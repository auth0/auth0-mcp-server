#!/usr/bin/env node

/**
 * Update Claude Desktop Configuration
 *
 * This script updates the Claude Desktop configuration to use
 * our simplified Auth0 MCP server implementation.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import os from 'os';
import chalk from 'chalk';
import which from 'which';

// Set up paths
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const HOME_DIR = os.homedir();
const CLAUDE_CONFIG_PATH = path.join(
  HOME_DIR,
  'Library',
  'Application Support',
  'Claude',
  'claude_desktop_config.json'
);
const LOCAL_SERVER_PATH = path.join(__dirname, '..');
console.log('LOCAL_SERVER_PATH', LOCAL_SERVER_PATH);

// Main function
async function updateConfig() {
  console.log('=== Updating Claude Desktop Configuration ===');

  // Check if Local server exists
  if (!fs.existsSync(LOCAL_SERVER_PATH)) {
    console.error(`Error: Local server not found at ${LOCAL_SERVER_PATH}`);
  }

  const nodeLocalPath = await which('node', { nothrow: true });
  if (!nodeLocalPath) {
    console.error(`${chalk.red('x')} Node.js not found in PATH`);
    return false;
  }

  // Make server executable
  try {
    fs.chmodSync(LOCAL_SERVER_PATH, '755');
    console.log(`Made server executable: ${LOCAL_SERVER_PATH}`);
  } catch (error) {
    console.warn(`Warning: Could not change permissions: ${error.message}`);
  }

  // Check if Claude Desktop config exists
  if (!fs.existsSync(CLAUDE_CONFIG_PATH)) {
    console.error(`Error: Claude Desktop config not found at ${CLAUDE_CONFIG_PATH}`);
    console.log('Make sure Claude Desktop is installed and has been run at least once.');
    return false;
  }

  // Read the current config
  let config;
  try {
    const configData = fs.readFileSync(CLAUDE_CONFIG_PATH, 'utf8');
    config = JSON.parse(configData);
    console.log('Successfully read Claude Desktop configuration');
  } catch (error) {
    console.error(`Error reading Claude Desktop config: ${error.message}`);
    return false;
  }

  // Create backup of the original config
  try {
    const backupPath = `${CLAUDE_CONFIG_PATH}.backup.${Date.now()}`;
    fs.writeFileSync(backupPath, JSON.stringify(config, null, 2));
    console.log(`Created backup of original config at: ${chalk.gray.italic(backupPath)}`);
  } catch (error) {
    console.warn(`Warning: Could not create backup: ${error.message}`);
  }

  // Update the config for Auth0 MCP server
  if (!config.mcpServers) {
    config.mcpServers = {};
  }

  // Check if auth0 config already exists
  const existingConfig = config.mcpServers.auth0 ? 'updated' : 'created';

  //Update the configuration with enhanced capabilities

  config.mcpServers.auth0 = {
    command: nodeLocalPath.trim(),
    args: [LOCAL_SERVER_PATH, 'run'],
    capabilities: ['tools'],
    env: {
      DEBUG: 'auth0-mcp',
    },
  };

  try {
    fs.writeFileSync(CLAUDE_CONFIG_PATH, JSON.stringify(config, null, 2));
  } catch (error) {
    console.error(`Error writing Claude Desktop config: ${error.message}`);
    return false;
  }

  // Create a dialog box effect using ASCII characters and chalk
  const boxWidth = 70;
  const horizontalLine = '─'.repeat(boxWidth);

  // Helper function to create a line with content that handles overflow gracefully
  const createLine = (label, value) => {
    const prefix = label ? ` ${label}: ` : ' ';
    const prefixLength = prefix.length;
    const maxValueLength = boxWidth - prefixLength;

    let valueStr = String(value);
    if (valueStr.length > maxValueLength) {
      valueStr = valueStr.substring(0, maxValueLength - 3) + '...';
    }

    // Calculate padding manually instead of using padEnd to avoid issues with chalk styling
    const padding = ' '.repeat(boxWidth - prefixLength - valueStr.length);

    return (
      chalk.blue('│') +
      (label ? chalk.green(prefix) : prefix) +
      valueStr +
      padding +
      chalk.blue('│')
    );
  };

  console.log('\n' + chalk.blue('┌' + horizontalLine + '┐'));
  const title = ' Configuration Updated Successfully ';
  const padding = ' '.repeat(boxWidth - title.length);
  console.log(chalk.blue('│') + chalk.blue.bold(title) + padding + chalk.blue('│'));
  console.log(chalk.blue('├' + horizontalLine + '┤'));
  console.log(createLine('Command', config.mcpServers.auth0.command));
  console.log(createLine('Arguments', config.mcpServers.auth0.args.join(' ')));
  console.log(createLine('Capabilities', config.mcpServers.auth0.capabilities.join(', ')));
  console.log(createLine('Environment', 'DEBUG=' + config.mcpServers.auth0.env.DEBUG));
  console.log(chalk.blue('└' + horizontalLine + '┘') + '\n');

  console.log(`Successfully ${existingConfig} Auth0 MCP server configuration`);

  console.log(
    chalk.yellow('\nIMPORTANT: You need to restart Claude Desktop for changes to take effect.')
  );
  return true;
}

// Run the update
updateConfig()
  .then((success) => {
    process.exit(success ? 0 : 1);
  })
  .catch((error) => {
    console.error(`Error: ${error.message}`);
    process.exit(1);
  });
