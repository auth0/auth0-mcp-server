import { describe, it, expect, vi, beforeEach } from 'vitest';
import init from '../../src/commands/init.js';
import { requestAuthorization } from '../../src/auth/device-auth-flow';
import { findAndUpdateClaudeConfig } from '../../src/clients/claude';
import { findAndUpdateWindsurfConfig } from '../../src/clients/windsurf';
import { findAndUpdateCursorConfig } from '../../src/clients/cursor';
import { log, logError } from '../../src/utils/logger';
import { promptForScopeSelection } from '../../src/utils/cli-utility';
import { TOOLS } from '../../src/tools/index';

// Mock all dependencies
vi.mock('../../src/auth/device-auth-flow');
vi.mock('../../src/clients/claude');
vi.mock('../../src/clients/windsurf');
vi.mock('../../src/clients/cursor');
vi.mock('../../src/utils/logger');

vi.mock('../../src/utils/cli-utility', () => ({
  promptForScopeSelection: vi.fn().mockResolvedValue([]),
}));

// Mock the scope utilities
vi.mock('../../src/utils/scopes', () => ({
  getAllScopes: () => [
    'read:clients',
    'update:clients',
    'create:clients',
    'read:actions',
    'update:actions',
    'create:actions',
  ],
  DEFAULT_SCOPES: [],
}));

describe('Init Module', () => {
  // Type the mocks for better intellisense and type checking
  const mockedRequestAuth = vi.mocked(requestAuthorization);
  const mockedClaudeConfig = vi.mocked(findAndUpdateClaudeConfig);
  const mockedWindsurfConfig = vi.mocked(findAndUpdateWindsurfConfig);
  const mockedCursorConfig = vi.mocked(findAndUpdateCursorConfig);
  const mockedLog = vi.mocked(log);
  const mockedLogError = vi.mocked(logError);
  const mockedPromptForScopeSelection = vi.mocked(promptForScopeSelection);

  beforeEach(() => {
    vi.resetAllMocks();

    // Set default mock return values
    mockedRequestAuth.mockResolvedValue(undefined);
    mockedClaudeConfig.mockResolvedValue(undefined);
    mockedWindsurfConfig.mockResolvedValue(undefined);
    mockedCursorConfig.mockResolvedValue(undefined);
    mockedPromptForScopeSelection.mockResolvedValue([]);
  });

  it('should use default "*" when tools is empty', async () => {
    // Act
    await init({ client: 'claude', tools: [] });

    // Assert
    expect(mockedLog).toHaveBeenCalledWith('Initializing Auth0 MCP server...');
    expect(mockedClaudeConfig).toHaveBeenCalledWith(expect.objectContaining({ tools: [] }));
  });

  it('should initialize server with default client (Claude) when tools parameter is provided', async () => {
    // Act
    await init({ client: 'claude', tools: ['*'] });

    // Assert
    expect(mockedLog).toHaveBeenCalledWith('Initializing Auth0 MCP server...');
    expect(mockedPromptForScopeSelection).toHaveBeenCalled();
    expect(mockedRequestAuth).toHaveBeenCalled();
    expect(mockedClaudeConfig).toHaveBeenCalled();
  });

  it('should handle authorization errors', async () => {
    // Arrange
    const mockError = new Error('Authorization failed');
    mockedRequestAuth.mockRejectedValue(mockError);

    // Act
    await init({ client: 'claude', tools: ['*'] }).catch(() => {
      /* ignore error */
    });

    // Assert
    expect(mockedLog).toHaveBeenCalledWith('Initializing Auth0 MCP server...');
    expect(mockedRequestAuth).toHaveBeenCalled();
    expect(mockedClaudeConfig).not.toHaveBeenCalled();
  });

  it('should handle client config update errors', async () => {
    // Arrange
    const mockError = new Error('Claude config update failed');
    mockedClaudeConfig.mockRejectedValue(mockError);

    // Act
    await init({ client: 'claude', tools: ['*'] }).catch(() => {
      /* ignore error */
    });

    // Assert
    expect(mockedLog).toHaveBeenCalledWith('Initializing Auth0 MCP server...');
    expect(mockedRequestAuth).toHaveBeenCalled();
    expect(mockedClaudeConfig).toHaveBeenCalled();
  });

  it('should pass tool options to client config when specified', async () => {
    // Arrange
    const tools = ['auth0_list_*', 'auth0_get_*'];

    // Act
    await init({ client: 'claude', tools });

    // Assert
    expect(mockedLog).toHaveBeenCalledWith(
      'Configuring server with selected tools: auth0_list_*, auth0_get_*'
    );
    expect(mockedClaudeConfig).toHaveBeenCalledWith({ tools });
  });

  describe('Client selection', () => {
    it.each([
      ['windsurf', mockedWindsurfConfig],
      ['cursor', mockedCursorConfig],
    ])('should initialize %s client when specified', async (clientName, configMock) => {
      // Act
      await init({ client: clientName as any, tools: ['*'] });

      // Assert
      expect(configMock).toHaveBeenCalled();
      expect(mockedClaudeConfig).not.toHaveBeenCalled();

      // Verify other client configs weren't called
      const allClientMocks = [mockedClaudeConfig, mockedWindsurfConfig, mockedCursorConfig];
      const otherMocks = allClientMocks.filter((mock) => mock !== configMock);
      otherMocks.forEach((mock) => {
        expect(mock).not.toHaveBeenCalled();
      });
    });

    it('should handle tool filters with client flags', async () => {
      // Arrange
      const tools = ['auth0_list_applications'];

      // Act
      await init({ client: 'windsurf', tools });

      // Assert
      expect(mockedWindsurfConfig).toHaveBeenCalledWith({ tools });
    });
  });

  describe('Scope selection', () => {
    it('should use selected scopes from promptForScopeSelection', async () => {
      // Arrange
      const mockSelectedScopes = ['read:clients', 'read:actions'];
      mockedPromptForScopeSelection.mockResolvedValue(mockSelectedScopes);

      // Act
      await init({ client: 'claude', tools: ['*'] });

      // Assert
      expect(mockedPromptForScopeSelection).toHaveBeenCalled();
      expect(mockedRequestAuth).toHaveBeenCalledWith(mockSelectedScopes);
    });

    it('should use provided scopes with --scopes flag', async () => {
      // Arrange
      const mockScopes = ['read:clients', 'create:clients'];
      mockedPromptForScopeSelection.mockResolvedValue(mockScopes);

      // Act
      await init({ client: 'claude', scopes: mockScopes, tools: ['*'] });

      // Assert
      expect(mockedPromptForScopeSelection).toHaveBeenCalled();
      expect(mockedRequestAuth).toHaveBeenCalledWith(mockScopes);
    });

    it('should handle glob patterns with --scopes flag', async () => {
      // Arrange
      mockedPromptForScopeSelection.mockResolvedValue(['read:clients', 'read:actions']);

      // Act
      await init({ client: 'claude', scopes: ['read:*'], tools: ['*'] });

      // Assert
      expect(mockedPromptForScopeSelection).toHaveBeenCalled();
      expect(mockedRequestAuth).toHaveBeenCalledWith(['read:clients', 'read:actions']);
    });
  });
});
