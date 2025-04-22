import { startServer } from '../server.js';
import trackEvent from '../utils/analytics.js';
import { log, logError, logInfo } from '../utils/logger.js';
import * as os from 'os';

/**
 * Command options for the run command
 */
export interface RunOptions {
  tools: string[];
}

/**
 * Main function to start server
 *
 * @param {RunOptions} options - Command options
 * @returns {Promise<void>}
 */
const run = async (options: RunOptions): Promise<void> => {
  try {
    if (!process.env.HOME) {
      process.env.HOME = os.homedir();
      log(`Set HOME environment variable to ${process.env.HOME}`);
    }

    trackEvent.trackServerRun();

    logInfo(`Starting server with selected tools: ${options.tools.join(', ')}`);
    await startServer(options);
  } catch (error) {
    logError('Fatal error starting server:', error);
    process.exit(1);
  }
};

export default run;
