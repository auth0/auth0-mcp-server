import * as fs from 'fs';
import * as path from 'path';
import { parse as dotenvParse } from 'dotenv';
import { log } from './logger.js';

const ENV_PARSE_TIMEOUT_MS = 500;

function withTimeout<T>(fn: () => T, timeoutMs: number, label: string): T {
  const start = Date.now();
  const result = fn();
  if (Date.now() - start > timeoutMs) {
    throw new Error(`${label} exceeded time limit`);
  }
  return result;
}

/**
 * Result of writing credentials to file
 */
export interface CredentialsWriteResult {
  file_path: string;
  keys_written: string[];
  file_created: boolean;
  permissions_set: boolean;
  gitignore_updated: boolean;
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
    throw new Error('Security error: file path resolves outside the allowed directory');
  }
  // Symlink protection: if the target already exists, verify its dereferenced real path is also within allowedDir
  if (fs.existsSync(resolvedPath)) {
    const realPath = fs.realpathSync(resolvedPath);
    if (!realPath.startsWith(allowedDir + path.sep) && realPath !== allowedDir) {
      throw new Error('Security error: file path resolves outside the allowed directory');
    }
  }

  const fileExisted = fs.existsSync(envFile);
  const incomingKeys = new Set(Object.keys(credentials));

  let content: string;

  if (fileExisted) {
    let existingContent: string;
    try {
      existingContent = fs.readFileSync(envFile, 'utf-8');
    } catch {
      throw new Error('Failed to read existing env file');
    }
    let updatedLines: string;
    try {
      updatedLines = withTimeout(
        () => commentOutConflictingKeys(existingContent, incomingKeys),
        ENV_PARSE_TIMEOUT_MS,
        'Env file processing'
      );
    } catch (e: unknown) {
      throw e instanceof Error ? e : new Error('Failed to process existing env file');
    }
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

  const tmpFile = envFile + '.tmp';
  try {
    fs.writeFileSync(tmpFile, content, { encoding: 'utf-8', mode: 0o600 });
    // rename is atomic on POSIX (same filesystem): the target either fully
    // appears or doesn't, preventing a half-written .env file on crash
    fs.renameSync(tmpFile, envFile);
  } catch {
    // tmpFile may or may not exist at this point (writeFileSync could have failed before creating it, or partway through)
    // Suppress cleanup errors so they don't shadow the original write failure.
    try { fs.unlinkSync(tmpFile); } catch { /* ignore */ }
    throw new Error('Failed to write env file');
  }

  // Set restrictive permissions (owner read/write only)
  let permissions_set = false;
  try {
    fs.chmodSync(envFile, 0o600);
    permissions_set = true;
    log(`Set file permissions to 600 (owner read/write only) for: ${envFile}`);
  } catch (error) {
    // chmod may not work on all platforms (e.g., Windows)
    log(`Warning: Could not set file permissions for ${envFile}: ${error}`);
  }

  // Ensure .gitignore includes the env file
  let gitignore_updated = false;
  if (options?.createGitignore !== false) {
    const envFileDir = path.dirname(path.resolve(envFile));
    gitignore_updated = ensureGitignore(envFileDir, path.basename(envFile));
  }

  return {
    file_path: envFile,
    keys_written: Object.keys(credentials),
    file_created: !fileExisted,
    permissions_set,
    gitignore_updated,
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
export function ensureGitignore(cwd: string, envFileName: string): boolean {
  const gitignorePath = path.join(cwd, '.gitignore');

  try {
    if (fs.existsSync(gitignorePath)) {
      const content = fs.readFileSync(gitignorePath, 'utf-8');

      // Check if the env file is already ignored
      if (!content.split('\n').some((line) => line.trim() === envFileName)) {
        log(`Adding ${envFileName} to .gitignore`);
        const hasAuthComment = content.includes('# Auth0 credentials');
        const header = hasAuthComment ? '' : '\n# Auth0 credentials';
        fs.appendFileSync(gitignorePath, `${header}\n${envFileName}\n`, 'utf-8');
        return true;
      } else {
        log(`${envFileName} already in .gitignore`);
        return false;
      }
    } else {
      log(`Creating .gitignore with ${envFileName}`);
      fs.writeFileSync(gitignorePath, `# Auth0 credentials\n${envFileName}\n`, 'utf-8');
      return true;
    }
  } catch (error) {
    log(`Warning: Could not update .gitignore: ${error}`);
    return false;
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
  try {
    return dotenvParse(fs.readFileSync(filePath, 'utf-8'));
  } catch {
    return {};
  }
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
