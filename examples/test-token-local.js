#!/usr/bin/env node

/**
 * Test script for Auth0 token retrieval using local Auth0 CLI
 *
 * This script tests if we can successfully retrieve an Auth0 token
 * using the local build of the Auth0 CLI.
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import fs from 'fs';
import path from 'path';

const execAsync = promisify(exec);

// Local Auth0 CLI path
const LOCAL_AUTH0_CLI_PATH = '/Users/bharath/dev/mcp/auth0-cli/auth0';
const DEFAULT_TIMEOUT_MS = 10000;

async function main() {
  console.log('===============================');
  console.log('Auth0 Token Retrieval Test (Local CLI)');
  console.log('===============================');

  try {
    // Check if local CLI exists
    if (!fs.existsSync(LOCAL_AUTH0_CLI_PATH)) {
      console.error(`ERROR: Local Auth0 CLI not found at: ${LOCAL_AUTH0_CLI_PATH}`);
      process.exit(1);
    }

    console.log(`Local Auth0 CLI found at: ${LOCAL_AUTH0_CLI_PATH}`);

    // Make executable just in case
    try {
      fs.chmodSync(LOCAL_AUTH0_CLI_PATH, '755');
      console.log('Made local Auth0 CLI executable');
    } catch (error) {
      console.warn(`Warning: Could not change permissions on CLI: ${error.message}`);
    }

    // Show Auth0 CLI version
    try {
      const { stdout: versionOutput } = await execAsync(`"${LOCAL_AUTH0_CLI_PATH}" --version`);
      console.log(`Auth0 CLI version: ${versionOutput.trim()}`);
    } catch (error) {
      console.warn(`Warning: Could not get Auth0 CLI version: ${error.message}`);
    }

    // Check if user is logged in
    try {
      console.log('Checking Auth0 login status...');
      const { stdout: tenantsOutput } = await execAsync(`"${LOCAL_AUTH0_CLI_PATH}" tenants list`);
      if (tenantsOutput.trim()) {
        console.log('User is logged in to Auth0');
        console.log(`Tenants: ${tenantsOutput.trim()}`);
      } else {
        console.warn('WARNING: No tenants found, user might not be logged in');
      }
    } catch (error) {
      console.warn(`WARNING: Could not check Auth0 login status: ${error.message}`);
      console.log('You may need to run: auth0 login');
    }

    // Try to get token with timeout
    console.log('\nAttempting to retrieve token with local Auth0 CLI...');

    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(
        () => reject(new Error(`Token retrieval timed out after ${DEFAULT_TIMEOUT_MS}ms`)),
        DEFAULT_TIMEOUT_MS
      );
    });

    const tokenPromise = execAsync(`"${LOCAL_AUTH0_CLI_PATH}" api get-token`).then(
      ({ stdout, stderr }) => {
        if (stderr && !stdout) {
          throw new Error(`Command error: ${stderr.trim()}`);
        }
        return stdout.trim();
      }
    );

    // Race between timeout and token retrieval
    const token = await Promise.race([tokenPromise, timeoutPromise]);

    if (!token) {
      throw new Error('Retrieved token is empty');
    }

    console.log('SUCCESS! Token successfully retrieved:');
    console.log(`${token.substring(0, 15)}...${token.substring(token.length - 15)}`);
    console.log(`Token length: ${token.length} characters`);

    console.log('\nToken retrieval test completed successfully!');
  } catch (error) {
    console.error('\nERROR: Token retrieval failed:');
    console.error(error.message);

    // Provide troubleshooting steps
    console.log('\nTroubleshooting steps:');
    console.log('1. Ensure you are logged in with the local Auth0 CLI:');
    console.log(`   "${LOCAL_AUTH0_CLI_PATH}" login`);
    console.log('2. Check your network connection');
    console.log('3. Verify the Auth0 CLI configuration');
    console.log('4. Try running the command manually:');
    console.log(`   "${LOCAL_AUTH0_CLI_PATH}" api get-token`);

    process.exit(1);
  }
}

main();
