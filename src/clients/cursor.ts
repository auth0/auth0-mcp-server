import * as path from 'path';
import * as os from 'os';
import { BaseClientManager } from './base.js';
import { getPlatformPath, ensureDir } from './utils.js';

/**
 * Client manager implementation for Cursor.
 *
 * Responsible for configuring and managing the MCP server integration
 * for the Cursor code editor application.
 *
 * @see {@link https://www.cursor.com/ | Cursor Official Website}
 */
export class CursorClientManager extends BaseClientManager {
  constructor() {
    super({
      clientType: 'cursor',
      displayName: 'Cursor',
    });
  }

  /**
   * Returns the path to the Cursor configuration file.
   *
   * Resolves the platform-specific configuration directory,
   * ensures the directory exists on disk, and constructs the full path
   * to the MCP configuration file.
   *
   * @returns The absolute path to the configuration file.
   */
  getConfigPath(): string {
    const configDir = getPlatformPath({
      darwin: path.join(os.homedir(), '.cursor'),
      win32: path.join('{APPDATA}', '.cursor'),
      linux: path.join(os.homedir(), '.cursor'),
    });

    ensureDir(configDir);

    return path.join(configDir, 'mcp.json');
  }
}
