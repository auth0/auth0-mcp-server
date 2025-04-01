import { startServer } from './server.js';
import { log } from './utils/logger.js';
import * as os from 'os';

// Main function to start server
const run = async (args: string[]) => {
  try {
    if (!process.env.HOME) {
      process.env.HOME = os.homedir();
      log(`Set HOME environment variable to ${process.env.HOME}`);
    }

    await startServer();
    log('✅ Server started successfully');
  } catch (error) {
    console.error('Fatal error starting server:', error);
    process.exit(1);
  }
};

export default run;
