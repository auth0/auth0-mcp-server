#!/usr/bin/env node

/**
 * get-claude-config-path.js
 *
 * A tiny utility to display the Claude Desktop config path
 */

import { getClaudeConfigPath } from '../dist/claude-init-config.js';

// Get and show the Claude config path
async function main() {
  try {
    const configPath = await getClaudeConfigPath();
    console.log(`Claude Desktop config path: ${configPath}`);
  } catch (error) {
    console.error(`Error: ${error.message}`);
    process.exit(1);
  }
}

main();
