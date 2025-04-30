import * as path from 'path';
import * as os from 'os';
import { BaseClientManager } from './base.js';
import { getPlatformPath, ensureDir } from './utils.js';

/**
 * Client manager implementation for Windsurf.
 *
 * Responsible for configuring and managing the MCP server integration
 * for the Windsurf Editor application.
 *
 * @see {@link https://windsurf.com/editor | Windsurf Editor}
 */
export class WindsurfClientManager extends BaseClientManager {
  constructor() {
    super({
      clientType: 'windsurf',
      displayName: 'Windsurf',
    });
  }

  /**
   * Returns the path to the Windsurf configuration file.
   *
   * Resolves the platform-specific configuration directory,
   * ensures the directory exists on disk, and constructs the full path
   * to the MCP configuration file.
   *
   * @returns The absolute path to the configuration file.
   */
  getConfigPath(): string {
    const configDir = getPlatformPath({
      darwin: path.join(os.homedir(), '.codeium', 'windsurf'),
      win32: path.join('{APPDATA}', '.codeium', 'windsurf'),
      linux: path.join(os.homedir(), '.codeium', 'windsurf'),
    });

    ensureDir(configDir);
    return path.join(configDir, 'mcp_config.json');
  }
}
