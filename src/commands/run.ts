import { startServer } from '../server.js';
import { log, logError } from '../utils/logger.js';
import * as os from 'os';
import type { HttpServerOptions } from '../utils/types.js';

// Function to parse command line arguments
function parseArgs(): { useHttpTransport: boolean; httpOptions: HttpServerOptions } {
  const args = process.argv.slice(2);
  const result = {
    useHttpTransport: false,
    httpOptions: {
      port: 3000,
      host: 'localhost',
    },
  };

  // Check if --http flag is present
  const httpIndex = args.indexOf('--http');
  if (httpIndex >= 0) {
    result.useHttpTransport = true;
  }

  // Check for port option
  const portIndex = args.indexOf('--port');
  if (portIndex >= 0 && args[portIndex + 1]) {
    const portValue = parseInt(args[portIndex + 1], 10);
    if (!isNaN(portValue)) {
      result.httpOptions.port = portValue;
    }
  }

  // Check for host option
  const hostIndex = args.indexOf('--host');
  if (hostIndex >= 0 && args[hostIndex + 1]) {
    result.httpOptions.host = args[hostIndex + 1];
  }

  return result;
}

// Main function to start server
const run = async () => {
  try {
    if (!process.env.HOME) {
      process.env.HOME = os.homedir();
      log(`Set HOME environment variable to ${process.env.HOME}`);
    }

    // Parse command line arguments
    const options = parseArgs();

    // Log transport mode
    if (options.useHttpTransport) {
      log(
        `Starting server using HTTP transport on ${options.httpOptions.host}:${options.httpOptions.port}`
      );
      log('This mode supports streamable responses according to MCP specification 2025-03-26');
    } else {
      log('Starting server using standard stdio transport');
    }

    await startServer({
      useHttpTransport: options.useHttpTransport,
      httpOptions: options.httpOptions,
    });
  } catch (error) {
    logError('Fatal error starting server:', error);
    process.exit(1);
  }
};

export default run;
