import * as path from 'path';
import * as os from 'os';
import { BaseClientManager } from './base.js';
import { getPlatformPath, ensureDir } from './utils.js';

/**
 * Client manager implementation for Claude Desktop.
 *
 * Responsible for configuring and managing the MCP server integration
 * for the Claude Desktop application.
 *
 * @see {@link https://claude.ai/download | Claude Desktop Download}
 */
export class ClaudeClientManager extends BaseClientManager {
  constructor() {
    super({
      clientType: 'claude',
      displayName: 'Claude Desktop',
      capabilities: ['tools'],
    });
  }

  /**
   * Returns the path to the Claude Desktop configuration file.
   *
   * Resolves the platform-specific configuration directory,
   * ensures the directory exists on disk, and constructs the full path
   * to the Claude Desktop configuration file.
   *
   * @returns The absolute path to the configuration file.
   */
  getConfigPath(): string {
    const configDir = getPlatformPath({
      darwin: path.join(os.homedir(), 'Library', 'Application Support', 'Claude'),
      win32: path.join('{APPDATA}', 'Claude'), // assumes getPlatformPath resolves {APPDATA}
      linux: path.join(os.homedir(), '.config', 'Claude'),
    });

    ensureDir(configDir);

    return path.join(configDir, 'claude_desktop_config.json');
  }
}
