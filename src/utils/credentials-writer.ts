import * as fs from 'fs';
import * as path from 'path';
import { log } from './logger.js';

/**
 * Result of writing credentials to file
 */
export interface CredentialsWriteResult {
  file_path: string;
  keys_written: string[];
  file_created: boolean;
}

/**
 * Options for writing credentials
 */
export interface WriteCredentialsOptions {
  /** Full or relative path to the env file. Defaults to `.env.local` in the current working directory. */
  filePath?: string;
  /** Whether to add the env file to .gitignore. Defaults to true. */
  createGitignore?: boolean;
  /** Directory the resolved file path must stay within. Defaults to the current working directory. */
  allowedDir?: string;
}

/**
 * Writes Auth0 credentials to an environment file (default: .env.local)
 *
 * File behavior:
 * - If the file does NOT exist: creates a new file with the credentials
 * - If the file DOES exist: comments out any lines whose keys conflict with
 *   the incoming credentials, preserves all other content (comments, blank
 *   lines, unrelated variables), and appends the new credentials at the end.
 *
 * Additional behavior:
 * - Sets restrictive file permissions (chmod 600 — owner read/write only)
 * - Ensures .gitignore includes the env file (unless createGitignore is false)
 * - Prevents credentials from appearing in MCP client logs
 *
 * @param credentials - The credentials to write
 * @param options - Optional configuration for file path and gitignore creation
 * @returns Information about where credentials were written, including whether the file was created or updated
 */
export async function writeCredentialsToEnv(
  credentials: Record<string, string>,
  options?: WriteCredentialsOptions
): Promise<CredentialsWriteResult> {
  const allowedDir = path.resolve(options?.allowedDir ?? process.cwd());
  const envFile = options?.filePath || path.join(allowedDir, '.env.local');

  // Path traversal protection: ensure the resolved file path is within the allowed directory
  const resolvedPath = path.resolve(allowedDir, envFile);
  if (!resolvedPath.startsWith(allowedDir + path.sep) && resolvedPath !== allowedDir) {
    throw new Error(
      `Security error: file path "${envFile}" resolves outside the allowed directory. ` +
        `Resolved path: "${resolvedPath}", allowed directory: "${allowedDir}"`
    );
  }

  const fileExisted = fs.existsSync(envFile);
  const incomingKeys = new Set(Object.keys(credentials));

  let content: string;

  if (fileExisted) {
    const existingContent = fs.readFileSync(envFile, 'utf-8');
    const updatedLines = commentOutConflictingKeys(existingContent, incomingKeys);
    const newSection =
      `\n# Auth0 Credentials (Generated: ${new Date().toISOString()})\n` +
      Object.entries(credentials)
        .map(([key, value]) => `${key}=${value}`)
        .join('\n') +
      '\n';
    content = updatedLines + newSection;
    log(`Appending credentials to existing file: ${envFile}`);
  } else {
    const header = `# Auth0 Credentials (Generated: ${new Date().toISOString()})\n`;
    content =
      header +
      Object.entries(credentials)
        .map(([key, value]) => `${key}=${value}`)
        .join('\n') +
      '\n';
    log(`Creating new file with credentials: ${envFile}`);
  }

  fs.writeFileSync(envFile, content, 'utf-8');

  // Set restrictive permissions (owner read/write only)
  try {
    fs.chmodSync(envFile, 0o600);
    log(`Set file permissions to 600 (owner read/write only) for: ${envFile}`);
  } catch (error) {
    // chmod may not work on all platforms (e.g., Windows)
    log(`Warning: Could not set file permissions for ${envFile}: ${error}`);
  }

  // Ensure .gitignore includes the env file
  if (options?.createGitignore !== false) {
    const envFileDir = path.dirname(path.resolve(envFile));
    ensureGitignore(envFileDir, path.basename(envFile));
  }

  return {
    file_path: envFile,
    keys_written: Object.keys(credentials),
    file_created: !fileExisted,
  };
}

/**
 * Comments out lines in existing env content whose keys conflict with incoming credentials.
 * Preserves all other content (comments, blank lines, unrelated variables) as-is.
 */
function commentOutConflictingKeys(existingContent: string, incomingKeys: Set<string>): string {
  const lines = existingContent.split('\n');
  const result = lines.map((line) => {
    const match = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=/);
    if (match && incomingKeys.has(match[1])) {
      return `# ${line}`;
    }
    return line;
  });
  return result.join('\n');
}

/**
 * Ensures the .gitignore file includes the specified env file pattern
 *
 * @param cwd - Current working directory
 * @param envFileName - Name of the env file to add to .gitignore
 */
function ensureGitignore(cwd: string, envFileName: string): void {
  const gitignorePath = path.join(cwd, '.gitignore');

  try {
    if (fs.existsSync(gitignorePath)) {
      const content = fs.readFileSync(gitignorePath, 'utf-8');

      // Check if the env file is already ignored
      if (!content.split('\n').some((line) => line.trim() === envFileName)) {
        log(`Adding ${envFileName} to .gitignore`);
        fs.appendFileSync(gitignorePath, `\n# Auth0 credentials\n${envFileName}\n`, 'utf-8');
      } else {
        log(`${envFileName} already in .gitignore`);
      }
    } else {
      log(`Creating .gitignore with ${envFileName}`);
      fs.writeFileSync(gitignorePath, `# Auth0 credentials\n${envFileName}\n`, 'utf-8');
    }
  } catch (error) {
    log(`Warning: Could not update .gitignore: ${error}`);
  }
}

/**
 * Parses an env file into a key/value map.
 *
 * @param filePath - Path to the env file
 * @returns Map of key/value pairs from the file, or an empty object if the file does not exist
 */
export function parseEnvFile(filePath: string): Record<string, string> {
  if (!fs.existsSync(filePath)) return {};
  const result: Record<string, string> = {};
  for (const line of fs.readFileSync(filePath, 'utf-8').split('\n')) {
    const match = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)/);
    if (match) result[match[1]] = match[2];
  }
  return result;
}

/**
 * Detects existing environment files in the current directory
 *
 * @returns Path to the first found env file, or null if none exist
 */
export function detectExistingEnvFile(dir?: string): string | null {
  const baseDir = dir ?? process.cwd();
  const envFileNames = ['.env.local', '.env', '.env.development.local', '.env.development'];

  for (const fileName of envFileNames) {
    const filePath = path.join(baseDir, fileName);
    if (fs.existsSync(filePath)) {
      log(`Detected existing env file: ${filePath}`);
      return filePath;
    }
  }

  return null;
}
