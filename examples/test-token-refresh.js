#!/usr/bin/env node

/**
 * Test script for token refresh functionality
 *
 * This script tests the token refresh mechanism by:
 * 1. Checking if the current token is expired
 * 2. Refreshing the token if needed
 * 3. Displaying the new token information
 */

import {
  isTokenExpired,
  refreshAccessToken,
  getValidAccessToken,
} from '../dist/device-auth-flow.js';
import keytar from 'keytar';

async function testTokenRefresh() {
  console.log('=== Auth0 MCP Token Refresh Test ===\n');

  // Check current token expiration
  console.log('Checking token expiration status...');
  const isExpired = await isTokenExpired();
  console.log(`Token expired or about to expire: ${isExpired ? 'YES' : 'NO'}\n`);

  // Get current token info
  const currentToken = await keytar.getPassword('auth0-mcp', 'AUTH0_TOKEN');
  const expiresAtStr = await keytar.getPassword('auth0-mcp', 'AUTH0_TOKEN_EXPIRES_AT');
  const refreshToken = await keytar.getPassword('auth0-mcp', 'AUTH0_REFRESH_TOKEN');

  console.log('Current token information:');
  console.log(
    `- Access token: ${currentToken ? `${currentToken.substring(0, 10)}...` : 'Not found'}`
  );
  console.log(`- Refresh token: ${refreshToken ? 'Available' : 'Not found'}`);

  if (expiresAtStr) {
    const expiresAt = new Date(parseInt(expiresAtStr, 10));
    console.log(`- Expires at: ${expiresAt.toLocaleString()}`);

    const now = new Date();
    const timeLeft = (expiresAt.getTime() - now.getTime()) / 1000;
    console.log(`- Time left: ${Math.max(0, Math.floor(timeLeft))} seconds\n`);
  } else {
    console.log(`- Expiration: Unknown\n`);
  }

  // Refresh token if expired
  if (isExpired) {
    console.log('Attempting to refresh token...');
    const newToken = await refreshAccessToken();

    if (newToken) {
      console.log('Token successfully refreshed!');

      // Get updated expiration
      const newExpiresAtStr = await keytar.getPassword('auth0-mcp', 'AUTH0_TOKEN_EXPIRES_AT');
      if (newExpiresAtStr) {
        const newExpiresAt = new Date(parseInt(newExpiresAtStr, 10));
        console.log(`- New expiration: ${newExpiresAt.toLocaleString()}`);
      }
    } else {
      console.log('Failed to refresh token.');
    }
  } else {
    console.log('Token is still valid, no refresh needed.');
  }

  // Get valid token
  console.log('\nTesting getValidAccessToken function...');
  const validToken = await getValidAccessToken();
  console.log(`Valid token: ${validToken ? `${validToken.substring(0, 10)}...` : 'Not available'}`);
}

// Run the test
testTokenRefresh().catch(error => {
  console.error('Error during token refresh test:', error);
  process.exit(1);
});
