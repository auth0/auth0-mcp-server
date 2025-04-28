import { describe, it, expect, vi, beforeEach } from 'vitest';

// Arrange: Mock client classes
vi.mock('../../src/clients/claude.js', () => ({
  ClaudeClientManager: vi.fn().mockImplementation(() => ({
    getConfigPath: vi.fn(),
    configure: vi.fn(),
  })),
}));

vi.mock('../../src/clients/cursor.js', () => ({
  CursorClientManager: vi.fn().mockImplementation(() => ({
    getConfigPath: vi.fn(),
    configure: vi.fn(),
  })),
}));

vi.mock('../../src/clients/windsurf.js', () => ({
  WindsurfClientManager: vi.fn().mockImplementation(() => ({
    getConfigPath: vi.fn(),
    configure: vi.fn(),
  })),
}));

// Act: Import the module under test after mocking dependencies
import * as clientsIndex from '../../src/clients/index.js';

describe('Client Module Index', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should export a clients namespace object with client manager instances', () => {
    // Assert: Verify that the clients object is defined and contains expected keys
    expect(clientsIndex.clients).toBeDefined();
    expect(clientsIndex.clients).toHaveProperty('claude');
    expect(clientsIndex.clients).toHaveProperty('cursor');
    expect(clientsIndex.clients).toHaveProperty('windsurf');

    // Assert: Verify that each client manager instance has the expected methods
    expect(clientsIndex.clients.claude).toHaveProperty('getConfigPath');
    expect(clientsIndex.clients.claude).toHaveProperty('configure');
    expect(clientsIndex.clients.cursor).toHaveProperty('getConfigPath');
    expect(clientsIndex.clients.cursor).toHaveProperty('configure');
    expect(clientsIndex.clients.windsurf).toHaveProperty('getConfigPath');
    expect(clientsIndex.clients.windsurf).toHaveProperty('configure');
  });
});
