import * as fs from 'fs';
import * as path from 'path';
import { parse as dotenvParse } from 'dotenv';
import { log } from './logger.js';

const CREDENTIAL_FILE_MODE = 0o600;
const MAX_ENV_FILE_SIZE_BYTES = 1024 * 1024; // 1 MB

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

  // Symlink check for directory path
  const allowedDir = fs.realpathSync(path.resolve(options?.allowedDir ?? process.cwd()));
  const envFile = options?.filePath || path.join(allowedDir, '.env.local');

  // Path traversal protection: ensure the resolved file path is within the allowed directory
  const resolvedPath = path.resolve(allowedDir, envFile);
  if (!resolvedPath.startsWith(allowedDir + path.sep) && resolvedPath !== allowedDir) {
    throw new Error('Security error: file path resolves outside the allowed directory');
  }
  const fileExisted = fs.existsSync(resolvedPath);
  const incomingKeys = new Set(Object.keys(credentials));
  let content: string;

  if (fileExisted) {
    const realPath = fs.realpathSync(resolvedPath);

    // Symlink check for file path, type, and size checks on existing file in these following statements
    if (!realPath.startsWith(allowedDir + path.sep) && realPath !== allowedDir) {
      throw new Error('Security error: file path resolves outside the allowed directory');
    }
    const stat = fs.statSync(resolvedPath);
    if (!stat.isFile()) {
      throw new Error('Security error: env file path is not a regular file');
    }
    if (stat.size > MAX_ENV_FILE_SIZE_BYTES) {
      throw new Error(
        `Security error: env file exceeds maximum allowed size of ${MAX_ENV_FILE_SIZE_BYTES / 1024 / 1024} MB. ` +
          'The file may be corrupted or malicious. Remove or truncate it before retrying.'
      );
    }

    let existingContent: string;
    try {
      existingContent = fs.readFileSync(resolvedPath, 'utf-8');
    } catch {
      throw new Error('Failed to read existing env file');
    }

    const updatedLines = commentOutConflictingKeys(existingContent, incomingKeys);
    const newSection =
      `\n# Auth0 Credentials (Generated: ${new Date().toISOString()})\n` +
      Object.entries(credentials)
        .map(([key, value]) => `${key}=${value}`)
        .join('\n') +
      '\n';
    content = updatedLines + newSection;
    log(`Appending credentials to existing file: ${resolvedPath}`);
  } else {
    const header = `# Auth0 Credentials (Generated: ${new Date().toISOString()})\n`;
    content =
      header +
      Object.entries(credentials)
        .map(([key, value]) => `${key}=${value}`)
        .join('\n') +
      '\n';
    log(`Creating new file with credentials: ${resolvedPath}`);
  }

  const tmpFile = resolvedPath + '.tmp';
  try {
    fs.writeFileSync(tmpFile, content, { encoding: 'utf-8', mode: CREDENTIAL_FILE_MODE });
    // rename is atomic on POSIX (same filesystem): the target either fully
    // appears or doesn't, preventing a half-written .env file on crash
    fs.renameSync(tmpFile, resolvedPath);
  } catch {
    // tmpFile may or may not exist at this point (writeFileSync could have failed before creating it, or partway through)
    // Suppress cleanup errors so they don't shadow the original write failure.
    try {
      fs.unlinkSync(tmpFile);
    } catch {
      /* ignore */
    }
    throw new Error('Failed to write env file');
  }

  // Enforce restrictive permissions. On POSIX this is a hard requirement —
  // throw if chmod fails or if the resulting on-disk mode doesn't match.
  // Windows has no meaningful chmod, so skip verification there.
  if (process.platform !== 'win32') {
    fs.chmodSync(resolvedPath, CREDENTIAL_FILE_MODE);
    const actualMode = fs.statSync(resolvedPath).mode & 0o777;
    if (actualMode !== CREDENTIAL_FILE_MODE) {
      throw new Error(
        `Security error: expected file mode ${CREDENTIAL_FILE_MODE.toString(8)}, got ${actualMode.toString(8)}`
      );
    }
    log(`Set file permissions to 600 (owner read/write only) for: ${resolvedPath}`);
  }

  // Ensure .gitignore includes the env file
  if (options?.createGitignore !== false) {
    ensureGitignore(path.dirname(resolvedPath), path.basename(resolvedPath));
  }

  return {
    file_path: resolvedPath,
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
    const stat = fs.statSync(filePath);
    if (!stat.isFile() || stat.size > MAX_ENV_FILE_SIZE_BYTES) return {};
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
