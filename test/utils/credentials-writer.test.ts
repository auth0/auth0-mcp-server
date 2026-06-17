import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
import {
  writeCredentialsToEnv,
  detectExistingEnvFile,
  parseEnvFile,
} from '../../src/utils/credentials-writer.js';

describe('credentials-writer', () => {
  const testDir = path.join(process.cwd(), 'test-credentials-output');
  const envFilePath = path.join(testDir, '.env.local');
  const gitignorePath = path.join(testDir, '.gitignore');

  beforeEach(() => {
    // Create test directory
    if (!fs.existsSync(testDir)) {
      fs.mkdirSync(testDir, { recursive: true });
    }
    // Change to test directory
    process.chdir(testDir);
  });

  afterEach(() => {
    // Change back to project root before cleaning up
    process.chdir(path.join(__dirname, '../..'));
    // Clean up test directory
    if (fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true, force: true });
    }
  });

  describe('writeCredentialsToEnv', () => {
    it('should create .env.local file with credentials', async () => {
      const credentials = {
        AUTH0_CLIENT_ID: 'test_client_id',
        AUTH0_CLIENT_SECRET: 'test_client_secret',
        AUTH0_DOMAIN: 'test.auth0.com',
        AUTH0_CALLBACK_URL: 'http://localhost:3000/callback',
      };

      const result = await writeCredentialsToEnv(credentials);

      expect(result.file_created).toBe(true);
      expect(result.file_path).toBe(envFilePath);
      expect(result.keys_written).toEqual([
        'AUTH0_CLIENT_ID',
        'AUTH0_CLIENT_SECRET',
        'AUTH0_DOMAIN',
        'AUTH0_CALLBACK_URL',
      ]);
      expect(result.permissions_set).toBe(true);
      expect(result.gitignore_updated).toBe(true);
      // Verify file content
      const content = fs.readFileSync(envFilePath, 'utf-8');
      expect(content).toContain('AUTH0_CLIENT_ID=test_client_id');
      expect(content).toContain('AUTH0_CLIENT_SECRET=test_client_secret');
      expect(content).toContain('AUTH0_DOMAIN=test.auth0.com');
      expect(content).toContain('AUTH0_CALLBACK_URL=http://localhost:3000/callback');
    });

    it('should append to existing .env.local file preserving all content', async () => {
      fs.writeFileSync(envFilePath, 'EXISTING_VAR=existing_value\n', 'utf-8');

      const credentials = {
        AUTH0_CLIENT_ID: 'test_client_id',
        AUTH0_CLIENT_SECRET: 'test_client_secret',
      };

      const result = await writeCredentialsToEnv(credentials);

      expect(result.file_created).toBe(false);

      const content = fs.readFileSync(envFilePath, 'utf-8');
      expect(content).toContain('EXISTING_VAR=existing_value');
      expect(content).toContain('AUTH0_CLIENT_ID=test_client_id');
      expect(content).toContain('AUTH0_CLIENT_SECRET=test_client_secret');
    });

    it('should comment out existing key and append new value', async () => {
      fs.writeFileSync(envFilePath, 'AUTH0_CLIENT_ID=old_value\n', 'utf-8');

      await writeCredentialsToEnv({ AUTH0_CLIENT_ID: 'new_value' });

      const content = fs.readFileSync(envFilePath, 'utf-8');
      expect(content).toContain('AUTH0_CLIENT_ID=new_value');
      expect(content).toContain('# AUTH0_CLIENT_ID=old_value');
    });

    it('should preserve comments and blank lines in existing file', async () => {
      fs.writeFileSync(
        envFilePath,
        '# This is a comment\n\nEXISTING_VAR=value\n# Another comment\n',
        'utf-8'
      );

      await writeCredentialsToEnv({ AUTH0_DOMAIN: 'test.auth0.com' });

      const content = fs.readFileSync(envFilePath, 'utf-8');
      expect(content).toContain('# This is a comment');
      expect(content).toContain('# Another comment');
      expect(content).toContain('EXISTING_VAR=value');
      expect(content).toContain('AUTH0_DOMAIN=test.auth0.com');
    });

    it('should create .gitignore if it does not exist', async () => {
      await writeCredentialsToEnv({ AUTH0_DOMAIN: 'test.auth0.com' });

      expect(fs.existsSync(gitignorePath)).toBe(true);
      const gitignoreContent = fs.readFileSync(gitignorePath, 'utf-8');
      expect(gitignoreContent).toContain('.env.local');
    });

    it('should append to existing .gitignore', async () => {
      fs.writeFileSync(gitignorePath, 'node_modules/\ndist/\n', 'utf-8');

      await writeCredentialsToEnv({ AUTH0_DOMAIN: 'test.auth0.com' });

      const gitignoreContent = fs.readFileSync(gitignorePath, 'utf-8');
      expect(gitignoreContent).toContain('node_modules/');
      expect(gitignoreContent).toContain('.env.local');
    });

    it('should not duplicate .env.local in .gitignore', async () => {
      fs.writeFileSync(gitignorePath, 'node_modules/\n.env.local\n', 'utf-8');

      await writeCredentialsToEnv({ AUTH0_DOMAIN: 'test.auth0.com' });

      const gitignoreContent = fs.readFileSync(gitignorePath, 'utf-8');
      expect(gitignoreContent.match(/\.env\.local/g)?.length).toBe(1);
    });

    it('should not duplicate the # Auth0 credentials comment when ensureGitignore is called multiple times', async () => {
      // Simulate the three calls that happen on a first write:
      // writeCredentialsToEnv adds .env.local, then env-credentials adds state/audit files.
      const { ensureGitignore } = await import('../../src/utils/credentials-writer.js');
      ensureGitignore(testDir, '.env.local');
      ensureGitignore(testDir, '.auth0-mcp-state.json');
      ensureGitignore(testDir, '.auth0-mcp-writes.log');

      const gitignoreContent = fs.readFileSync(gitignorePath, 'utf-8');
      expect(gitignoreContent.match(/# Auth0 credentials/g)?.length).toBe(1);
      expect(gitignoreContent).toContain('.env.local');
      expect(gitignoreContent).toContain('.auth0-mcp-state.json');
      expect(gitignoreContent).toContain('.auth0-mcp-writes.log');
    });

    it('should return gitignore_updated=true when .gitignore is newly created', async () => {
      const result = await writeCredentialsToEnv({ AUTH0_DOMAIN: 'test.auth0.com' });
      expect(result.gitignore_updated).toBe(true);
    });

    it('should return gitignore_updated=false when entry already exists in .gitignore', async () => {
      fs.writeFileSync(gitignorePath, 'node_modules/\n.env.local\n', 'utf-8');
      const result = await writeCredentialsToEnv({ AUTH0_DOMAIN: 'test.auth0.com' });
      expect(result.gitignore_updated).toBe(false);
    });

    it('should write only the keys provided', async () => {
      const result = await writeCredentialsToEnv({ AUTH0_CLIENT_ID: 'test_client_id' });

      expect(result.keys_written).toEqual(['AUTH0_CLIENT_ID']);

      const content = fs.readFileSync(envFilePath, 'utf-8');
      expect(content).toContain('AUTH0_CLIENT_ID=test_client_id');
      expect(content).not.toContain('AUTH0_CLIENT_SECRET');
    });

    it('should write to custom file path', async () => {
      const customPath = path.join(testDir, '.env.custom');

      const result = await writeCredentialsToEnv(
        { AUTH0_CLIENT_ID: 'test_client_id' },
        { filePath: customPath }
      );

      expect(result.file_path).toBe(customPath);
      expect(fs.existsSync(customPath)).toBe(true);
    });

    it('should reject file paths that traverse outside the working directory', async () => {
      let thrownError: Error | undefined;
      try {
        await writeCredentialsToEnv(
          { AUTH0_DOMAIN: 'test.auth0.com' },
          { filePath: '../../etc/evil-file' }
        );
      } catch (e) {
        thrownError = e as Error;
      }
      expect(thrownError).toBeDefined();
      expect(thrownError!.message).toContain('Security error: file path');
      expect(thrownError!.message).not.toContain('evil-file');
      expect(thrownError!.message).not.toContain(testDir);

      await expect(
        writeCredentialsToEnv({ AUTH0_DOMAIN: 'test.auth0.com' }, { filePath: '/tmp/evil-file' })
      ).rejects.toThrow('Security error: file path');
    });

    it('should throw a generic error when reading existing env file fails', async () => {
      fs.writeFileSync(envFilePath, 'EXISTING=value\n', 'utf-8');
      fs.chmodSync(envFilePath, 0o000);
      try {
        await expect(
          writeCredentialsToEnv({ AUTH0_DOMAIN: 'test.auth0.com' })
        ).rejects.toThrow('Failed to read existing env file');
      } finally {
        fs.chmodSync(envFilePath, 0o600);
      }
    });

    it('should throw when processing existing env file content exceeds time limit', async () => {
      fs.writeFileSync(envFilePath, 'EXISTING=value\n', 'utf-8');

      // Simulate elapsed time exceeding the 500ms threshold by making Date.now advance
      // by 501ms on the second call (after the processing starts).
      let callCount = 0;
      const realNow = Date.now();
      const dateSpy = vi.spyOn(Date, 'now').mockImplementation(() => {
        callCount++;
        return callCount === 1 ? realNow : realNow + 501;
      });

      try {
        await expect(
          writeCredentialsToEnv({ AUTH0_DOMAIN: 'test.auth0.com' })
        ).rejects.toThrow('exceeded time limit');
      } finally {
        dateSpy.mockRestore();
      }
    });

    it('should throw a generic error when writing env file fails', async () => {
      fs.chmodSync(testDir, 0o555);
      try {
        await expect(
          writeCredentialsToEnv({ AUTH0_DOMAIN: 'test.auth0.com' })
        ).rejects.toThrow('Failed to write env file');
      } finally {
        fs.chmodSync(testDir, 0o755);
      }
    });

    it('should allow file paths within the working directory', async () => {
      const subDir = path.join(testDir, 'config');
      fs.mkdirSync(subDir, { recursive: true });

      const result = await writeCredentialsToEnv(
        { AUTH0_CLIENT_ID: 'test_client_id' },
        { filePath: path.join(subDir, '.env') }
      );

      expect(result.file_created).toBe(true);
      expect(fs.existsSync(path.join(subDir, '.env'))).toBe(true);
    });

    it('should write to a project path outside the current working directory when allowedDir is set', async () => {
      // Simulate the real MCP flow: server cwd (testDir) differs from the user's project dir.
      const projectDir = path.join(__dirname, 'project-outside-cwd');
      fs.mkdirSync(projectDir, { recursive: true });
      const projectEnvPath = path.join(projectDir, '.env.local');

      try {
        expect(path.resolve(projectDir).startsWith(process.cwd() + path.sep)).toBe(false);

        const result = await writeCredentialsToEnv(
          { AUTH0_CLIENT_ID: 'test_client_id' },
          { filePath: projectEnvPath, allowedDir: projectDir }
        );

        expect(result.file_created).toBe(true);
        expect(result.file_path).toBe(projectEnvPath);
        expect(fs.existsSync(projectEnvPath)).toBe(true);
      } finally {
        fs.rmSync(projectDir, { recursive: true, force: true });
      }
    });

    it('should reject paths outside allowedDir even when within the working directory', async () => {
      const projectDir = path.join(testDir, 'project');
      fs.mkdirSync(projectDir, { recursive: true });

      await expect(
        writeCredentialsToEnv(
          { AUTH0_DOMAIN: 'test.auth0.com' },
          { filePath: path.join(testDir, '.env.local'), allowedDir: projectDir }
        )
      ).rejects.toThrow('Security error: file path');
    });

    it('should reject a symlink inside allowedDir that points outside it', async () => {
      const outsideDir = path.join(testDir, '..', 'outside-symlink-target');
      fs.mkdirSync(outsideDir, { recursive: true });
      const outsideFile = path.join(outsideDir, '.env.outside');
      fs.writeFileSync(outsideFile, 'OUTSIDE=value\n', 'utf-8');

      const symlinkPath = path.join(testDir, '.env.symlink');
      fs.symlinkSync(outsideFile, symlinkPath);

      try {
        await expect(
          writeCredentialsToEnv(
            { AUTH0_DOMAIN: 'test.auth0.com' },
            { filePath: symlinkPath, allowedDir: testDir }
          )
        ).rejects.toThrow('Security error: file path');
      } finally {
        try { fs.unlinkSync(symlinkPath); } catch { /* ignore */ }
        fs.rmSync(outsideDir, { recursive: true, force: true });
      }
    });

    it('should not leave a .tmp file after a successful write', async () => {
      await writeCredentialsToEnv({ AUTH0_DOMAIN: 'test.auth0.com' });

      expect(fs.existsSync(envFilePath)).toBe(true);
      expect(fs.existsSync(envFilePath + '.tmp')).toBe(false);
    });

    it('should set chmod 600 on the env file', async () => {
      await writeCredentialsToEnv({ AUTH0_DOMAIN: 'test.auth0.com' });

      const stat = fs.statSync(envFilePath);
      // 0o100600 = regular file + owner read/write
      expect(stat.mode & 0o777).toBe(0o600);
    });
  });

  describe('parseEnvFile', () => {
    it('should parse key=value pairs from an env file', () => {
      fs.writeFileSync(envFilePath, 'FOO=bar\nBAZ=qux\n', 'utf-8');

      const result = parseEnvFile(envFilePath);

      expect(result).toEqual({ FOO: 'bar', BAZ: 'qux' });
    });

    it('should return empty object when file does not exist', () => {
      const result = parseEnvFile('/nonexistent/.env');
      expect(result).toEqual({});
    });

    it('should ignore comment lines and blank lines', () => {
      fs.writeFileSync(envFilePath, '# comment\n\nFOO=bar\n', 'utf-8');

      const result = parseEnvFile(envFilePath);

      expect(result).toEqual({ FOO: 'bar' });
    });

    it('should preserve values containing = characters', () => {
      fs.writeFileSync(envFilePath, 'FOO=bar=baz\n', 'utf-8');

      const result = parseEnvFile(envFilePath);

      expect(result).toEqual({ FOO: 'bar=baz' });
    });

    it('should return empty object when readFileSync throws', () => {
      fs.writeFileSync(envFilePath, 'FOO=bar\n', 'utf-8');
      fs.chmodSync(envFilePath, 0o000);
      try {
        expect(parseEnvFile(envFilePath)).toEqual({});
      } finally {
        fs.chmodSync(envFilePath, 0o600);
      }
    });

    it('should strip surrounding quotes from values', () => {
      fs.writeFileSync(envFilePath, 'FOO="hello world"\nBAR=\'single\'\n', 'utf-8');

      expect(parseEnvFile(envFilePath)).toEqual({ FOO: 'hello world', BAR: 'single' });
    });

    it('should ignore inline comments after unquoted values', () => {
      fs.writeFileSync(envFilePath, 'FOO=bar # a comment\n', 'utf-8');

      expect(parseEnvFile(envFilePath)).toEqual({ FOO: 'bar' });
    });
  });

  describe('detectExistingEnvFile', () => {
    it('should detect .env.local if it exists', () => {
      fs.writeFileSync(envFilePath, 'TEST=value\n', 'utf-8');

      const detected = detectExistingEnvFile();

      expect(detected).toBe(envFilePath);
    });

    it('should detect .env if .env.local does not exist', () => {
      const envPath = path.join(testDir, '.env');
      fs.writeFileSync(envPath, 'TEST=value\n', 'utf-8');

      const detected = detectExistingEnvFile();

      expect(detected).toBe(envPath);
    });

    it('should return null if no env files exist', () => {
      const detected = detectExistingEnvFile();

      expect(detected).toBeNull();
    });

    it('should prioritize .env.local over .env', () => {
      const envPath = path.join(testDir, '.env');
      fs.writeFileSync(envPath, 'TEST=value\n', 'utf-8');
      fs.writeFileSync(envFilePath, 'TEST=value\n', 'utf-8');

      const detected = detectExistingEnvFile();

      expect(detected).toBe(envFilePath);
    });
  });
});
