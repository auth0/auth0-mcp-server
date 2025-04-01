import { describe, it, expect, vi, beforeEach } from 'vitest';
import init from '../src/init';

// Mock dependencies
vi.mock('../src/utils/auth/device-auth-flow', () => ({
  requestAuthorization: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../src/clients/claude', () => ({
  findAndUpdatedClaudeConfig: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../src/utils/logger', () => ({
  log: vi.fn(),
}));

// Import mocked modules
import { requestAuthorization } from '../src/utils/auth/device-auth-flow';
import { findAndUpdatedClaudeConfig } from '../src/clients/claude';
import { log } from '../src/utils/logger';

describe('Init Module', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('should initialize the server successfully', async () => {
    await init([]);

    expect(log).toHaveBeenCalledWith('Initializing Auth0 MCP server...');
    expect(requestAuthorization).toHaveBeenCalled();
    expect(findAndUpdatedClaudeConfig).toHaveBeenCalled();
  });

  it('should handle authorization errors', async () => {
    const mockError = new Error('Authorization failed');
    vi.mocked(requestAuthorization).mockRejectedValue(mockError);

    await init([]);

    expect(log).toHaveBeenCalledWith('Initializing Auth0 MCP server...');
    expect(log).toHaveBeenCalledWith('Error initializing server:', mockError);
    expect(requestAuthorization).toHaveBeenCalled();
    expect(findAndUpdatedClaudeConfig).not.toHaveBeenCalled();
  });

  it('should handle Claude config update errors', async () => {
    const mockError = new Error('Claude config update failed');
    vi.mocked(findAndUpdatedClaudeConfig).mockRejectedValue(mockError);

    await init([]);

    expect(log).toHaveBeenCalledWith('Initializing Auth0 MCP server...');
    expect(log).toHaveBeenCalledWith('Error initializing server:', mockError);
    expect(requestAuthorization).toHaveBeenCalled();
    expect(findAndUpdatedClaudeConfig).toHaveBeenCalled();
  });
});
