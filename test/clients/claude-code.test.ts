import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as path from 'path';
import * as os from 'os';
import * as fs from 'fs';

// Mock dependencies
vi.mock('path');
vi.mock('os');
vi.mock('fs');
vi.mock('../../src/utils/logger.js', () => ({
  log: vi.fn(),
}));
vi.mock('../../src/utils/terminal.js', () => ({
  cliOutput: vi.fn(),
  promptForChoice: vi.fn(),
  promptForPath: vi.fn(),
}));

// Import after mocks
import { ClaudeCodeClientManager } from '../../src/clients/claude-code.js';
import { cliOutput, promptForChoice, promptForPath } from '../../src/utils/terminal.js';
import type { ClaudeCodeClientOptions } from '../../src/clients/claude-code.js';

describe('ClaudeCodeClientManager', () => {
  let manager: ClaudeCodeClientManager;

  beforeEach(() => {
    vi.resetAllMocks();
    manager = new ClaudeCodeClientManager();

    vi.mocked(os.homedir).mockReturnValue('/home/user');
    vi.mocked(path.join).mockImplementation((...segments) => segments.join('/'));
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readFileSync).mockReturnValue('{}');
    vi.mocked(fs.writeFileSync).mockImplementation(() => {});
  });

  describe('Constructor', () => {
    it('should initialize with correct client type and display name', () => {
      expect(manager.displayName).toBe('Claude Code');
    });
  });

  describe('getConfigPath - User scope', () => {
    it('should resolve to ~/.claude.json by default', () => {
      const configPath = manager.getConfigPath();

      expect(path.join).toHaveBeenCalledWith('/home/user', '.claude.json');
      expect(configPath).toBe('/home/user/.claude.json');
    });
  });

  describe('getConfigPath - Project scope', () => {
    it('should resolve to <folder>/.mcp.json when project scope is selected', async () => {
      const projectFolder = '/path/to/project';
      vi.mocked(fs.existsSync).mockImplementation((p) => p === projectFolder);

      await manager.configure({
        scope: 'project',
        workspaceFolder: projectFolder,
        tools: ['applications'],
      });

      const configPath = manager.getConfigPath();

      expect(path.join).toHaveBeenCalledWith(projectFolder, '.mcp.json');
      expect(configPath).toBe('/path/to/project/.mcp.json');
    });

    it('should throw when project folder does not exist', async () => {
      const projectFolder = '/nonexistent/project';
      vi.mocked(fs.existsSync).mockImplementation((p) => p !== projectFolder);

      await expect(
        manager.configure({
          scope: 'project',
          workspaceFolder: projectFolder,
          tools: ['applications'],
        })
      ).rejects.toThrow(`Project folder does not exist: ${projectFolder}`);
    });

    it('getConfigPath falls back to ~/.claude.json when project folder is unset', async () => {
      await manager.configure({
        scope: 'project',
        // no workspaceFolder
        tools: ['applications'],
      });

      // Project scope with no folder prompts the user for one
      expect(promptForPath).toHaveBeenCalled();

      const configPath = manager.getConfigPath();
      expect(configPath).toBe('/home/user/.claude.json');
    });
  });

  describe('configure - Scope selection', () => {
    const testOptions: ClaudeCodeClientOptions = {
      tools: ['applications'],
      readOnly: false,
    };

    it('should prompt for scope when not provided, defaulting to user', async () => {
      vi.mocked(promptForChoice).mockResolvedValue('user');

      await manager.configure(testOptions);

      expect(promptForChoice).toHaveBeenCalledWith(
        'Where would you like to configure the Auth0 MCP server for Claude Code?',
        [
          {
            label: 'User - Configure for all your projects (~/.claude.json)',
            value: 'user',
          },
          {
            label: 'Project - Configure for a specific project/repository',
            value: 'project',
          },
        ],
        'user'
      );
      expect(promptForPath).not.toHaveBeenCalled();
    });

    it('should prompt for project folder when project scope is chosen', async () => {
      const projectFolder = '/path/to/project';
      vi.mocked(promptForChoice).mockResolvedValue('project');
      vi.mocked(promptForPath).mockResolvedValue(projectFolder);
      vi.mocked(fs.existsSync).mockImplementation((p) => p === projectFolder);

      await manager.configure(testOptions);

      expect(promptForPath).toHaveBeenCalledWith(
        'Enter the absolute path to your project folder: ',
        {
          required: true,
          mustExist: true,
          mustBeDirectory: true,
        }
      );
    });

    it('should use scope from options without prompting', async () => {
      const projectFolder = '/provided/project';
      vi.mocked(fs.existsSync).mockImplementation((p) => p === projectFolder);

      await manager.configure({
        ...testOptions,
        scope: 'project',
        workspaceFolder: projectFolder,
      });

      expect(promptForChoice).not.toHaveBeenCalled();
      expect(promptForPath).not.toHaveBeenCalled();
    });
  });

  describe('configure - mcpServers format', () => {
    it('should write the auth0 server under the mcpServers key', async () => {
      vi.mocked(promptForChoice).mockResolvedValue('user');

      await manager.configure({ tools: ['applications'] });

      const writeCall = vi.mocked(fs.writeFileSync).mock.calls[0];
      const writtenConfig = JSON.parse(writeCall[1] as string);

      expect(writtenConfig).toHaveProperty('mcpServers');
      expect(writtenConfig.mcpServers).toHaveProperty('auth0');
      expect(writtenConfig.mcpServers.auth0).toHaveProperty('command', 'npx');
      expect(cliOutput).toHaveBeenCalled();
    });

    it('should preserve existing top-level keys in ~/.claude.json', async () => {
      const existingConfig = {
        projects: { '/some/project': { mcpServers: {} } },
        mcpServers: {
          'other-server': { command: 'other-command', args: [] },
        },
      };
      vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(existingConfig));
      vi.mocked(promptForChoice).mockResolvedValue('user');

      await manager.configure({ tools: ['applications'] });

      const writeCall = vi.mocked(fs.writeFileSync).mock.calls[0];
      const writtenConfig = JSON.parse(writeCall[1] as string);

      expect(writtenConfig).toHaveProperty('projects');
      expect(writtenConfig.mcpServers).toHaveProperty('other-server');
      expect(writtenConfig.mcpServers).toHaveProperty('auth0');
    });
  });
});
