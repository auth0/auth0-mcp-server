#!/usr/bin/env node

/**
 * Auth0 Token Retrieval Test
 *
 * This script focuses specifically on testing the token retrieval process
 * with proper timeouts and debug information.
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const execAsync = promisify(exec);
const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Configuration
const TIMEOUT_MS = 10000; // 10 second timeout for commands
const HOME_DIR = process.env.HOME || require('os').homedir();
const CONFIG_PATHS = [
  path.join(HOME_DIR, '.config', 'auth0', 'config.json'),
  path.join(HOME_DIR, '.auth0', 'config.json'),
];

// Print environment information
console.log('=== Auth0 Token Retrieval Test ===');
console.log('Environment:');
console.log(`- HOME: ${HOME_DIR}`);
console.log(`- PATH: ${process.env.PATH}`);
console.log(`- Current directory: ${process.cwd()}`);
console.log(`- Script directory: ${__dirname}`);
console.log(`- AUTH0_CLI_PATH: ${process.env.AUTH0_CLI_PATH || 'Not set'}`);
console.log(`- AUTH0_DOMAIN: ${process.env.AUTH0_DOMAIN || 'Not set'}`);

// Function to execute a command with timeout
async function execWithTimeout(command, timeoutMs) {
  return new Promise(resolve => {
    console.log(`Executing: ${command}`);
    const startTime = Date.now();

    // Create child process
    const child = exec(command);
    let stdout = '';
    let stderr = '';

    // Set timeout
    const timeout = setTimeout(() => {
      console.log(`⚠️ Command timed out after ${timeoutMs}ms: ${command}`);
      child.kill();
      resolve({
        stdout,
        stderr,
        error: new Error('Timeout'),
        timedOut: true,
        durationMs: Date.now() - startTime,
      });
    }, timeoutMs);

    // Collect stdout
    child.stdout.on('data', data => {
      stdout += data;
    });

    // Collect stderr
    child.stderr.on('data', data => {
      stderr += data;
    });

    // Handle completion
    child.on('close', code => {
      clearTimeout(timeout);
      resolve({
        stdout,
        stderr,
        code,
        error: code !== 0 ? new Error(`Exit code: ${code}`) : null,
        timedOut: false,
        durationMs: Date.now() - startTime,
      });
    });
  });
}

// Method 1: Using get-token.sh
async function tryGetTokenScript() {
  console.log('\n=== Method 1: Using get-token.sh ===');
  const getTokenScript = path.join(__dirname, 'get-token.sh');

  if (!fs.existsSync(getTokenScript)) {
    console.log(`❌ get-token.sh not found at: ${getTokenScript}`);
    return null;
  }

  console.log(`✓ Found get-token.sh at: ${getTokenScript}`);

  try {
    // Make script executable
    await execWithTimeout(`chmod +x "${getTokenScript}"`, 5000);

    // Run the script with timeout
    const result = await execWithTimeout(`"${getTokenScript}"`, TIMEOUT_MS);

    if (result.timedOut) {
      console.log('❌ get-token.sh timed out after 10 seconds');
      console.log('Partial stdout:', result.stdout);
      console.log('Partial stderr:', result.stderr);
      return null;
    }

    if (result.error) {
      console.log(`❌ get-token.sh failed with exit code: ${result.code}`);
      console.log('Stderr:', result.stderr);
      return null;
    }

    const token = result.stdout.trim();
    if (token) {
      console.log(`✓ Successfully retrieved token using get-token.sh (${token.length} chars)`);
      return token;
    } else {
      console.log('❌ get-token.sh returned empty result');
      return null;
    }
  } catch (error) {
    console.log('❌ Error executing get-token.sh:', error.message);
    return null;
  }
}

// Method 2: Using AUTH0_CLI_PATH
async function tryAuth0CliPath() {
  console.log('\n=== Method 2: Using AUTH0_CLI_PATH ===');

  const cliPath = process.env.AUTH0_CLI_PATH;
  if (!cliPath) {
    console.log('❌ AUTH0_CLI_PATH environment variable not set');
    return null;
  }

  if (!fs.existsSync(cliPath)) {
    console.log(`❌ Auth0 CLI not found at: ${cliPath}`);
    return null;
  }

  console.log(`✓ Found Auth0 CLI at: ${cliPath}`);

  try {
    // Make CLI executable
    await execWithTimeout(`chmod +x "${cliPath}"`, 5000);

    // Run the CLI command with timeout
    const result = await execWithTimeout(`"${cliPath}" api get-token`, TIMEOUT_MS);

    if (result.timedOut) {
      console.log('❌ Auth0 CLI timed out after 10 seconds');
      console.log('Partial stdout:', result.stdout);
      console.log('Partial stderr:', result.stderr);
      return null;
    }

    if (result.error) {
      console.log(`❌ Auth0 CLI failed with exit code: ${result.code}`);
      console.log('Stderr:', result.stderr);
      return null;
    }

    const token = result.stdout.trim();
    if (token) {
      console.log(`✓ Successfully retrieved token using Auth0 CLI (${token.length} chars)`);
      return token;
    } else {
      console.log('❌ Auth0 CLI returned empty result');
      return null;
    }
  } catch (error) {
    console.log('❌ Error executing Auth0 CLI:', error.message);
    return null;
  }
}

// Method 3: Using auth0 command in PATH
async function tryAuth0InPath() {
  console.log('\n=== Method 3: Using auth0 command in PATH ===');

  try {
    // Check if auth0 is in PATH
    const whichResult = await execWithTimeout('which auth0', 5000);

    if (whichResult.error) {
      console.log('❌ auth0 command not found in PATH');
      return null;
    }

    console.log(`✓ Found auth0 command at: ${whichResult.stdout.trim()}`);

    // Run the auth0 command with timeout
    const result = await execWithTimeout('auth0 api get-token', TIMEOUT_MS);

    if (result.timedOut) {
      console.log('❌ auth0 command timed out after 10 seconds');
      console.log('Partial stdout:', result.stdout);
      console.log('Partial stderr:', result.stderr);
      return null;
    }

    if (result.error) {
      console.log(`❌ auth0 command failed with exit code: ${result.code}`);
      console.log('Stderr:', result.stderr);
      return null;
    }

    const token = result.stdout.trim();
    if (token) {
      console.log(`✓ Successfully retrieved token using auth0 command (${token.length} chars)`);
      return token;
    } else {
      console.log('❌ auth0 command returned empty result');
      return null;
    }
  } catch (error) {
    console.log('❌ Error executing auth0 command:', error.message);
    return null;
  }
}

// Method 4: Check config files directly
async function checkConfigFiles() {
  console.log('\n=== Method 4: Checking config files directly ===');

  for (const configPath of CONFIG_PATHS) {
    console.log(`Checking config at: ${configPath}`);

    if (!fs.existsSync(configPath)) {
      console.log(`❌ Config file not found at: ${configPath}`);
      continue;
    }

    console.log(`✓ Found config file at: ${configPath}`);

    try {
      const configData = fs.readFileSync(configPath, 'utf8');
      const configJson = JSON.parse(configData);

      if (configJson.access_token) {
        console.log(`✓ Found access_token in config (${configJson.access_token.length} chars)`);
        return configJson.access_token;
      } else {
        console.log('❌ No access_token found in config');
      }
    } catch (error) {
      console.log(`❌ Error reading config file: ${error.message}`);
    }
  }

  return null;
}

// Run all methods in sequence
async function main() {
  try {
    // Try all methods in sequence
    const token =
      (await tryGetTokenScript()) ||
      (await tryAuth0CliPath()) ||
      (await tryAuth0InPath()) ||
      (await checkConfigFiles());

    if (token) {
      console.log('\n=== Success ===');
      console.log(`Retrieved token successfully (${token.length} characters)`);
      // Only show a preview of the token for security
      if (token.length > 10) {
        console.log(
          `Token preview: ${token.substring(0, 5)}...${token.substring(token.length - 5)}`
        );
      }
      return true;
    } else {
      console.log('\n=== Failure ===');
      console.log('Failed to retrieve token using any method');

      // Suggest fixes
      console.log('\nPossible solutions:');
      console.log('1. Log in to Auth0 again with: auth0 login');
      console.log('2. Check if your auth0-cli works by running: auth0 tenants list');
      console.log('3. Check if your Auth0 token has expired');
      console.log('4. Ensure AUTH0_CLI_PATH points to the correct location');
      return false;
    }
  } catch (error) {
    console.log('\n=== Error ===');
    console.log('Unexpected error:', error);
    return false;
  }
}

// Run the main function
main().then(success => {
  if (success) {
    process.exit(0);
  } else {
    process.exit(1);
  }
});
