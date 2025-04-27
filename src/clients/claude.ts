import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import chalk from 'chalk';
import { log } from '../utils/logger.js';
import { cliOutput } from '../utils/terminal.js';
import type { ClientOptions } from '../utils/types.js';

interface ClaudeMCPServer {
  args: string[];
  capabilities?: string[];
  command: string;
  env?: Record<string, string>;
}

interface ClaudeDesktopConfig {
  mcpServers: Record<string, ClaudeMCPServer>;
}

export const findAndUpdateClaudeConfig = async (options: ClientOptions) => {
  const resolvedConfigPath = await getClaudeConfigPath();
  await updateClaudeConfig(resolvedConfigPath, options);
  cliOutput(
    `\n${chalk.green('✓')} Auth0 MCP server configured. ${chalk.yellow('Restart Claude Desktop')} to apply changes.\n`
  );
};

export async function getClaudeConfigPath(): Promise<string> {
  let configDir: string;

  switch (process.platform) {
    case 'darwin': // macOS
      configDir = path.join(os.homedir(), 'Library', 'Application Support', 'Claude');
      break;
    case 'win32': {
      // Windows
      const APPDATA = process.env.APPDATA;
      if (!APPDATA) {
        throw new Error('APPDATA environment variable not set');
      }
      configDir = path.join(APPDATA, 'Claude');
      break;
    }
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

async function updateClaudeConfig(configPath: string, options: ClientOptions) {
  let config: ClaudeDesktopConfig = { mcpServers: {} };
  if (fs.existsSync(configPath)) {
    const configData = fs.readFileSync(configPath, 'utf-8');
    config = JSON.parse(configData);
  }

  // Build args array
  const args = ['-y', '@auth0/auth0-mcp-server', 'run', '--tools', `${options.tools.join(',')}`];

  // Add read-only flag if specified
  if (options.readOnly) {
    args.push('--read-only');
  }

  config.mcpServers['auth0'] = {
    command: 'npx',
    args,
    capabilities: ['tools'],
    env: {
      DEBUG: 'auth0-mcp',
    },
  };

  fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
  log(`Updated Claude Desktop config file at: ${configPath}`);
}
