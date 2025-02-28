#!/usr/bin/env node

/**
 * Auth0 MCP Server Token Fixer
 *
 * This script helps fix token retrieval issues by:
 * 1. Finding an existing token from Auth0 CLI or config files
 * 2. Creating an environment file with the token
 * 3. Creating a simplified wrapper script
 * 4. Updating Claude Desktop config to use the wrapper
 */

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';

// Get __dirname equivalent in ESM
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// User's home directory
const HOME_DIR = os.homedir();

// Try to get CLI path
function getAuth0CliPath() {
  const cliPathEnv = process.env.AUTH0_CLI_PATH;

  // If explicitly set in env, use it
  if (cliPathEnv && fs.existsSync(cliPathEnv)) {
    return cliPathEnv;
  }

  // Otherwise try to find it in PATH
  try {
    return execSync('which auth0', { encoding: 'utf8' }).trim();
  } catch (e) {
    // Try specific paths as fallback
    const possiblePaths = [
      path.join(HOME_DIR, '.local', 'bin', 'auth0'),
      path.join(HOME_DIR, 'bin', 'auth0'),
      path.resolve(process.cwd(), '..', 'auth0-cli', 'auth0'),
    ];

    for (const possiblePath of possiblePaths) {
      if (fs.existsSync(possiblePath)) {
        return possiblePath;
      }
    }
  }

  return 'auth0'; // Hope it's in PATH
}

// Try to get Auth0 domain from CLI
function getAuth0Domain() {
  try {
    const cliPath = getAuth0CliPath();
    console.log(`Using Auth0 CLI: ${cliPath}`);

    const tenantInfo = execSync(`${cliPath} tenants list --json`, { encoding: 'utf8' });
    const tenants = JSON.parse(tenantInfo);

    if (tenants && tenants.length > 0) {
      const activeTenant = tenants.find(t => t.active) || tenants[0];
      console.log(`Found tenant: ${activeTenant.name}`);
      return activeTenant.name;
    }
  } catch (e) {
    console.log(`Unable to get domain from CLI: ${e.message}`);
  }

  return process.env.AUTH0_DOMAIN || 'your-tenant.auth0.com';
}

// Find an existing token from various sources
function findExistingToken() {
  console.log('Looking for existing Auth0 token...');

  // Try to get token from Auth0 CLI
  try {
    const cliPath = getAuth0CliPath();
    console.log(`Trying to get token from Auth0 CLI: ${cliPath}`);

    const token = execSync(`${cliPath} api get-token`, { encoding: 'utf8' }).trim();
    if (token && token.length > 10) {
      console.log(`✅ Found token from Auth0 CLI (length: ${token.length})`);
      return token;
    }
  } catch (e) {
    console.log(`Unable to get token from CLI: ${e.message}`);
  }

  // Check auth0-cli config files
  const configPaths = [
    path.join(HOME_DIR, '.config', 'auth0', 'config.json'),
    path.join(HOME_DIR, '.auth0', 'config.json'),
  ];

  for (const configPath of configPaths) {
    try {
      if (fs.existsSync(configPath)) {
        console.log(`Checking ${configPath} for token...`);
        const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));

        if (config.default_tenant && config.tenants && config.tenants[config.default_tenant]) {
          const tenant = config.tenants[config.default_tenant];
          if (tenant.access_token) {
            console.log(`✅ Found token in ${configPath}`);
            return tenant.access_token;
          }
        }
      }
    } catch (e) {
      console.log(`Error reading ${configPath}: ${e.message}`);
    }
  }

  console.log('❌ No token found in config files');
  return null;
}

