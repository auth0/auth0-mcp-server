import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import chalk from 'chalk';
import { log } from '../utils/logger.js';

interface WindsurfMCPServer {
  args: string[];
  capabilities?: string[];
  command: string;
  env?: Record<string, string>;
}

interface WindsurfConfig {
  mcpServers: Record<string, WindsurfMCPServer>;
}

export const findAndUpdateWindsurfConfig = async () => {
  const resolvedConfigPath = await getWindsurfConfigPath();
  await updateWindsurfConfig(resolvedConfigPath);
  console.log(
    `${chalk.green('✓')} Auth0 MCP server configured. ${chalk.yellow('Restart Windsurf')} to apply changes.`
  );
};

export async function getWindsurfConfigPath(): Promise<string> {
  let configDir: string;

  switch (process.platform) {
    case 'darwin': // macOS
      configDir = path.join(os.homedir(), '.codeium', 'windsurf');
      break;
    case 'win32': // Windows
      const appData = process.env.APPDATA;
      if (!appData) {
        throw new Error('APPDATA environment variable not set');
      }
      configDir = path.join(appData, '.codeium', 'windsurf');
      break;
    case 'linux': // Linux
      configDir = path.join(os.homedir(), '.codeium', 'windsurf');
      break;
    default:
      throw new Error(`Unsupported operating system: ${process.platform}`);
  }

  try {
    await fs.promises.mkdir(configDir, { recursive: true });
  } catch (err) {
    throw new Error(`Failed to create config directory: ${(err as Error).message}`);
  }
  return path.join(configDir, 'mcp_config.json');
}

async function updateWindsurfConfig(configPath: string) {
  let config: WindsurfConfig = { mcpServers: {} };
  if (fs.existsSync(configPath)) {
    try {
      const configData = fs.readFileSync(configPath, 'utf-8');
      config = JSON.parse(configData);
    } catch (error) {
      console.error(`Error reading config file: ${(error as Error).message}`);
    }
  }

  config.mcpServers['auth0'] = {
    command: 'npx',
    args: ['-y', '@auth0/auth0-mcp-server', 'run'],
    env: {
      DEBUG: 'auth0-mcp',
      PATH: process.env.PATH || '',
    },
  };

  try {
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
    log(`Updated Windsurf config file at: ${configPath}`);
  } catch (error) {
    console.error(`Error writing config file: ${(error as Error).message}`);
  }
}
