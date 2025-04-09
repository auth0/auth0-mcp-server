import { describe, it, expect, vi, beforeEach } from 'vitest';
import init from '../src/init';
import { requestAuthorization } from '../src/auth/device-auth-flow';
import { findAndUpdateClaudeConfig } from '../src/clients/claude';
import { log } from '../src/utils/logger';

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

describe('Init Module', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('should initialize the server successfully', async () => {
    await init([]);

    expect(log).toHaveBeenCalledWith('Initializing Auth0 MCP server...');
    expect(requestAuthorization).toHaveBeenCalled();
    expect(findAndUpdateClaudeConfig).toHaveBeenCalled();
  });

  it('should handle authorization errors', async () => {
    const mockError = new Error('Authorization failed');
    vi.mocked(requestAuthorization).mockRejectedValue(mockError);

    await init([]);

    expect(log).toHaveBeenCalledWith('Initializing Auth0 MCP server...');
    expect(log).toHaveBeenCalledWith('Error initializing server:', mockError);
    expect(requestAuthorization).toHaveBeenCalled();
    expect(findAndUpdateClaudeConfig).not.toHaveBeenCalled();
  });

  it('should handle Claude config update errors', async () => {
    const mockError = new Error('Claude config update failed');
    vi.mocked(findAndUpdateClaudeConfig).mockRejectedValue(mockError);

    await init([]);

    expect(log).toHaveBeenCalledWith('Initializing Auth0 MCP server...');
    expect(log).toHaveBeenCalledWith('Error initializing server:', mockError);
    expect(requestAuthorization).toHaveBeenCalled();
    expect(findAndUpdateClaudeConfig).toHaveBeenCalled();
  });
});
