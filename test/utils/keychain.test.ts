import { beforeEach, describe, expect, it, vi } from 'vitest';
import keytar from 'keytar';
import {
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

describe('Keychain', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('token operations', () => {
    it('should store and retrieve access token', async () => {
      // Arrange
      const mockToken = 'test-access-token';
      vi.mocked(keytar.setPassword).mockResolvedValue();
      vi.mocked(keytar.getPassword).mockResolvedValue(mockToken);

      // Act - Store
      const storeResult = await keychain.setToken(mockToken);

      // Assert - Store
      expect(storeResult).toBe(true);
      expect(keytar.setPassword).toHaveBeenCalledWith(
        KEYCHAIN_SERVICE_NAME,
        KeychainItem.TOKEN,
        mockToken
      );

      // Act - Retrieve
      const retrieveResult = await keychain.getToken();

      // Assert - Retrieve
      expect(retrieveResult).toBe(mockToken);
      expect(keytar.getPassword).toHaveBeenCalledWith(KEYCHAIN_SERVICE_NAME, KeychainItem.TOKEN);
    });

    it('should return null when token is not found', async () => {
      // Arrange
      vi.mocked(keytar.getPassword).mockResolvedValue(null);

      // Act
      const result = await keychain.getToken();

      // Assert
      expect(result).toBeNull();
    });
  });

  describe('domain operations', () => {
    it('should store and retrieve domain', async () => {
      // Arrange
      const mockDomain = 'test-domain.auth0.com';
      vi.mocked(keytar.setPassword).mockResolvedValue();
      vi.mocked(keytar.getPassword).mockResolvedValue(mockDomain);

      // Act
      const storeResult = await keychain.setDomain(mockDomain);
      const retrieveResult = await keychain.getDomain();

      // Assert
      expect(storeResult).toBe(true);
      expect(retrieveResult).toBe(mockDomain);
      expect(keytar.setPassword).toHaveBeenCalledWith(
        KEYCHAIN_SERVICE_NAME,
        KeychainItem.DOMAIN,
        mockDomain
      );
    });
  });

  describe('refresh token operations', () => {
    it('should store and retrieve refresh token', async () => {
      // Arrange
      const mockRefreshToken = 'test-refresh-token';
      vi.mocked(keytar.setPassword).mockResolvedValue();
      vi.mocked(keytar.getPassword).mockResolvedValue(mockRefreshToken);

      // Act
      const storeResult = await keychain.setRefreshToken(mockRefreshToken);
      const retrieveResult = await keychain.getRefreshToken();

      // Assert
      expect(storeResult).toBe(true);
      expect(retrieveResult).toBe(mockRefreshToken);
      expect(keytar.setPassword).toHaveBeenCalledWith(
        KEYCHAIN_SERVICE_NAME,
        KeychainItem.REFRESH_TOKEN,
        mockRefreshToken
      );
    });
  });

  describe('token expiration operations', () => {
    it('should store and retrieve token expiration time', async () => {
      // Arrange
      const timestamp = Date.now() + 3600 * 1000;
      vi.mocked(keytar.setPassword).mockResolvedValue();
      vi.mocked(keytar.getPassword).mockResolvedValue(timestamp.toString());

      // Act
      const storeResult = await keychain.setTokenExpiresAt(timestamp);
      const retrieveResult = await keychain.getTokenExpiresAt();

      // Assert
      expect(storeResult).toBe(true);
      expect(retrieveResult).toBe(timestamp);
      expect(keytar.setPassword).toHaveBeenCalledWith(
        KEYCHAIN_SERVICE_NAME,
        KeychainItem.TOKEN_EXPIRES_AT,
        timestamp.toString()
      );
    });

    it('should return null when expiration time is not found', async () => {
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
      const results: KeychainOperationResult[] = await keychain.clearAll();

      // Assert
      expect(keytar.deletePassword).toHaveBeenCalledTimes(4);
      expect(results.every((r: KeychainOperationResult) => r.success)).toBe(true);
    });

    it('should handle failures when deleting items', async () => {
      // Arrange
      vi.mocked(keytar.deletePassword).mockImplementation(
        async (_service: string, key: string): Promise<boolean> => {
          if (key === KeychainItem.REFRESH_TOKEN) {
            throw new Error('Access denied');
          }
          return key === KeychainItem.TOKEN || key === KeychainItem.DOMAIN;
        }
      );

      // Act
      const results: KeychainOperationResult[] = await keychain.clearAll();

      // Assert
      expect(keytar.deletePassword).toHaveBeenCalledTimes(4);
      expect(results.filter((r: KeychainOperationResult) => r.success)).toHaveLength(2);
      expect(results.filter((r: KeychainOperationResult) => !r.success)).toHaveLength(2);

      const errorResult = results.find(
        (r: KeychainOperationResult) => r.item === KeychainItem.REFRESH_TOKEN
      );
      expect(errorResult?.error?.message).toBe('Access denied');
    });
  });
});
