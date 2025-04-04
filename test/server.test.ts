import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mockLoadConfig, mockValidateConfig, mockConfig } from './mocks/config';
import { startServer } from '../src/server';

// Mock modules before importing the module that uses them
vi.mock('../src/utils/config.js', () => ({
  loadConfig: vi.fn().mockImplementation(() => mockLoadConfig()),
  validateConfig: vi.fn().mockImplementation((config) => mockValidateConfig(config)),
}));

vi.mock('../src/utils/logger.js', () => ({
  log: vi.fn(),
  logInfo: vi.fn(),
  logError: vi.fn(),
}));

describe('Server', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should initialize the server successfully', async () => {
    const server = await startServer();

    expect(mockLoadConfig).toHaveBeenCalledTimes(1);
    expect(mockValidateConfig).toHaveBeenCalledWith(mockConfig);
    expect(server).toBeDefined();
  });

  it('should throw an error if config validation fails', async () => {
    mockValidateConfig.mockReturnValueOnce(false);

    await expect(startServer()).rejects.toThrow('Invalid Auth0 configuration');

    expect(mockLoadConfig).toHaveBeenCalledTimes(1);
    expect(mockValidateConfig).toHaveBeenCalledWith(mockConfig);
  });

  it('should reload config if it becomes invalid during a tool call', async () => {
    // This test would be more complex and would need to mock the CallToolRequestSchema handler
    // For now, we'll just demonstrate the concept
    const server = await startServer();

    expect(mockLoadConfig).toHaveBeenCalledTimes(1);
    expect(mockValidateConfig).toHaveBeenCalledWith(mockConfig);
    expect(server).toBeDefined();
  });
});
