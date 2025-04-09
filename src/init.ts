import { findAndUpdateClaudeConfig } from './clients/claude.js';
import { findAndUpdateWindsurfConfig } from './clients/windsurf.js';
import { findAndUpdateCursorConfig } from './clients/cursor.js';
import { log } from './utils/logger.js';
import { requestAuthorization } from './auth/device-auth-flow.js';

const init = async (args: string[]) => {
  try {
    log('Initializing Auth0 MCP server...');
    await requestAuthorization();

    // Parse client flag
    const clientFlagIndex = args.findIndex((arg) => arg === '--client');
    const clientValue =
      clientFlagIndex !== -1 && clientFlagIndex < args.length - 1
        ? args[clientFlagIndex + 1].toLowerCase()
        : 'claude'; // Default to Claude

    // Configure the selected client
    if (clientValue === 'windsurf') {
      log('Configuring Windsurf as client...');
      await findAndUpdateWindsurfConfig();
    } else if (clientValue === 'cursor') {
      log('Configuring Cursor as client...');
      await findAndUpdateCursorConfig();
    } else if (clientValue === 'claude') {
      log('Configuring Claude as client...');
      await findAndUpdateClaudeConfig();
    } else {
      // Default to Claude for any other value or if no client specified
      log('Configuring Claude as client default...');
      await findAndUpdateClaudeConfig();
    }
  } catch (error) {
    log('Error initializing server:', error);
  }
};

export default init;
