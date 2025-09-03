import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as path from 'path';
import * as os from 'os';
import * as fs from 'fs';

// Mock dependencies
vi.mock('path');
vi.mock('os');
vi.mock('fs');
vi.mock('../../src/clients/utils.js', () => ({
  getPlatformPath: vi.fn(),
  ensureDir: vi.fn(),
}));
vi.mock('../../src/utils/logger.js', () => ({
  log: vi.fn(),
}));
vi.mock('../../src/utils/terminal.js', () => ({
  cliOutput: vi.fn(),
  promptForChoice: vi.fn(),
  promptForPath: vi.fn(),
}));

// Import after mocks
import { VSCodeClientManager } from '../../src/clients/vscode.js';
import { getPlatformPath, ensureDir } from '../../src/clients/utils.js';
import { log } from '../../src/utils/logger.js';
import { cliOutput, promptForChoice, promptForPath } from '../../src/utils/terminal.js';
import type { VSCodeClientOptions } from '../../src/clients/vscode.js';

describe('VSCodeClientManager', () => {
  let vscodeManager: VSCodeClientManager;
  const originalPlatform = process.platform;

  beforeEach(() => {
    vi.resetAllMocks();
    vscodeManager = new VSCodeClientManager();

    // Mock platform
    Object.defineProperty(process, 'platform', {
      get: () => 'darwin',
      configurable: true,
    });

    // Mock os.homedir
    vi.mocked(os.homedir).mockReturnValue('/home/user');

    // Mock path.join
    vi.mocked(path.join).mockImplementation((...segments) => segments.join('/'));

    // Mock fs functions
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readFileSync).mockReturnValue('{}');
    vi.mocked(fs.writeFileSync).mockImplementation(() => {});

    // Mock getPlatformPath
    vi.mocked(getPlatformPath).mockReturnValue('/home/user/.config/Code/User');

    // Mock ensureDir
    vi.mocked(ensureDir).mockImplementation(() => {});
  });

  afterEach(() => {
    Object.defineProperty(process, 'platform', { value: originalPlatform });
  });

  describe('Constructor', () => {
    it('should initialize with correct client type and display name', () => {
      expect(vscodeManager.displayName).toBe('VS Code');
    });
  });

  describe('getConfigPath - Global scope', () => {
    it('should return global config path with correct platform paths', () => {
      const configPath = vscodeManager.getConfigPath();

      expect(getPlatformPath).toHaveBeenCalledWith({
        darwin: '/home/user/Library/Application Support/Code/User',
        win32: '{APPDATA}/Code/User',
        linux: '/home/user/.config/Code/User',
      });
      expect(ensureDir).toHaveBeenCalledWith('/home/user/.config/Code/User');
      expect(path.join).toHaveBeenCalledWith('/home/user/.config/Code/User', 'mcp.json');
      expect(configPath).toBe('/home/user/.config/Code/User/mcp.json');
    });
  });

  describe('getConfigPath - Workspace scope', () => {
    it('should return workspace config path when workspace scope is selected', async () => {
      const workspaceFolder = '/path/to/workspace';

      // Mock workspace folder exists
      vi.mocked(fs.existsSync).mockImplementation((path) => {
        return path === workspaceFolder;
      });

      const testOptions: VSCodeClientOptions = {
        scope: 'workspace',
        workspaceFolder,
        tools: ['applications'],
      };

      // Configure for workspace
      await vscodeManager.configure(testOptions);

      const configPath = vscodeManager.getConfigPath();

      expect(path.join).toHaveBeenCalledWith(workspaceFolder, '.vscode');
      expect(ensureDir).toHaveBeenCalledWith('/path/to/workspace/.vscode');
      expect(path.join).toHaveBeenCalledWith('/path/to/workspace/.vscode', 'mcp.json');
      expect(configPath).toBe('/path/to/workspace/.vscode/mcp.json');
    });

    it('should throw error when workspace folder does not exist', async () => {
      const workspaceFolder = '/nonexistent/workspace';

      // Mock workspace folder doesn't exist
      vi.mocked(fs.existsSync).mockImplementation((path) => {
        return path !== workspaceFolder;
      });

      const testOptions: VSCodeClientOptions = {
        scope: 'workspace',
        workspaceFolder,
        tools: ['applications'],
      };

      // Configure for workspace with nonexistent folder should throw error
      await expect(vscodeManager.configure(testOptions)).rejects.toThrow(
        `Workspace folder does not exist: ${workspaceFolder}`
      );
    });

    it('should fallback to global config when workspace folder is not set', async () => {
      const testOptions: VSCodeClientOptions = {
        scope: 'workspace',
        // No workspaceFolder provided
        tools: ['applications'],
      };

      // Configure for workspace without folder
      await vscodeManager.configure(testOptions);

      const configPath = vscodeManager.getConfigPath();

      // Should fall back to global config
      expect(configPath).toBe('/home/user/.config/Code/User/mcp.json');
    });
  });

  describe('configure - Scope selection', () => {
    const testOptions: VSCodeClientOptions = {
      tools: ['applications', 'resource-servers'],
      readOnly: false,
    };

    it('should prompt for scope when not provided and handle workspace folder selection', async () => {
      const workspaceFolder = '/path/to/workspace';
      vi.mocked(promptForChoice).mockResolvedValue('workspace');
      vi.mocked(promptForPath).mockResolvedValue(workspaceFolder);

      await vscodeManager.configure(testOptions);

      expect(promptForChoice).toHaveBeenCalledWith(
        'Where would you like to configure the Auth0 MCP server for VS Code?',
        [
          {
            label: 'Workspace - Configure for a specific project/repository',
            value: 'workspace',
          },
          { label: 'Global - Configure for all VS Code instances', value: 'global' },
        ],
        'workspace'
      );
      expect(promptForPath).toHaveBeenCalledWith(
        'Enter the absolute path to your workspace/project folder: ',
        {
          required: true,
          mustExist: true,
          mustBeDirectory: true,
        }
      );
    });

    it('should use scope from options without prompting', async () => {
      const workspaceFolder = '/provided/workspace';

      await vscodeManager.configure({
        ...testOptions,
        scope: 'workspace',
        workspaceFolder,
      });

      expect(promptForChoice).not.toHaveBeenCalled();
      expect(promptForPath).not.toHaveBeenCalled();
    });

    it('should configure global scope without prompting for workspace folder', async () => {
      vi.mocked(promptForChoice).mockResolvedValue('global');

      await vscodeManager.configure(testOptions);

      expect(promptForPath).not.toHaveBeenCalled();
    });
  });

  describe('configure - VS Code mcp.json format', () => {
    it('should create new servers section when it does not exist', async () => {
      const existingConfig = {
        'editor.fontSize': 14,
        'files.autoSave': 'onWindowChange',
      };

      vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(existingConfig));
      vi.mocked(promptForChoice).mockResolvedValue('global');

      const testOptions: VSCodeClientOptions = {
        tools: ['applications'],
        readOnly: false,
      };

      await vscodeManager.configure(testOptions);

      expect(fs.writeFileSync).toHaveBeenCalledWith(
        '/home/user/.config/Code/User/mcp.json',
        JSON.stringify(
          {
            ...existingConfig,
            servers: {
              auth0: {
                command: 'npx',
                args: ['-y', '@auth0/auth0-mcp-server', 'run', '--tools', 'applications'],
                env: {
                  DEBUG: 'auth0-mcp',
                },
              },
            },
          },
          null,
          2
        )
      );
    });

    it('should preserve existing servers configuration', async () => {
      const existingConfig = {
        servers: {
          'other-server': {
            command: 'other-command',
            args: ['other-args'],
          },
        },
      };

      vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(existingConfig));
      vi.mocked(promptForChoice).mockResolvedValue('global');

      await vscodeManager.configure({
        tools: ['applications'],
      });

      const writeCall = vi.mocked(fs.writeFileSync).mock.calls[0];
      const writtenConfig = JSON.parse(writeCall[1] as string);

      expect(writtenConfig['servers']).toHaveProperty('other-server');
      expect(writtenConfig['servers']).toHaveProperty('auth0');
      expect(writtenConfig['servers']['other-server']).toEqual(
        existingConfig['servers']['other-server']
      );
    });

    it('should include readOnly flag in server configuration', async () => {
      vi.mocked(promptForChoice).mockResolvedValue('global');

      const testOptions: VSCodeClientOptions = {
        tools: ['applications', 'resource-servers'],
        readOnly: true,
      };

      await vscodeManager.configure(testOptions);

      const writeCall = vi.mocked(fs.writeFileSync).mock.calls[0];
      const writtenConfig = JSON.parse(writeCall[1] as string);

      expect(writtenConfig['servers'].auth0.args).toEqual([
        '-y',
        '@auth0/auth0-mcp-server',
        'run',
        '--tools',
        'applications,resource-servers',
        '--read-only',
      ]);
    });

    it('should handle missing config file gracefully', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(false);
      vi.mocked(promptForChoice).mockResolvedValue('global');

      await vscodeManager.configure({
        tools: ['applications'],
      });

      expect(fs.writeFileSync).toHaveBeenCalledWith(
        expect.any(String),
        expect.stringContaining('"servers"')
      );
    });

    it('should handle corrupted config file gracefully', async () => {
      vi.mocked(fs.readFileSync).mockReturnValue('invalid json');
      vi.mocked(promptForChoice).mockResolvedValue('global');

      await vscodeManager.configure({
        tools: ['applications'],
      });

      // Should still write a valid config
      expect(fs.writeFileSync).toHaveBeenCalledWith(
        expect.any(String),
        expect.stringContaining('"servers"')
      );
    });
  });

  describe('configure - Success messages and logging', () => {
    it('should show appropriate success messages and logging for both scopes', async () => {
      // Test global scope
      vi.mocked(promptForChoice).mockResolvedValueOnce('global');
      await vscodeManager.configure({ tools: ['applications'] });

      expect(cliOutput).toHaveBeenCalledWith(
        expect.stringContaining('✓ Auth0 MCP server configured globally for VS Code')
      );
      expect(cliOutput).toHaveBeenCalledWith(
        expect.stringContaining('Restart VS Code to apply changes')
      );
      expect(log).toHaveBeenCalledWith(
        expect.stringContaining('Updated VS Code global config file at:')
      );

      // Reset mocks for workspace test
      vi.clearAllMocks();
      const workspaceFolder = '/path/to/workspace';

      // Test workspace scope
      await vscodeManager.configure({
        tools: ['applications'],
        scope: 'workspace',
        workspaceFolder,
      });

      expect(cliOutput).toHaveBeenCalledWith(
        expect.stringContaining('✓ Auth0 MCP server configured for workspace')
      );
      expect(cliOutput).toHaveBeenCalledWith(
        expect.stringContaining(`open VS Code in the workspace folder: ${workspaceFolder}`)
      );
      expect(cliOutput).toHaveBeenCalledWith(
        expect.stringContaining('Restart VS Code to apply changes')
      );
      expect(log).toHaveBeenCalledWith(
        expect.stringContaining(`Updated VS Code workspace (${workspaceFolder}) config file at:`)
      );
    });
  });

  describe('configure - Error handling and edge cases', () => {
    it('should handle file errors and create correct server config structure', async () => {
      // Test file read error handling
      vi.mocked(fs.readFileSync).mockImplementationOnce(() => {
        throw new Error('Permission denied');
      });
      vi.mocked(promptForChoice).mockResolvedValue('global');

      await vscodeManager.configure({ tools: ['applications', 'logs'] });

      // Should still attempt to write config with empty base
      expect(fs.writeFileSync).toHaveBeenCalled();

      // Reset for structure test
      vi.clearAllMocks();
      vi.mocked(fs.readFileSync).mockReturnValue('{}');
      vi.mocked(promptForChoice).mockResolvedValue('global');

      const testOptions: VSCodeClientOptions = {
        tools: ['applications', 'logs'],
        readOnly: false,
      };

      await vscodeManager.configure(testOptions);

      const writeCall = vi.mocked(fs.writeFileSync).mock.calls[0];
      const writtenConfig = JSON.parse(writeCall[1] as string);

      expect(writtenConfig).toHaveProperty('servers');
      expect(writtenConfig['servers']).toHaveProperty('auth0');

      const serverConfig = writtenConfig['servers'].auth0;
      expect(serverConfig).toHaveProperty('command');
      expect(serverConfig).toHaveProperty('args');
      expect(serverConfig).toHaveProperty('env');
      expect(serverConfig.args).toEqual(
        expect.arrayContaining(['run', '--tools', 'applications,logs'])
      );
      expect(serverConfig.env).toEqual({
        DEBUG: 'auth0-mcp',
      });
    });
  });
});
