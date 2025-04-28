import * as fs from 'fs';
import type { PlatformPaths } from './types.js';

/**
 * Ensures that a directory exists on disk.
 *
 * If the directory does not already exist, it will be created recursively.
 * Throws an error if the directory cannot be created.
 *
 * @param dir - The absolute path of the directory to ensure exists.
 * @throws Error if directory creation fails due to filesystem errors.
 */
export function ensureDir(dir: string): void {
  try {
    fs.mkdirSync(dir, { recursive: true });
  } catch (err) {
    throw new Error(`Failed to create directory: ${(err as Error).message}`);
  }
}

/**
 * Resolves the appropriate configuration directory path for the current operating system.
 *
 * Accepts an object mapping platform identifiers (`darwin`, `win32`, `linux`) to path templates.
 * On Windows, replaces `{APPDATA}` placeholders with the actual APPDATA environment variable.
 *
 * @param paths - An object containing platform-specific path templates.
 * @returns The resolved configuration path for the current platform.
 * @throws Error if the platform is unsupported or required environment variables are missing.
 */
export function getPlatformPath(paths: PlatformPaths): string {
  switch (process.platform) {
    case 'darwin':
      return paths.darwin;
    case 'win32': {
      const APPDATA = process.env.APPDATA;
      if (!APPDATA) {
        throw new Error('APPDATA environment variable not set');
      }
      return paths.win32.replace('{APPDATA}', APPDATA);
    }
    case 'linux':
      return paths.linux;
    default:
      throw new Error(`Unsupported operating system: ${process.platform}`);
  }
}
