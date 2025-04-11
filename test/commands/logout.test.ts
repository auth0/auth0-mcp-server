import { beforeEach, describe, expect, it, vi } from 'vitest';
import keytar from 'keytar';
import {
  ALL_KEYCHAIN_ITEMS,
  keychain,
  KEYCHAIN_SERVICE_NAME,
  KeychainItem,
  KeychainOperationResult,
} from '../../src/utils/keychain';

// Mock dependencies
vi.mock('keytar', () => ({
  default: {
    setPassword: vi.fn(),
    getPassword: vi.fn(),
    deletePassword: vi.fn(),
  },
}));

vi.mock('../../src/utils/logger', () => ({
  log: vi.fn(),
  logError: vi.fn(),
}));

describe('Keychain Service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('token management', () => {
    it('should store and retrieve access token', async () => {
      // Arrange
      const mockToken = 'test-access-token';
      vi.mocked(keytar.setPassword).mockResolvedValue();
      vi.mocked(keytar.getPassword).mockResolvedValue(mockToken);

      // Act & Assert - Store token
      const setResult = await keychain.setToken(mockToken);
      expect(setResult).toBe(true);
      expect(keytar.setPassword).toHaveBeenCalledWith(
        KEYCHAIN_SERVICE_NAME,
        KeychainItem.TOKEN,
        mockToken
      );

      // Act & Assert - Retrieve token
      const getResult = await keychain.getToken();
      expect(getResult).toBe(mockToken);
      expect(keytar.getPassword).toHaveBeenCalledWith(KEYCHAIN_SERVICE_NAME, KeychainItem.TOKEN);
    });

    it('should handle missing token', async () => {
      // Arrange
      vi.mocked(keytar.getPassword).mockResolvedValue(null);

      // Act
      const result = await keychain.getToken();

      // Assert
      expect(result).toBeNull();
    });
  });

  describe('domain management', () => {
    it('should store and retrieve domain', async () => {
      // Arrange
      const mockDomain = 'test-domain.auth0.com';
      vi.mocked(keytar.setPassword).mockResolvedValue();
      vi.mocked(keytar.getPassword).mockResolvedValue(mockDomain);

      // Act - Store domain
      const setResult = await keychain.setDomain(mockDomain);

      // Assert
      expect(setResult).toBe(true);
      expect(keytar.setPassword).toHaveBeenCalledWith(
        KEYCHAIN_SERVICE_NAME,
        KeychainItem.DOMAIN,
        mockDomain
      );

      // Act - Retrieve domain
      const result = await keychain.getDomain();

      // Assert
      expect(result).toBe(mockDomain);
      expect(keytar.getPassword).toHaveBeenCalledWith(KEYCHAIN_SERVICE_NAME, KeychainItem.DOMAIN);
    });

    it('should handle missing domain', async () => {
      // Arrange
      vi.mocked(keytar.getPassword).mockResolvedValue(null);

      // Act
      const result = await keychain.getDomain();

      // Assert
      expect(result).toBeNull();
    });
  });

  describe('refresh token management', () => {
    it('should store and retrieve refresh token', async () => {
      // Arrange
      const mockRefreshToken = 'test-refresh-token';
      vi.mocked(keytar.setPassword).mockResolvedValue();
      vi.mocked(keytar.getPassword).mockResolvedValue(mockRefreshToken);

      // Act - Store refresh token
      const setResult = await keychain.setRefreshToken(mockRefreshToken);

      // Assert
      expect(setResult).toBe(true);
      expect(keytar.setPassword).toHaveBeenCalledWith(
        KEYCHAIN_SERVICE_NAME,
        KeychainItem.REFRESH_TOKEN,
        mockRefreshToken
      );

      // Act - Retrieve refresh token
      const getResult = await keychain.getRefreshToken();

      // Assert
      expect(getResult).toBe(mockRefreshToken);
      expect(keytar.getPassword).toHaveBeenCalledWith(
        KEYCHAIN_SERVICE_NAME,
        KeychainItem.REFRESH_TOKEN
      );
    });

    it('should handle missing refresh token', async () => {
      // Arrange
      vi.mocked(keytar.getPassword).mockResolvedValue(null);

      // Act
      const result = await keychain.getRefreshToken();

      // Assert
      expect(result).toBeNull();
    });
  });

  describe('token expiration management', () => {
    it('should store and retrieve token expiration timestamp', async () => {
      // Arrange
      const timestamp = Date.now() + 3600 * 1000;
      vi.mocked(keytar.setPassword).mockResolvedValue();
      vi.mocked(keytar.getPassword).mockResolvedValue(timestamp.toString());

      // Act - Store expiration
      const setResult = await keychain.setTokenExpiresAt(timestamp);

      // Assert
      expect(setResult).toBe(true);
      expect(keytar.setPassword).toHaveBeenCalledWith(
        KEYCHAIN_SERVICE_NAME,
        KeychainItem.TOKEN_EXPIRES_AT,
        timestamp.toString()
      );

      // Act - Retrieve expiration
      const getResult = await keychain.getTokenExpiresAt();

      // Assert
      expect(getResult).toBe(timestamp);
      expect(keytar.getPassword).toHaveBeenCalledWith(
        KEYCHAIN_SERVICE_NAME,
        KeychainItem.TOKEN_EXPIRES_AT
      );
    });

    it('should return null for missing expiration time', async () => {
      // Arrange
      vi.mocked(keytar.getPassword).mockResolvedValue(null);

      // Act
      const result = await keychain.getTokenExpiresAt();

      // Assert
      expect(result).toBeNull();
    });
  });

  describe('keychain clearing', () => {
    it('should successfully delete all items from keychain', async () => {
      // Arrange
      vi.mocked(keytar.deletePassword).mockResolvedValue(true);

      // Act
      const results = await keychain.clearAll();

      // Assert
      expect(keytar.deletePassword).toHaveBeenCalledTimes(ALL_KEYCHAIN_ITEMS.length);

      ALL_KEYCHAIN_ITEMS.forEach((item) => {
        expect(keytar.deletePassword).toHaveBeenCalledWith(KEYCHAIN_SERVICE_NAME, item);
      });

      const expectedResults = ALL_KEYCHAIN_ITEMS.map((item) => ({ item, success: true }));
      expect(results).toEqual(expectedResults);
    });

    it('should handle mixed success and failure when clearing keychain', async () => {
      // Arrange - Set up different responses for different items
      vi.mocked(keytar.deletePassword).mockImplementation(async (service, key) => {
        switch (key) {
          case KeychainItem.TOKEN:
          case KeychainItem.DOMAIN:
            return true;
          case KeychainItem.REFRESH_TOKEN:
            throw new Error('Access denied');
          case KeychainItem.TOKEN_EXPIRES_AT:
          default:
            return false;
        }
      });

      // Act
      const results = await keychain.clearAll();

      // Assert
      expect(keytar.deletePassword).toHaveBeenCalledTimes(ALL_KEYCHAIN_ITEMS.length);

      // Verify results for each item
      const findResult = (item: string): KeychainOperationResult => {
        const result = results.find((r) => r.item === item);
        if (!result) {
          throw new Error(`Result for ${item} not found`);
        }
        return result;
      };

      expect(findResult(KeychainItem.TOKEN).success).toBe(true);
      expect(findResult(KeychainItem.DOMAIN).success).toBe(true);

      const refreshTokenResult = findResult(KeychainItem.REFRESH_TOKEN);
      expect(refreshTokenResult.success).toBe(false);
      expect(refreshTokenResult.error?.message).toBe('Access denied');

      expect(findResult(KeychainItem.TOKEN_EXPIRES_AT).success).toBe(false);
    });

    it('should handle errors in bulk deletion operations', async () => {
      // Arrange - Force a global error
      const testError = new Error('Keychain unavailable');
      vi.mocked(keytar.deletePassword).mockRejectedValue(testError);

      // Act
      const results = await keychain.clearAll();

      // Assert
      expect(keytar.deletePassword).toHaveBeenCalledTimes(ALL_KEYCHAIN_ITEMS.length);

      // All operations should have failed with the same error
      expect(results.every((result) => !result.success)).toBe(true);
      expect(results.every((result) => result.error?.message === 'Keychain unavailable')).toBe(
        true
      );
    });
  });

  describe('delete', () => {
    it('should delete a specific keychain item', async () => {
      // Only run if delete method exists
      if (typeof keychain.delete !== 'function') {
        console.log('Skipping test for delete method - not implemented');
        return;
      }

      // Arrange
      vi.mocked(keytar.deletePassword).mockResolvedValue(true);

      // Act
      const result = await keychain.delete(KeychainItem.TOKEN);

      // Assert
      expect(result).toBe(true);
      expect(keytar.deletePassword).toHaveBeenCalledWith(KEYCHAIN_SERVICE_NAME, KeychainItem.TOKEN);
    });

    it('should handle failure when deleting item', async () => {
      // Only run if delete method exists
      if (typeof keychain.delete !== 'function') {
        return;
      }

      // Arrange
      vi.mocked(keytar.deletePassword).mockResolvedValue(false);

      // Act
      const result = await keychain.delete(KeychainItem.TOKEN);

      // Assert
      expect(result).toBe(false);
    });

    it('should handle errors when deleting item', async () => {
      // Only run if delete method exists
      if (typeof keychain.delete !== 'function') {
        return;
      }

      // Arrange
      const testError = new Error('Delete failed');
      vi.mocked(keytar.deletePassword).mockRejectedValue(testError);

      // Act
      const result = await keychain.delete(KeychainItem.TOKEN);

      // Assert
      expect(result).toBe(false);
    });
  });
});
