import { findAndUpdatedClaudeConfig } from './clients/claude.js';
import { log } from './utils/logger.js';
import { requestAuthorization } from './utils/auth/device-auth-flow.js';

const init = async (args: string[]) => {
  try {
    log('Initializing Auth0 MCP server...');
    await requestAuthorization();
    await findAndUpdatedClaudeConfig();
  } catch (error) {
    log('Error initializing server:', error);
  }
};

export default init;
