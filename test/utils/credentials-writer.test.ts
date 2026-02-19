import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import {
  writeCredentialsToEnv,
  detectExistingEnvFile,
  type Credentials,
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
    // Clean up test directory
    if (fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true, force: true });
    }
    // Change back to project root
    process.chdir(path.join(__dirname, '../..'));
  });

  describe('writeCredentialsToEnv', () => {
    it('should create .env.local file with credentials', async () => {
      const credentials: Credentials = {
        client_id: 'test_client_id',
        client_secret: 'test_client_secret',
        domain: 'test.auth0.com',
        callback_url: 'http://localhost:3000/callback',
      };

      const result = await writeCredentialsToEnv(credentials);

      expect(result.file_created).toBe(true);
      expect(result.file_path).toBe(envFilePath);
      expect(result.env_var_names).toEqual([
        'AUTH0_CLIENT_ID',
        'AUTH0_DOMAIN',
        'AUTH0_CLIENT_SECRET',
        'AUTH0_CALLBACK_URL',
      ]);

      // Verify file content
      const content = fs.readFileSync(envFilePath, 'utf-8');
      expect(content).toContain('AUTH0_CLIENT_ID=test_client_id');
      expect(content).toContain('AUTH0_CLIENT_SECRET=test_client_secret');
      expect(content).toContain('AUTH0_DOMAIN=test.auth0.com');
      expect(content).toContain('AUTH0_CALLBACK_URL=http://localhost:3000/callback');
    });

    it('should append to existing .env.local file', async () => {
      // Create initial file with existing content
      const existingContent = 'EXISTING_VAR=existing_value\n';
      fs.writeFileSync(envFilePath, existingContent, 'utf-8');

      const credentials: Credentials = {
        client_id: 'test_client_id',
        client_secret: 'test_client_secret',
        domain: 'test.auth0.com',
      };

      const result = await writeCredentialsToEnv(credentials);

      expect(result.file_created).toBe(false);
      expect(result.file_path).toBe(envFilePath);

      // Verify both old and new content exist
      const content = fs.readFileSync(envFilePath, 'utf-8');
      expect(content).toContain('EXISTING_VAR=existing_value');
      expect(content).toContain('AUTH0_CLIENT_ID=test_client_id');
      expect(content).toContain('AUTH0_CLIENT_SECRET=test_client_secret');
    });

    it('should create .gitignore if it does not exist', async () => {
      const credentials: Credentials = {
        client_id: 'test_client_id',
        domain: 'test.auth0.com',
      };

      await writeCredentialsToEnv(credentials);

      expect(fs.existsSync(gitignorePath)).toBe(true);
      const gitignoreContent = fs.readFileSync(gitignorePath, 'utf-8');
      expect(gitignoreContent).toContain('.env.local');
    });

    it('should append to existing .gitignore', async () => {
      // Create existing .gitignore
      const existingGitignore = 'node_modules/\ndist/\n';
      fs.writeFileSync(gitignorePath, existingGitignore, 'utf-8');

      const credentials: Credentials = {
        client_id: 'test_client_id',
        domain: 'test.auth0.com',
      };

      await writeCredentialsToEnv(credentials);

      const gitignoreContent = fs.readFileSync(gitignorePath, 'utf-8');
      expect(gitignoreContent).toContain('node_modules/');
      expect(gitignoreContent).toContain('.env.local');
    });

    it('should not duplicate .env.local in .gitignore', async () => {
      // Create .gitignore that already contains .env.local
      const existingGitignore = 'node_modules/\n.env.local\n';
      fs.writeFileSync(gitignorePath, existingGitignore, 'utf-8');

      const credentials: Credentials = {
        client_id: 'test_client_id',
        domain: 'test.auth0.com',
      };

      await writeCredentialsToEnv(credentials);

      const gitignoreContent = fs.readFileSync(gitignorePath, 'utf-8');
      const matches = gitignoreContent.match(/\.env\.local/g);
      expect(matches?.length).toBe(1);
    });

    it('should handle credentials without client_secret', async () => {
      const credentials: Credentials = {
        client_id: 'test_client_id',
        domain: 'test.auth0.com',
      };

      const result = await writeCredentialsToEnv(credentials);

      expect(result.env_var_names).toEqual(['AUTH0_CLIENT_ID', 'AUTH0_DOMAIN']);

      const content = fs.readFileSync(envFilePath, 'utf-8');
      expect(content).toContain('AUTH0_CLIENT_ID=test_client_id');
      expect(content).not.toContain('AUTH0_CLIENT_SECRET');
    });

    it('should write to custom file path', async () => {
      const customPath = path.join(testDir, '.env.custom');
      const credentials: Credentials = {
        client_id: 'test_client_id',
        domain: 'test.auth0.com',
      };

      const result = await writeCredentialsToEnv(credentials, {
        filePath: customPath,
      });

      expect(result.file_path).toBe(customPath);
      expect(fs.existsSync(customPath)).toBe(true);
    });

    it('should include timestamp in generated content', async () => {
      const credentials: Credentials = {
        client_id: 'test_client_id',
        domain: 'test.auth0.com',
      };

      await writeCredentialsToEnv(credentials);

      const content = fs.readFileSync(envFilePath, 'utf-8');
      expect(content).toContain('# Auth0 Credentials (Generated:');
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
