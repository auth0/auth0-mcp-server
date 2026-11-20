import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import keytar from '@github/keytar';
import * as deviceAuthFlow from '../../src/auth/device-auth-flow';
import { KEYCHAIN_SERVICE_NAME, KeychainItem } from '../../src/utils/constants';

// Mock dependencies
vi.mock('@github/keytar');
vi.mock('open');
vi.mock('../../src/utils/terminal', () => ({
  startSpinner: vi.fn(),
  stopSpinner: vi.fn(),
  getTenantFromToken: vi.fn().mockReturnValue('test-tenant.auth0.com'),
  cliOutput: vi.fn(),
  promptForBrowserPermission: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('../../src/utils/logger', () => ({
  log: vi.fn(),
  logError: vi.fn(),
}));

// Mock global fetch
const mockFetchResponse = (status: number, data: any) => {
  return {
    status,
    json: vi.fn().mockResolvedValue(data),
  };
};

describe('Device Auth Flow', () => {
  let originalFetch: typeof global.fetch;
  let mockFetch: any;

  beforeEach(() => {
    // Save original fetch and replace with mock
    originalFetch = global.fetch;
    mockFetch = vi.fn();
    global.fetch = mockFetch as any;

    // Reset all mocks
    vi.resetAllMocks();
  });

  afterEach(() => {
    // Restore original fetch
    global.fetch = originalFetch;
  });

  describe('isTokenExpired', () => {
    it('should return true if no expiration time is found', async () => {
      vi.mocked(keytar.getPassword).mockResolvedValue(null);

      const result = await deviceAuthFlow.isTokenExpired();

      expect(result).toBe(true);
      expect(keytar.getPassword).toHaveBeenCalledWith(
        KEYCHAIN_SERVICE_NAME,
        KeychainItem.TOKEN_EXPIRES_AT
      );
    });

    it('should return true if token is expired', async () => {
      // Set expiration time to 5 minutes ago
      const expiresAt = Date.now() - 5 * 60 * 1000;
      vi.mocked(keytar.getPassword).mockResolvedValue(expiresAt.toString());

      const result = await deviceAuthFlow.isTokenExpired();

      expect(result).toBe(true);
    });

    it('should return true if token expires within buffer time', async () => {
      // Set expiration time to 2 minutes in the future (default buffer is 5 minutes)
      const expiresAt = Date.now() + 2 * 60 * 1000;
      vi.mocked(keytar.getPassword).mockResolvedValue(expiresAt.toString());

      const result = await deviceAuthFlow.isTokenExpired();

      expect(result).toBe(true);
    });

    it('should return false if token is not expired and not within buffer time', async () => {
      // Set expiration time to 10 minutes in the future (default buffer is 5 minutes)
      const expiresAt = Date.now() + 10 * 60 * 1000;
      vi.mocked(keytar.getPassword).mockResolvedValue(expiresAt.toString());

      const result = await deviceAuthFlow.isTokenExpired();

      expect(result).toBe(false);
    });

    it('should handle custom buffer time', async () => {
      // Set expiration time to 2 minutes in the future
      const expiresAt = Date.now() + 2 * 60 * 1000;
      vi.mocked(keytar.getPassword).mockResolvedValue(expiresAt.toString());

      // With 1 minute buffer, token should not be considered expired
      const result = await deviceAuthFlow.isTokenExpired(60);

      expect(result).toBe(false);
    });

    it('should return true on error', async () => {
      vi.mocked(keytar.getPassword).mockRejectedValue(new Error('Keytar error'));

      const result = await deviceAuthFlow.isTokenExpired();

      expect(result).toBe(true);
    });
  });

  describe('refreshAccessToken', () => {
    it('should return null if no refresh token is found', async () => {
      vi.mocked(keytar.getPassword).mockResolvedValue(null);

      const result = await deviceAuthFlow.refreshAccessToken();

      expect(result).toBeNull();
      expect(keytar.getPassword).toHaveBeenCalledWith(
        KEYCHAIN_SERVICE_NAME,
        KeychainItem.REFRESH_TOKEN
      );
    });

    it('should refresh token successfully', async () => {
      // Mock refresh token
      vi.mocked(keytar.getPassword).mockResolvedValue('mock-refresh-token');

      // Mock fetch response
      mockFetch.mockResolvedValue(
        mockFetchResponse(200, {
          access_token: 'new-access-token',
          refresh_token: 'new-refresh-token',
          expires_in: 86400,
        })
      );

      const result = await deviceAuthFlow.refreshAccessToken();

      expect(result).toBe('new-access-token');
      expect(keytar.setPassword).toHaveBeenCalledWith(
        KEYCHAIN_SERVICE_NAME,
        KeychainItem.TOKEN,
        'new-access-token'
      );
      expect(keytar.setPassword).toHaveBeenCalledWith(
        KEYCHAIN_SERVICE_NAME,
        KeychainItem.REFRESH_TOKEN,
        'new-refresh-token'
      );
      expect(keytar.setPassword).toHaveBeenCalledWith(
        KEYCHAIN_SERVICE_NAME,
        KeychainItem.TOKEN_EXPIRES_AT,
        expect.any(String)
      );
      expect(keytar.setPassword).toHaveBeenCalledTimes(4); // Token, domain, refresh token, expires_at
    });

    it('should handle error response from token endpoint', async () => {
      // Mock refresh token
      vi.mocked(keytar.getPassword).mockResolvedValue('mock-refresh-token');

      // Mock fetch response with error
      mockFetch.mockResolvedValue(
        mockFetchResponse(400, {
          error: 'invalid_grant',
        })
      );

      const result = await deviceAuthFlow.refreshAccessToken();

      expect(result).toBeNull();
      expect(keytar.setPassword).not.toHaveBeenCalled();
    });

    it('should handle fetch error', async () => {
      // Mock refresh token
      vi.mocked(keytar.getPassword).mockResolvedValue('mock-refresh-token');

      // Mock fetch error
      mockFetch.mockRejectedValue(new Error('Network error'));

      const result = await deviceAuthFlow.refreshAccessToken();

      expect(result).toBeNull();
      expect(keytar.setPassword).not.toHaveBeenCalled();
    });
  });

  describe('getValidAccessToken', () => {
    const mockKeychain = (items: Record<string, string | null>) => {
      vi.mocked(keytar.getPassword).mockImplementation(
        async (_service: string, item: string) => items[item] ?? null
      );
    };

    it('should return the stored token when it is not expired', async () => {
      mockKeychain({
        [KeychainItem.TOKEN]: 'stored-access-token',
        [KeychainItem.TOKEN_EXPIRES_AT]: String(Date.now() + 60 * 60 * 1000),
        [KeychainItem.REFRESH_TOKEN]: 'mock-refresh-token',
      });

      const result = await deviceAuthFlow.getValidAccessToken();

      expect(result).toBe('stored-access-token');
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('should use the refresh token when the access token has expired', async () => {
      mockKeychain({
        [KeychainItem.TOKEN]: 'expired-access-token',
        [KeychainItem.TOKEN_EXPIRES_AT]: String(Date.now() - 60 * 1000),
        [KeychainItem.REFRESH_TOKEN]: 'mock-refresh-token',
      });
      mockFetch.mockResolvedValue(
        mockFetchResponse(200, {
          access_token: 'new-access-token',
          refresh_token: 'new-refresh-token',
          expires_in: 86400,
        })
      );

      const result = await deviceAuthFlow.getValidAccessToken();

      expect(result).toBe('new-access-token');
      expect(mockFetch).toHaveBeenCalledTimes(1);
      const [url, init] = mockFetch.mock.calls[0];
      expect(String(url)).toContain('/oauth/token');
      expect(String(init.body)).toContain('grant_type=refresh_token');
      expect(String(init.body)).toContain('refresh_token=mock-refresh-token');
      expect(keytar.setPassword).toHaveBeenCalledWith(
        KEYCHAIN_SERVICE_NAME,
        KeychainItem.TOKEN,
        'new-access-token'
      );
    });

    it('should return null when the token has expired and there is no refresh token', async () => {
      mockKeychain({
        [KeychainItem.TOKEN]: 'expired-access-token',
        [KeychainItem.TOKEN_EXPIRES_AT]: String(Date.now() - 60 * 1000),
      });

      const result = await deviceAuthFlow.getValidAccessToken();

      expect(result).toBeNull();
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('should return null when the token has expired and the refresh is rejected', async () => {
      mockKeychain({
        [KeychainItem.TOKEN]: 'expired-access-token',
        [KeychainItem.TOKEN_EXPIRES_AT]: String(Date.now() - 60 * 1000),
        [KeychainItem.REFRESH_TOKEN]: 'revoked-refresh-token',
      });
      mockFetch.mockResolvedValue(mockFetchResponse(403, { error: 'invalid_grant' }));

      const result = await deviceAuthFlow.getValidAccessToken();

      expect(result).toBeNull();
      expect(keytar.setPassword).not.toHaveBeenCalled();
    });

    it('should send a single refresh request for concurrent callers', async () => {
      mockKeychain({
        [KeychainItem.TOKEN]: 'expired-access-token',
        [KeychainItem.TOKEN_EXPIRES_AT]: String(Date.now() - 60 * 1000),
        [KeychainItem.REFRESH_TOKEN]: 'mock-refresh-token',
      });
      mockFetch.mockResolvedValue(
        mockFetchResponse(200, {
          access_token: 'new-access-token',
          refresh_token: 'new-refresh-token',
          expires_in: 86400,
        })
      );

      const results = await Promise.all([
        deviceAuthFlow.getValidAccessToken(),
        deviceAuthFlow.getValidAccessToken(),
        deviceAuthFlow.getValidAccessToken(),
      ]);

      expect(results).toEqual(['new-access-token', 'new-access-token', 'new-access-token']);
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });
  });

  describe('revokeRefreshToken', () => {
    // Since we can't easily test the actual implementation due to mocking challenges,
    // we'll just test that the function exists and can be called
    it('should be a function', () => {
      expect(typeof deviceAuthFlow.revokeRefreshToken).toBe('function');
    });

    it('should return true if refresh token is not present', async () => {
      vi.mocked(keytar.getPassword).mockResolvedValue(null);

      const result = await deviceAuthFlow.revokeRefreshToken();

      expect(result).toBe(true);
      expect(keytar.getPassword).toHaveBeenCalledWith(
        KEYCHAIN_SERVICE_NAME,
        KeychainItem.REFRESH_TOKEN
      );
    });

    it('should return false if return 400', async () => {
      vi.mocked(keytar.getPassword).mockResolvedValue('mock-rt');

      // Mock fetch response with error
      mockFetch.mockResolvedValue(
        mockFetchResponse(400, {
          error: 'bad request',
        })
      );

      const result = await deviceAuthFlow.revokeRefreshToken();

      expect(result).toBe(false);
      expect(keytar.getPassword).toHaveBeenCalledWith(
        KEYCHAIN_SERVICE_NAME,
        KeychainItem.REFRESH_TOKEN
      );
    });

    it('should return false if return 401', async () => {
      vi.mocked(keytar.getPassword).mockResolvedValue('mock-rt');

      // Mock fetch response with error
      mockFetch.mockResolvedValue(
        mockFetchResponse(401, {
          error: 'unauthorized',
        })
      );

      const result = await deviceAuthFlow.revokeRefreshToken();

      expect(result).toBe(false);
      expect(keytar.getPassword).toHaveBeenCalledWith(
        KEYCHAIN_SERVICE_NAME,
        KeychainItem.REFRESH_TOKEN
      );
    });

    it('should return true if status is 200', async () => {
      vi.mocked(keytar.getPassword).mockResolvedValue('mock-rt');

      // Mock fetch response with error
      mockFetch.mockResolvedValue(mockFetchResponse(200, {}));

      const result = await deviceAuthFlow.revokeRefreshToken();

      expect(result).toBe(true);
      expect(keytar.getPassword).toHaveBeenCalledWith(
        KEYCHAIN_SERVICE_NAME,
        KeychainItem.REFRESH_TOKEN
      );
    });
  });

  // Simple test to verify no Auth0 values are set to environment variables
  describe('Environment Variables', () => {
    it('should not set any Auth0 values in environment variables', async () => {
      // Save original environment
      const originalEnv = { ...process.env };

      // Clear all Auth0 environment variables
      delete process.env.AUTH0_TOKEN;
      delete process.env.AUTH0_DOMAIN;
      delete process.env.AUTH0_TENANT_NAME;
      delete process.env.AUTH0_CLIENT_ID;

      // Mock successful token response
      mockFetch.mockResolvedValue(
        mockFetchResponse(200, {
          access_token: 'new-access-token',
          refresh_token: 'new-refresh-token',
          expires_in: 86400,
        })
      );

      // Call the token function
      await deviceAuthFlow.refreshAccessToken();

      // Simply verify no Auth0 values are in the environment
      expect(process.env.AUTH0_TOKEN).toBeUndefined();
      expect(process.env.AUTH0_DOMAIN).toBeUndefined();
      expect(process.env.AUTH0_TENANT_NAME).toBeUndefined();
      expect(process.env.AUTH0_CLIENT_ID).toBeUndefined();

      // Restore original environment
      process.env = originalEnv;
    });
  });
});
