import chalk from 'chalk';
import { startServer } from './server.js';
import { cliOutput } from './utils/cli-utility.js';
import { log, logError } from './utils/logger.js';
import * as os from 'os';

// Main function to start server
const run = async (args: string[]) => {
  try {
    if (!process.env.HOME) {
      process.env.HOME = os.homedir();
      log(`Set HOME environment variable to ${process.env.HOME}`);
    }

    await startServer();
    cliOutput(`${chalk.green('✓')} Server started successfully`);
  } catch (error) {
    logError('Fatal error starting server:', error);
    process.exit(1);
  }
};

export default run;
