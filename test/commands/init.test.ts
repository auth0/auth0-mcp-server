import { describe, it, expect, vi, beforeEach } from 'vitest';
import { requestAuthorization } from '../../src/auth/device-auth-flow';
import { log, logError } from '../../src/utils/logger';
import { promptForScopeSelection } from '../../src/utils/terminal.js';
import type { ClientManager, ClientType } from '../../src/clients/types.js';

// Mock all dependencies first
vi.mock('../../src/auth/device-auth-flow');
vi.mock('../../src/utils/logger');
vi.mock('../../src/utils/terminal', () => import('../../test/mocks/terminal'));

// Mock the client modules
vi.mock('../../src/clients/index.js', () => {
  const mockClaudeManager = {
    getConfigPath: vi.fn(),
    configure: vi.fn().mockResolvedValue(undefined),
  };

  const mockCursorManager = {
    getConfigPath: vi.fn(),
    configure: vi.fn().mockResolvedValue(undefined),
  };

  const mockWindsurfManager = {
    getConfigPath: vi.fn(),
    configure: vi.fn().mockResolvedValue(undefined),
  };

  return {
    clients: {
      claude: mockClaudeManager,
      cursor: mockCursorManager,
      windsurf: mockWindsurfManager,
    },
  };
});

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

// Import dependencies after mocking
import { clients } from '../../src/clients/index.js';

// Import init after mocking dependencies
import init from '../../src/commands/init.js';

describe('Init Module', () => {
  // Type the mocks for better intellisense and type checking
  const mockedRequestAuth = vi.mocked(requestAuthorization);
  const mockedClaudeConfigure = vi.mocked(clients.claude.configure);
  const mockedWindsurfConfigure = vi.mocked(clients.windsurf.configure);
  const mockedCursorConfigure = vi.mocked(clients.cursor.configure);
  const mockedLog = vi.mocked(log);
  const mockedPromptForScopeSelection = vi.mocked(promptForScopeSelection);

  beforeEach(() => {
    // Arrange
    vi.resetAllMocks();

    // Set default mock return values
    mockedRequestAuth.mockResolvedValue(undefined);
    mockedPromptForScopeSelection.mockResolvedValue([]);
  });

  it('should use default "*" when tools is empty', async () => {
    // Act
    await init({ client: 'claude', tools: [] });

    // Assert
    expect(mockedLog).toHaveBeenCalledWith('Initializing Auth0 MCP server...');
    expect(mockedClaudeConfigure).toHaveBeenCalledWith(expect.objectContaining({ tools: [] }));
  });

  it('should initialize server with default client (Claude) when tools parameter is provided', async () => {
    // Act
    await init({ client: 'claude', tools: ['*'] });

    // Assert
    expect(mockedLog).toHaveBeenCalledWith('Initializing Auth0 MCP server...');
    expect(mockedPromptForScopeSelection).toHaveBeenCalled();
    expect(mockedRequestAuth).toHaveBeenCalled();
    expect(mockedClaudeConfigure).toHaveBeenCalled();
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
    expect(mockedClaudeConfigure).not.toHaveBeenCalled();
  });

  it('should handle client config update errors', async () => {
    // Arrange
    const mockError = new Error('Claude config update failed');
    mockedClaudeConfigure.mockRejectedValue(mockError);

    // Act
    await init({ client: 'claude', tools: ['*'] }).catch(() => {
      /* ignore error */
    });

    // Assert
    expect(mockedLog).toHaveBeenCalledWith('Initializing Auth0 MCP server...');
    expect(mockedRequestAuth).toHaveBeenCalled();
    expect(mockedClaudeConfigure).toHaveBeenCalled();
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
    expect(mockedClaudeConfigure).toHaveBeenCalledWith({ tools });
  });

  describe('Client selection', () => {
    it.each([
      ['windsurf', mockedWindsurfConfigure],
      ['cursor', mockedCursorConfigure],
    ])('should initialize %s client when specified', async (clientType, configMock) => {
      // Act
      await init({ client: clientType as ClientType, tools: ['*'] });

      // Assert
      expect(configMock).toHaveBeenCalled();
      expect(mockedClaudeConfigure).not.toHaveBeenCalled();

      // Verify other client configs weren't called
      const allClientMocks = [
        mockedClaudeConfigure,
        mockedWindsurfConfigure,
        mockedCursorConfigure,
      ];
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
      expect(mockedWindsurfConfigure).toHaveBeenCalledWith({ tools });
    });
  });

  describe('Scope selection', () => {
    it('should use selected scopes from promptForScopeSelection', async () => {
      // Arrange
      const mockSelectedScopes = ['read:clients', 'read:actions'];
      const mockInteractive = true;
      mockedPromptForScopeSelection.mockResolvedValue(mockSelectedScopes);

      // Act
      await init({ client: 'claude', tools: ['*'], interaction: true });

      // Assert
      expect(mockedPromptForScopeSelection).toHaveBeenCalled();
      expect(mockedRequestAuth).toHaveBeenCalledWith(mockSelectedScopes, mockInteractive);
    });

    it('should use provided scopes with --scopes flag', async () => {
      // Arrange
      const mockScopes = ['read:clients', 'create:clients'];
      const mockInteractive = true;
      mockedPromptForScopeSelection.mockResolvedValue(mockScopes);

      // Act
      await init({ client: 'claude', scopes: mockScopes, tools: ['*'], interaction: true });

      // Assert
      expect(mockedPromptForScopeSelection).toHaveBeenCalled();
      expect(mockedRequestAuth).toHaveBeenCalledWith(mockScopes, mockInteractive);
    });

    it('should handle glob patterns with --scopes flag', async () => {
      // Arrange
      mockedPromptForScopeSelection.mockResolvedValue(['read:clients', 'read:actions']);
      const mockInteractive = true;

      // Act
      await init({ client: 'claude', scopes: ['read:*'], tools: ['*'], interaction: true });

      // Assert
      expect(mockedPromptForScopeSelection).toHaveBeenCalled();
      expect(mockedRequestAuth).toHaveBeenCalledWith(
        ['read:clients', 'read:actions'],
        mockInteractive
      );
    });
  });
});
