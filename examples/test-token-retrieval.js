#!/usr/bin/env node

/**
 * Auth0 Token Retrieval Test (Updated Version)
 *
 * This script focuses specifically on testing the token retrieval process
 * using the built-in device authorization flow from the MCP server.
 */

import { fileURLToPath } from 'url';
import path from 'path';
import fs from 'fs';
import os from 'os';
import {
  getValidAccessToken,
  refreshAccessToken,
  isTokenExpired,
} from '../dist/device-auth-flow.js';
import keytar from 'keytar';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Configuration
const HOME_DIR = process.env.HOME || os.homedir();
const MCP_SERVICE_NAME = 'auth0-mcp';

// Print environment information
console.log('=== Auth0 Token Retrieval Test (Updated) ===');
console.log('Environment:');
console.log(`- HOME: ${HOME_DIR}`);
console.log(`- Current directory: ${process.cwd()}`);
console.log(`- Script directory: ${__dirname}`);
console.log(`- Auth0 Domain: ${process.env.AUTH0_DOMAIN || 'Using default'}`);

// Utility functions
function success(message) {
  console.log(`✅ ${message}`);
}

function error(message) {
  console.log(`❌ ${message}`);
}

function info(message) {
  console.log(`ℹ️ ${message}`);
}

// Check if a token exists in keychain
async function checkKeychainToken() {
  info('Checking for token in system keychain...');
  try {
    // Check for access token
    const accessToken = await keytar.getPassword(MCP_SERVICE_NAME, `AUTH0_TOKEN`);
    if (accessToken) {
      success('Access token found in keychain');

      // Check for refresh token
      const refreshToken = await keytar.getPassword(MCP_SERVICE_NAME, `AUTH0_REFRESH_TOKEN`);
      if (refreshToken) {
        success('Refresh token found in keychain');
      } else {
        error('Refresh token not found in keychain');
      }

      // Check token expiration
      const isExpired = await isTokenExpired();
      if (isExpired) {
        info('Token is expired, attempting refresh...');
        await testTokenRefresh();
      } else {
        info('Token is still valid');
      }

      return accessToken;
    } else {
      error('No access token found in keychain');
      return null;
    }
  } catch (err) {
    error(`Error accessing keychain: ${err.message}`);
    return null;
  }
}

// Test getting a valid token
async function testGetValidToken() {
  info('Testing getValidAccessToken() function...');
  try {
    const startTime = Date.now();
    const token = await getValidAccessToken();
    const duration = Date.now() - startTime;

    if (token) {
      success(`Retrieved valid token in ${duration}ms`);

      // Display token info
      const tokenStart = token.substring(0, 15);
      const tokenEnd = token.substring(token.length - 5);
      info(`Token: ${tokenStart}...${tokenEnd} (${token.length} chars)`);

      return token;
    } else {
      error('Failed to get valid token');
      return null;
    }
  } catch (err) {
    error(`Error getting valid token: ${err.message}`);
    return null;
  }
}

// Test token refresh
async function testTokenRefresh() {
  info('Testing token refresh...');
  try {
    const startTime = Date.now();
    const token = await refreshAccessToken();
    const duration = Date.now() - startTime;

    if (token) {
      success(`Refreshed token in ${duration}ms`);
      return token;
    } else {
      error('Failed to refresh token');
      return null;
    }
  } catch (err) {
    error(`Error refreshing token: ${err.message}`);
    return null;
  }
}

// Main function
async function main() {
  console.log('\n== Starting token tests ==\n');

  // First, check if we have a token in keychain
  const existingToken = await checkKeychainToken();

  if (!existingToken) {
    info('No valid token in keychain, will attempt to get one');

    // Try to get a valid token
    const validToken = await testGetValidToken();

    if (!validToken) {
      error(
        'Could not retrieve a valid token. You may need to run the device auth flow initialization'
      );
      console.log('\nTry running: node dist/index.js init');
      process.exit(1);
    }
  }

  console.log('\n== Token tests completed ==\n');
}

// Run the main function
main().catch(err => {
  console.error('Unhandled error:', err);
  process.exit(1);
});
