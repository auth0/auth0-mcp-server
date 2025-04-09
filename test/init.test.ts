import { describe, it, expect, vi, beforeEach, afterAll } from 'vitest';
import init from '../src/init';
import { requestAuthorization } from '../src/auth/device-auth-flow';
import { findAndUpdateClaudeConfig } from '../src/clients/claude';
import { log } from '../src/utils/logger';
import { promptForScopeSelection } from '../src/utils/cli-utility';

// Mock dependencies
vi.mock('../src/auth/device-auth-flow', () => ({
  requestAuthorization: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../src/clients/claude', () => ({
  findAndUpdateClaudeConfig: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../src/utils/logger', () => ({
  log: vi.fn(),
  logInfo: vi.fn(),
  logError: vi.fn(),
}));

vi.mock('../src/utils/cli-utility', () => ({
  promptForScopeSelection: vi.fn().mockResolvedValue([]),
}));

// Mock the scope utilities
vi.mock('../src/utils/scopes', () => ({
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
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('should initialize the server successfully', async () => {
    // Set up mock for promptForScopeSelection to return empty array
    vi.mocked(promptForScopeSelection).mockResolvedValue([]);

    await init([]);

    expect(log).toHaveBeenCalledWith('Initializing Auth0 MCP server...');
    expect(promptForScopeSelection).toHaveBeenCalled();
    expect(requestAuthorization).toHaveBeenCalledWith([]);
    expect(findAndUpdateClaudeConfig).toHaveBeenCalled();
  });

  it('should handle authorization errors', async () => {
    const mockError = new Error('Authorization failed');
    vi.mocked(promptForScopeSelection).mockResolvedValue([]);
    vi.mocked(requestAuthorization).mockRejectedValue(mockError);

    await init([]);

    expect(log).toHaveBeenCalledWith('Initializing Auth0 MCP server...');
    expect(log).toHaveBeenCalledWith('Error initializing server:', mockError);
    expect(promptForScopeSelection).toHaveBeenCalled();
    expect(requestAuthorization).toHaveBeenCalledWith([]);
    expect(findAndUpdateClaudeConfig).not.toHaveBeenCalled();
  });

  it('should handle Claude config update errors', async () => {
    const mockError = new Error('Claude config update failed');
    vi.mocked(promptForScopeSelection).mockResolvedValue([]);
    vi.mocked(findAndUpdateClaudeConfig).mockRejectedValue(mockError);

    await init([]);

    expect(log).toHaveBeenCalledWith('Initializing Auth0 MCP server...');
    expect(log).toHaveBeenCalledWith('Error initializing server:', mockError);
    expect(promptForScopeSelection).toHaveBeenCalled();
    expect(requestAuthorization).toHaveBeenCalledWith([]);
    expect(findAndUpdateClaudeConfig).toHaveBeenCalled();
  });

  it('should use provided scopes with --scopes flag and comma separation', async () => {
    // First reset the mock completely then give it a basic implementation
    vi.mocked(promptForScopeSelection).mockReset();

    const mockScopes = ['read:clients', 'create:clients'];
    vi.mocked(promptForScopeSelection).mockResolvedValue(mockScopes);

    await init(['--scopes', 'read:clients,create:clients']);

    expect(log).toHaveBeenCalledWith('Initializing Auth0 MCP server...');
    expect(promptForScopeSelection).toHaveBeenCalled();
    expect(requestAuthorization).toHaveBeenCalledWith(mockScopes);
    expect(findAndUpdateClaudeConfig).toHaveBeenCalled();
  });

  it('should handle whitespace in comma-separated scopes', async () => {
    // Reset the mock
    vi.mocked(promptForScopeSelection).mockReset();

    const mockScopes = ['read:clients', 'create:clients'];
    vi.mocked(promptForScopeSelection).mockResolvedValue(mockScopes);

    await init(['--scopes', 'read:clients, create:clients']);

    expect(log).toHaveBeenCalledWith('Initializing Auth0 MCP server...');
    expect(promptForScopeSelection).toHaveBeenCalled();
    expect(requestAuthorization).toHaveBeenCalledWith(mockScopes);
    expect(findAndUpdateClaudeConfig).toHaveBeenCalled();
  });

  it('should handle glob patterns with --scopes flag', async () => {
    // Reset and set up the mock to return all read scopes
    vi.mocked(promptForScopeSelection).mockReset();
    vi.mocked(promptForScopeSelection).mockResolvedValue(['read:clients', 'read:actions']);

    await init(['--scopes', 'read:*']);

    expect(log).toHaveBeenCalledWith('Initializing Auth0 MCP server...');
    expect(promptForScopeSelection).toHaveBeenCalled();
    expect(requestAuthorization).toHaveBeenCalledWith(['read:clients', 'read:actions']);
    expect(findAndUpdateClaudeConfig).toHaveBeenCalled();
  });

  it('should handle invalid scopes by showing error', async () => {
    // Mock process.exit to prevent test from exiting
    const originalExit = process.exit;
    process.exit = vi.fn() as any;

    try {
      // Run init with invalid scope
      await init(['--scopes', 'invalid:scope']);

      // Check for error messages - these should be called before process.exit
      const { logError } = await import('../src/utils/logger');
      expect(logError).toHaveBeenCalledWith(
        expect.stringContaining('Error: The following scopes are not valid: invalid:scope')
      );

      // Check that logError was called with the valid scopes message
      expect(logError).toHaveBeenCalledWith(expect.stringContaining('Valid scopes are:'));

      // Verify process.exit was called with code 1
      expect(process.exit).toHaveBeenCalledWith(1);
    } finally {
      // Restore original process.exit
      process.exit = originalExit;
    }
  });

  it('should use selected scopes from promptForScopeSelection', async () => {
    const mockSelectedScopes = ['read:clients', 'read:actions'];
    vi.mocked(promptForScopeSelection).mockResolvedValue(mockSelectedScopes);

    await init([]);

    expect(log).toHaveBeenCalledWith('Initializing Auth0 MCP server...');
    expect(promptForScopeSelection).toHaveBeenCalled();
    expect(requestAuthorization).toHaveBeenCalledWith(mockSelectedScopes);
    expect(findAndUpdateClaudeConfig).toHaveBeenCalled();
  });
});
