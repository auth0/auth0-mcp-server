import { startServer } from '../server.js';
import trackEvent from '../utils/analytics.js';
import { log, logError } from '../utils/logger.js';
import * as os from 'os';

/**
 * Command options for the run command
 */
export type RunOptions = Record<string, never>;

/**
 * Main function to start server
 *
 * @param {RunOptions} _options - Command options from commander (unused)
 * @returns {Promise<void>}
 */
const run = async (_options?: RunOptions): Promise<void> => {
  try {
    if (!process.env.HOME) {
      process.env.HOME = os.homedir();
      log(`Set HOME environment variable to ${process.env.HOME}`);
    }

    trackEvent.trackServerRun();

    await startServer();
  } catch (error) {
    logError('Fatal error starting server:', error);
    process.exit(1);
  }
};

export default run;
