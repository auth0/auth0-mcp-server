import * as path from 'path';
import * as os from 'os';
import { BaseClientManager } from './base.js';
import { getPlatformPath, ensureDir } from './utils.js';

/**
 * Client manager implementation for Gemini CLI.
 *
 * Responsible for configuring and managing the MCP server integration
 * for the Gemini CLI.
 *
 * @see {@link https://geminicli.com/docs/ | Gemini CLI Docs}
 */
export class GeminiClientManager extends BaseClientManager {
  constructor() {
    super({
      clientType: 'gemini',
      displayName: 'Gemini CLI',
    });
  }

  /**
   * Returns the path to the Gemini CLI configuration file.
   *
   * Resolves the platform-specific configuration directory,
   * ensures the directory exists on disk, and constructs the full path
   * to the Gemini CLI configuration file.
   *
   * @returns The absolute path to the configuration file.
   */
  getConfigPath(): string {
    const configDir = getPlatformPath({
      darwin: path.join(os.homedir(), '.gemini'),
      win32: path.join('{APPDATA}', '.gemini'),
      linux: path.join(os.homedir(), '.gemini'),
    });

    ensureDir(configDir);

    return path.join(configDir, 'settings.json');
  }
}