// Create an environment file
function createEnvFile(token) {
  if (!token) {
    console.log('No token available to create .env file');
    return false;
  }

  const envPath = path.join(__dirname, '.env');
  const auth0Domain = getAuth0Domain();
  const envContent = `AUTH0_TOKEN=${token}\nAUTH0_DOMAIN=${auth0Domain}\n`;

  try {
    fs.writeFileSync(envPath, envContent);
    console.log(`✅ Created .env file at ${envPath}`);
    return true;
  } catch (error) {
    console.log(`❌ Error creating .env file: ${error.message}`);
    return false;
  }
}

// Create a simplified wrapper script
function createSimpleWrapper() {
  const wrapperPath = path.join(__dirname, 'simple-wrapper.sh');
  const wrapperContent = `#!/bin/bash

# Simple wrapper for Auth0 MCP Server
# This uses a .env file directly instead of trying to retrieve a token

# Path to Node.js
NODE_PATH=\${NODE_PATH:-node}

# Path to the server
SERVER_PATH="\$(dirname "\$0")/../dist/index.js"

# Use .env file if it exists
if [ -f "\$(dirname "\$0")/.env" ]; then
  echo "Using .env file for Auth0 token" >&2
  source "\$(dirname "\$0")/.env"
fi

# Run the server
exec "\$NODE_PATH" "\$SERVER_PATH" "\$@"
`;

  try {
    fs.writeFileSync(wrapperPath, wrapperContent);
    fs.chmodSync(wrapperPath, '755'); // Make executable
    console.log(`✅ Created simple wrapper at ${wrapperPath}`);
    return true;
  } catch (error) {
    console.log(`❌ Error creating wrapper: ${error.message}`);
    return false;
  }
}

// Update Claude Desktop config to use the new wrapper
function updateClaudeConfig() {
  const claudeConfigPath = path.join(
    HOME_DIR,
    'Library',
    'Application Support',
    'Claude',
    'claude_desktop_config.json'
  );

  if (!fs.existsSync(claudeConfigPath)) {
    console.log(`❌ Claude Desktop config not found at: ${claudeConfigPath}`);
    return false;
  }

  try {
    const configData = fs.readFileSync(claudeConfigPath, 'utf8');
    const config = JSON.parse(configData);

    if (!config.mcpServers || !config.mcpServers.auth0) {
      console.log('❌ Auth0 MCP server not configured in Claude Desktop');
      return false;
    }

    // Save the original config
    const backupPath = `${claudeConfigPath}.backup`;
    fs.writeFileSync(backupPath, configData);
    console.log(`✅ Created backup of Claude config at ${backupPath}`);

    // Update to use the new wrapper
    const simplePath = path.join(__dirname, 'simple-wrapper.sh');
    config.mcpServers.auth0.command = simplePath;

    // Write the updated config
    fs.writeFileSync(claudeConfigPath, JSON.stringify(config, null, 2));
    console.log(`✅ Updated Claude Desktop config to use simplified wrapper`);

    return true;
  } catch (error) {
    console.log(`❌ Error updating Claude config: ${error.message}`);
    return false;
  }
}

// Main function
async function main() {
  try {
    // Step 1: Find an existing token
    const token = findExistingToken();

    if (token) {
      // Step 2: Create .env file
      const envCreated = createEnvFile(token);

      // Step 3: Create simplified wrapper
      const wrapperCreated = createSimpleWrapper();

      // Step 4: Update Claude Desktop config
      if (envCreated && wrapperCreated) {
        const configUpdated = updateClaudeConfig();

        if (configUpdated) {
          console.log('\n✅ All fixes applied successfully!');
          console.log('Please restart Claude Desktop to apply changes.');
          return true;
        }
      }
    } else {
      console.log('\n❌ Unable to fix token issue: No token found');
      console.log('Please try logging in to Auth0 again:');
      console.log('1. Run: auth0 login');
      console.log('2. Then run this script again');
    }

    return false;
  } catch (error) {
    console.log(`\n❌ Error: ${error.message}`);
    return false;
  }
}

main().then(success => {
  if (success) {
    process.exit(0);
  } else {
    process.exit(1);
  }
});
