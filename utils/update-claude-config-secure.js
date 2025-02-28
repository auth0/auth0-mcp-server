#!/usr/bin/env node

/**
 * Secure Update for Claude Desktop Configuration
 *
 * This script properly updates the Claude Desktop configuration to use
 * the dynamic wrapper script WITHOUT storing tokens in the config.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import os from 'os';
import { spawn } from 'child_process';
import { execSync } from 'child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const HOME_DIR = os.homedir();
const CLAUDE_CONFIG_PATH = path.join(
  HOME_DIR,
  'Library',
  'Application Support',
  'Claude',
  'claude_desktop_config.json'
);
const DYNAMIC_WRAPPER_PATH = path.join(__dirname, 'dynamic-wrapper.sh');

// Define paths and constants
const AUTH0_DOMAIN = process.env.AUTH0_DOMAIN || 'your-tenant.auth0.com';
const LOCAL_AUTH0_CLI_PATH = process.env.AUTH0_CLI_PATH || '';

// Make the script executable
async function makeScriptExecutable() {
  console.log(`Making dynamic wrapper executable: ${DYNAMIC_WRAPPER_PATH}`);
  try {
    fs.chmodSync(DYNAMIC_WRAPPER_PATH, '755');
    console.log('✅ Made dynamic wrapper executable');
    return true;
  } catch (error) {
    console.error(`❌ Error making wrapper executable: ${error.message}`);
    return false;
  }
}

// Check Auth0 CLI
console.log('Checking Auth0 CLI installation and authentication...');
const auth0CliPath = LOCAL_AUTH0_CLI_PATH;

if (!fs.existsSync(auth0CliPath)) {
  console.error(`❌ Auth0 CLI not found at: ${auth0CliPath}`);
  console.log('Please install the Auth0 CLI or update the path in this script.');
  process.exit(1);
}
console.log(`✅ Auth0 CLI found at: ${auth0CliPath}`);

// Make sure it's executable
try {
  fs.chmodSync(auth0CliPath, '755');
} catch (err) {
  console.warn(`⚠️ Warning: Could not change permissions on Auth0 CLI: ${err.message}`);
}

// Verify Auth0 CLI is authenticated
try {
  execSync(`"${auth0CliPath}" tenants list`, { stdio: 'pipe' });
  console.log('✅ Auth0 CLI is authenticated');
} catch (err) {
  console.error('❌ Auth0 CLI is not authenticated');
  console.log(`Please run: ${auth0CliPath} login`);
  process.exit(1);
}

// Update Claude Desktop config
async function updateClaudeConfig() {
  console.log('=== Update Claude Desktop Configuration (Secure) ===');

  // Check if wrapper exists
  if (!fs.existsSync(DYNAMIC_WRAPPER_PATH)) {
    console.error(`❌ Dynamic wrapper not found at: ${DYNAMIC_WRAPPER_PATH}`);
    return false;
  }

  // Check if Claude config exists
  if (!fs.existsSync(CLAUDE_CONFIG_PATH)) {
    console.error(`❌ Claude Desktop config not found at: ${CLAUDE_CONFIG_PATH}`);
    console.log('Make sure Claude Desktop is installed and has been run at least once');
    return false;
  }

  try {
    // Read current config
    const configData = fs.readFileSync(CLAUDE_CONFIG_PATH, 'utf8');
    let config;

    try {
      config = JSON.parse(configData);
    } catch (error) {
      console.error(`❌ Error parsing Claude config: ${error.message}`);
      return false;
    }

    // Create backup of original config
    const backupPath = `${CLAUDE_CONFIG_PATH}.secure.backup`;
    fs.writeFileSync(backupPath, configData);
    console.log(`✅ Created backup of original config at: ${backupPath}`);

    // Update config for Auth0 MCP server
    if (!config.mcpServers) {
      config.mcpServers = {};
    }

    // Check for existing auth0 configuration
    const hadExistingConfig = !!config.mcpServers.auth0;

    // Update auth0 configuration (without embedding token)
    config.mcpServers.auth0 = {
      command: DYNAMIC_WRAPPER_PATH,
      args: ['run', AUTH0_DOMAIN],
      env: {
        DEBUG: 'auth0-mcp:*',
      },
      capabilities: ['externalCommunication'],
    };

    // Write updated config
    fs.writeFileSync(CLAUDE_CONFIG_PATH, JSON.stringify(config, null, 2));

    if (hadExistingConfig) {
      console.log('✅ Updated existing Auth0 MCP server configuration in Claude Desktop');
    } else {
      console.log('✅ Added new Auth0 MCP server configuration to Claude Desktop');
    }

    console.log('\nConfiguration details:');
    console.log(`- Command: ${DYNAMIC_WRAPPER_PATH}`);
    console.log(`- Domain: ${AUTH0_DOMAIN}`);
    console.log('- Token: [Retrieved dynamically - not stored in config]');

    console.log('\n⚠️ Important: You need to restart Claude Desktop for changes to take effect');
    return true;
  } catch (error) {
    console.error(`❌ Error updating Claude Desktop config: ${error.message}`);
    return false;
  }
}

// Main function
async function main() {
  try {
    console.log('=== Secure Claude Desktop Configuration Update ===');
    console.log('This script updates Claude Desktop to use dynamic token retrieval');
    console.log('for improved security (no tokens stored in config files)');
    console.log('');

    // Step 1: Make the script executable
    await makeScriptExecutable();

    // Step 2: Update Claude config
    const success = await updateClaudeConfig();

    if (success) {
      console.log('\n✅ Claude Desktop configuration updated successfully!');
      console.log('Tokens will now be retrieved dynamically and securely.');
    } else {
      console.error('\n❌ Failed to update Claude Desktop configuration');
    }

    return success;
  } catch (error) {
    console.error(`❌ Error: ${error.message}`);
    return false;
  }
}

// Run the main function
main().then(success => {
  process.exit(success ? 0 : 1);
});
