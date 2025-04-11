import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import chalk from 'chalk';
import { log, logError } from '../utils/logger.js';
import { cliOutput } from '../utils/cli-utility.js';

interface CursorMCPServer {
  args: string[];
  command: string;
  env?: Record<string, string>;
}

interface CursorConfig {
  mcpServers: Record<string, CursorMCPServer>;
}

export const findAndUpdateCursorConfig = async () => {
  const resolvedConfigPath = await getCursorConfigPath();
  await updateCursorConfig(resolvedConfigPath);
  cliOutput(
    `\n${chalk.green('✓')} Auth0 MCP server configured. ${chalk.yellow('Restart Cursor')} to apply changes.\n`
  );
};

export async function getCursorConfigPath(): Promise<string> {
  let configDir: string;

  switch (process.platform) {
    case 'darwin': // macOS
      configDir = path.join(os.homedir(), '.cursor');
      break;
    case 'win32': {
      // Windows
      const APPDATA = process.env.APPDATA;
      if (!APPDATA) {
        throw new Error('APPDATA environment variable not set');
      }
      configDir = path.join(APPDATA, '.cursor');
      break;
    }
    case 'linux': // Linux
      configDir = path.join(os.homedir(), '.cursor');
      break;
    default:
      throw new Error(`Unsupported operating system: ${process.platform}`);
  }

  try {
    await fs.promises.mkdir(configDir, { recursive: true });
  } catch (err) {
    throw new Error(`Failed to create config directory: ${(err as Error).message}`);
  }
  return path.join(configDir, 'mcp.json');
}

async function updateCursorConfig(configPath: string) {
  let config: CursorConfig = { mcpServers: {} };
  if (fs.existsSync(configPath)) {
    try {
      const configData = fs.readFileSync(configPath, 'utf-8');
      config = JSON.parse(configData);
    } catch (error) {
      logError(`Error reading config file: ${(error as Error).message}`);
    }
  }

  config.mcpServers['auth0'] = {
    command: 'npx',
    args: ['-y', '@auth0/auth0-mcp-server', 'run'],
    env: {
      DEBUG: 'auth0-mcp',
    },
  };

  try {
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
    log(`Updated Cursor config file at: ${configPath}`);
  } catch (error) {
    logError(`Error writing config file: ${(error as Error).message}`);
  }
}
