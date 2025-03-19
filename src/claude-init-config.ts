import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import chalk from 'chalk';
import debug from 'debug';

interface ClaudeMCPServer {
  args: string[];
  capabilities?: string[];
  command: string;
  env?: Record<string, string>;
}

interface ClaudeDesktopConfig {
  mcpServers: Record<string, ClaudeMCPServer>;
}

const log = debug('auth0-mcp:claude-init-config');

export async function findAndUpdatedClaudeConfig() {
  const resolvedConfigPath = await getClaudeConfigPath();
  await updateClaudeConfig(resolvedConfigPath);
  console.log(
    `${chalk.green('✓')} Auth0 MCP server configured. ${chalk.yellow('Restart Claude Desktop')} to apply changes.`
  );
}

export async function getClaudeConfigPath(): Promise<string> {
  let configDir: string;

  switch (process.platform) {
    case 'darwin': // macOS
      configDir = path.join(os.homedir(), 'Library', 'Application Support', 'Claude');
      break;
    case 'win32': // Windows
      const appData = process.env.APPDATA;
      if (!appData) {
        throw new Error('APPDATA environment variable not set');
      }
      configDir = path.join(appData, 'Claude');
      break;
    case 'linux': // Linux
      configDir = path.join(os.homedir(), '.config', 'Claude');
      break;
    default:
      throw new Error(`Unsupported operating system: ${process.platform}`);
  }

  try {
    await fs.promises.mkdir(configDir, { recursive: true });
  } catch (err) {
    throw new Error(`Failed to create config directory: ${(err as Error).message}`);
  }
  return path.join(configDir, 'claude_desktop_config.json');
}

async function updateClaudeConfig(configPath: string) {
  let config: ClaudeDesktopConfig = { mcpServers: {} };
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
    args: ['@auth0/auth0-mcp-server', 'run'],
    capabilities: ['tools'],
    env: {
      DEBUG: 'auth0-mcp:*',
      PATH: process.env.PATH || '',
    },
  };

  try {
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
    log(`Updated Claude Desktop config file at: ${configPath}`);
  } catch (error) {
    console.error(`Error writing config file: ${(error as Error).message}`);
  }
}
