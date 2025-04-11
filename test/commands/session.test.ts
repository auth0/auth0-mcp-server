import { describe, it, expect, vi, beforeEach } from 'vitest';
import session from '../../src/commands/session.js';
import { keychain } from '../../src/utils/keychain.js';
import { cliOutput } from '../../src/utils/cli-utility.js';
import { log } from '../../src/utils/logger.js';

// Mock dependencies
vi.mock('../../src/utils/keychain.js', () => ({
  keychain: {
    getToken: vi.fn(),
    getDomain: vi.fn(),
    getTokenExpiresAt: vi.fn(),
  },
}));

vi.mock('../../src/utils/cli-utility.js', () => ({
  cliOutput: vi.fn(),
}));

vi.mock('../../src/utils/logger.js', () => ({
  log: vi.fn(),
}));

describe('session command', () => {
  beforeEach(() => {
    // Clear all mocks before each test
    vi.clearAllMocks();
  });

  describe('when authenticated', () => {
    it('should show active session information with valid token', async () => {
      // Arrange
      const mockToken = 'mock-token';
      const mockDomain = 'test-tenant.auth0.com';
      const mockExpiresAt = Date.now() + 3600000; // 1 hour from now

      vi.mocked(keychain.getToken).mockResolvedValue(mockToken);
      vi.mocked(keychain.getDomain).mockResolvedValue(mockDomain);
      vi.mocked(keychain.getTokenExpiresAt).mockResolvedValue(mockExpiresAt);

      // Act
      await session();

      // Assert
      expect(keychain.getToken).toHaveBeenCalledTimes(1);
      expect(keychain.getDomain).toHaveBeenCalledTimes(1);
      expect(keychain.getTokenExpiresAt).toHaveBeenCalledTimes(1);

      expect(cliOutput).toHaveBeenCalledWith(
        expect.stringContaining('Active authentication session')
      );
      expect(cliOutput).toHaveBeenCalledWith(expect.stringContaining(mockDomain));
      expect(cliOutput).toHaveBeenCalledWith(expect.stringContaining('Token expires'));
    });

    it('should show expired token message when token is expired', async () => {
      // Arrange
      const mockToken = 'mock-token';
      const mockDomain = 'test-tenant.auth0.com';
      const mockExpiresAt = Date.now() - 3600000; // 1 hour ago (expired)

      vi.mocked(keychain.getToken).mockResolvedValue(mockToken);
      vi.mocked(keychain.getDomain).mockResolvedValue(mockDomain);
      vi.mocked(keychain.getTokenExpiresAt).mockResolvedValue(mockExpiresAt);

      // Act
      await session();

      // Assert
      expect(cliOutput).toHaveBeenCalledWith(expect.stringContaining('Expired'));
    });
  });

  describe('when not authenticated', () => {
    it('should show "no active session" message', async () => {
      // Arrange
      vi.mocked(keychain.getToken).mockResolvedValue(null);
      vi.mocked(keychain.getDomain).mockResolvedValue(null);

      // Act
      await session();

      // Assert
      expect(keychain.getToken).toHaveBeenCalledTimes(1);
      expect(keychain.getDomain).toHaveBeenCalledTimes(1);

      expect(cliOutput).toHaveBeenCalledWith(
        expect.stringContaining('No active authentication session found')
      );
      expect(cliOutput).toHaveBeenCalledWith(expect.stringContaining('init'));
    });
  });

  describe('error handling', () => {
    it('should handle errors gracefully', async () => {
      // Arrange
      const mockError = new Error('Test error');
      vi.mocked(keychain.getToken).mockRejectedValue(mockError);

      // Act
      await session();

      // Assert
      expect(log).toHaveBeenCalledWith('Error retrieving session information:', mockError);
      expect(cliOutput).toHaveBeenCalledWith(
        expect.stringContaining('Failed to retrieve session information')
      );
    });
  });
});
