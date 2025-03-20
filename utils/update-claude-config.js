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
const SIMPLE_SERVER_PATH = path.join(__dirname, '..');
console.log('SIMPLE_SERVER_PATH', SIMPLE_SERVER_PATH);
const NODE_PATH = process.env.NODE_PATH || 'node';

// Main function
async function updateConfig() {
  console.log('=== Updating Claude Desktop Configuration ===');

  // Check if simplified server exists
  if (!fs.existsSync(SIMPLE_SERVER_PATH)) {
    console.error(`Error: Simplified server not found at ${SIMPLE_SERVER_PATH}`);
    return false;
  }

  // Make server executable
  try {
    fs.chmodSync(SIMPLE_SERVER_PATH, '755');
    console.log(`Made server executable: ${SIMPLE_SERVER_PATH}`);
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
    console.log(`Created backup of original config at ${backupPath}`);
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
    command: 'npx',
    args: [SIMPLE_SERVER_PATH, 'run'],
    capabilities: ['tools'],
    env: {
      DEBUG: 'auth0-mcp:*1',
      NODE_OPTIONS: '--no-warnings',
    },
  };

  // Write the updated config
  try {
    fs.writeFileSync(CLAUDE_CONFIG_PATH, JSON.stringify(config, null, 2));
    console.log(`Successfully ${existingConfig} Auth0 MCP server configuration`);
  } catch (error) {
    console.error(`Error writing Claude Desktop config: ${error.message}`);
    return false;
  }

  console.log(chalk.green('\n=== Configuration Updated Successfully ==='));
  console.log('Configuration details:');
  console.log(`${chalk.green('✓')} Script: ${SIMPLE_SERVER_PATH}`);
  console.log(`${chalk.green('✓')} Capabilities: tools`);
  console.log(`${chalk.green('✓')} Environment: DEBUG=auth0-mcp:*, NODE_OPTIONS=--no-warnings`);

  console.log(
    chalk.yellow('\nIMPORTANT: You need to restart Claude Desktop for changes to take effect.')
  );
  return true;
}

// Run the update
updateConfig()
  .then(success => {
    process.exit(success ? 0 : 1);
  })
  .catch(error => {
    console.error(`Error: ${error.message}`);
    process.exit(1);
  });
