import * as fs from 'fs';
import * as path from 'path';
import { log } from './logger.js';

/**
 * Credentials to be written to environment file
 */
export interface Credentials {
  client_id: string;
  client_secret?: string;
  domain: string;
  callback_url?: string;
  [key: string]: string | undefined;
}

/**
 * Result of writing credentials to file
 */
export interface CredentialsWriteResult {
  file_path: string;
  env_var_names: string[];
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
}

/**
 * Writes Auth0 credentials to an environment file (default: .env.local)
 *
 * File behavior:
 * - If the file does NOT exist: creates a new file with the credentials
 * - If the file DOES exist: appends credentials to the end of the file,
 *   preserving all existing content. Existing variables are NOT overwritten
 *   or deduplicated — duplicate entries may result if called multiple times
 *   for the same application.
 *
 * Additional behavior:
 * - Sets restrictive file permissions (chmod 600 — owner read/write only)
 * - Ensures .gitignore includes the env file (unless createGitignore is false)
 * - Prevents credentials from appearing in MCP client logs
 *
 * @param credentials - The credentials to write
 * @param options - Optional configuration for file path, gitignore creation, etc.
 * @returns Information about where credentials were written, including whether the file was created or appended to
 */
export async function writeCredentialsToEnv(
  credentials: Credentials,
  options?: WriteCredentialsOptions
): Promise<CredentialsWriteResult> {
  const cwd = process.cwd();
  const envFile = options?.filePath || path.join(cwd, '.env.local');
  const fileExisted = fs.existsSync(envFile);

  // Prepare environment variables
  const envVars: Record<string, string> = {
    AUTH0_CLIENT_ID: credentials.client_id,
    AUTH0_DOMAIN: credentials.domain,
  };

  if (credentials.client_secret) {
    envVars.AUTH0_CLIENT_SECRET = credentials.client_secret;
  }

  if (credentials.callback_url) {
    envVars.AUTH0_CALLBACK_URL = credentials.callback_url;
  }

  // Format as .env content
  const timestamp = new Date().toISOString();
  const header = `\n# Auth0 Credentials (Generated: ${timestamp})\n`;
  const content =
    header +
    Object.entries(envVars)
      .map(([key, value]) => `${key}=${value}`)
      .join('\n') +
    '\n';

  // Always append if file exists to preserve existing environment variables
  if (fileExisted) {
    log(`Appending credentials to existing file: ${envFile}`);
    fs.appendFileSync(envFile, content, 'utf-8');
  } else {
    log(`Creating new file with credentials: ${envFile}`);
    fs.writeFileSync(envFile, content, 'utf-8');
  }

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
    env_var_names: Object.keys(envVars),
    file_created: !fileExisted,
  };
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
 * Detects existing environment files in the current directory
 *
 * @returns Path to the first found env file, or null if none exist
 */
export function detectExistingEnvFile(): string | null {
  const cwd = process.cwd();
  const envFileNames = ['.env.local', '.env', '.env.development.local', '.env.development'];

  for (const fileName of envFileNames) {
    const filePath = path.join(cwd, fileName);
    if (fs.existsSync(filePath)) {
      log(`Detected existing env file: ${filePath}`);
      return filePath;
    }
  }

  return null;
}
