#!/usr/bin/env node

/**
 * Environment Validator for Auth0 MCP Server
 *
 * This script checks if all required environment variables are properly set
 * and provides guidance on how to set them.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import os from 'os';
import { execSync } from 'child_process';
import dotenv from 'dotenv';

// Set up paths
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, '..');

// Load environment variables from .env if it exists
const envPath = path.join(PROJECT_ROOT, '.env');
if (fs.existsSync(envPath)) {
  console.log(`Loading environment variables from ${envPath}`);
  dotenv.config({ path: envPath });
}

// Validation functions
function validateAuth0Domain() {
  const domain = process.env.AUTH0_DOMAIN;
  if (!domain) {
    return {
      valid: false,
      message:
        'AUTH0_DOMAIN is not set. Please set it to your Auth0 tenant domain (e.g., your-tenant.auth0.com)',
    };
  }

  if (!domain.includes('.') || !domain.includes('.auth0.com')) {
    return {
      valid: false,
      message: `AUTH0_DOMAIN has an unusual format: ${domain}. It should look like "your-tenant.auth0.com"`,
    };
  }

  return { valid: true };
}

function validateAuth0Token() {
  const token = process.env.AUTH0_TOKEN;
  if (!token) {
    return {
      valid: false,
      message: 'AUTH0_TOKEN is not set. You need a valid Auth0 Management API token',
    };
  }

  if (token.length < 50) {
    return {
      valid: false,
      message: `AUTH0_TOKEN seems too short (${token.length} chars). Auth0 tokens are typically very long`,
    };
  }

  return { valid: true };
}

function validateAuth0CliPath() {
  const cliPath = process.env.AUTH0_CLI_PATH;
  if (!cliPath) {
    // Try to find auth0-cli in PATH
    try {
      execSync('which auth0', { stdio: 'ignore' });
      return {
        valid: true,
        message: 'AUTH0_CLI_PATH is not set but "auth0" command was found in PATH',
      };
    } catch (e) {
      return {
        valid: false,
        message:
          'AUTH0_CLI_PATH is not set and "auth0" command was not found in PATH. Please install Auth0 CLI',
      };
    }
  }

  if (!fs.existsSync(cliPath)) {
    return {
      valid: false,
      message: `AUTH0_CLI_PATH points to non-existent file: ${cliPath}`,
    };
  }

  if (!fs.statSync(cliPath).isFile()) {
    return {
      valid: false,
      message: `AUTH0_CLI_PATH points to a directory, not a file: ${cliPath}`,
    };
  }

  try {
    fs.accessSync(cliPath, fs.constants.X_OK);
  } catch (e) {
    return {
      valid: false,
      message: `AUTH0_CLI_PATH points to a file that is not executable: ${cliPath}`,
    };
  }

  return { valid: true };
}

// Main validation function
function validateEnvironment() {
  console.log('=== Auth0 MCP Server Environment Validator ===');

  const validators = [
    { name: 'AUTH0_DOMAIN', validator: validateAuth0Domain },
    { name: 'AUTH0_TOKEN', validator: validateAuth0Token },
    { name: 'AUTH0_CLI_PATH', validator: validateAuth0CliPath, optional: true },
  ];

  let allValid = true;
  let issues = [];

  for (const { name, validator, optional } of validators) {
    process.stdout.write(`Checking ${name}... `);
    const result = validator();

    if (result.valid) {
      console.log('✅ OK');
      if (result.message) {
        console.log(`   Note: ${result.message}`);
      }
    } else {
      console.log('❌ FAILED');
      console.log(`   Error: ${result.message}`);

      if (!optional) {
        allValid = false;
        issues.push(result.message);
      } else {
        console.log("   (This is optional and won't prevent the server from running)");
      }
    }
  }

  console.log('\n=== Summary ===');

  if (allValid) {
    console.log('✅ All required environment variables are correctly set.');
    console.log('   The Auth0 MCP server should work properly.');
  } else {
    console.log('❌ There are issues with your environment setup:');
    issues.forEach(issue => {
      console.log(`   - ${issue}`);
    });

    console.log('\nPlease fix these issues by:');
    console.log('1. Creating a .env file in the project root with the correct values');
    console.log('2. Or setting the environment variables directly before running the server');

    console.log('\nExample .env file:');
    console.log('AUTH0_DOMAIN=your-tenant.auth0.com');
    console.log('AUTH0_TOKEN=your-auth0-management-api-token');
    console.log('AUTH0_CLI_PATH=/path/to/auth0-cli');
  }
}

// Run the validation
validateEnvironment();
