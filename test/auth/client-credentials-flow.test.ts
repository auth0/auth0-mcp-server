import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { requestClientCredentialsAuthorization } from '../../src/auth/client-credentials-flow';
import { keychain } from '../../src/utils/keychain';

// Mock dependencies
vi.mock('../../src/utils/logger', () => ({
  log: vi.fn(),
  logError: vi.fn(),
}));

vi.mock('../../src/utils/terminal', () => ({
  cliOutput: vi.fn(),
  getTenantFromToken: vi.fn().mockReturnValue('test-tenant'),
}));

vi.mock('../../src/utils/keychain', () => ({
  keychain: {
    setToken: vi.fn().mockResolvedValue(undefined),
    setDomain: vi.fn().mockResolvedValue(undefined),
    setRefreshToken: vi.fn().mockResolvedValue(undefined),
    setTokenExpiresAt: vi.fn().mockResolvedValue(undefined),
  },
}));

describe('client-credentials-flow', () => {
  // Create a mock for global fetch
  const mockFetch = vi.fn();
  const mockProcess = {
    exit: vi.fn(),
  };

  beforeEach(() => {
    // Setup global fetch mock
    global.fetch = mockFetch;
    // Backup and replace process.exit
    global.process.exit = mockProcess.exit as any;
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  describe('requestClientCredentialsAuthorization', () => {
    it('should successfully obtain and store tokens via client credentials flow', async () => {
      // Setup mock response for the token request
      const mockTokenResponse = {
        access_token: 'test-access-token',
        expires_in: 86400,
        token_type: 'Bearer',
      };

      // Configure fetch mock to return token response
      mockFetch.mockResolvedValueOnce({
        json: async () => mockTokenResponse,
      });

      // Test config
      const testConfig = {
        auth0Domain: 'test-domain.auth0.com',
        auth0ClientId: 'test-client-id',
        auth0ClientSecret: 'test-client-secret',
        scopes: ['read:users', 'read:clients'],
      };

      // Execute the function
      await requestClientCredentialsAuthorization(testConfig);

      // Verify fetch was called with the right parameters
      expect(mockFetch).toHaveBeenCalledWith(
        `https://${testConfig.auth0Domain}/oauth/token`,
        expect.objectContaining({
          method: 'POST',
          body: expect.any(URLSearchParams),
          headers: expect.objectContaining({
            Accept: 'application/json',
            'Content-Type': 'application/x-www-form-urlencoded',
          }),
        })
      );

      // Verify the request body
      const fetchCall = mockFetch.mock.calls[0];
      const requestBody = fetchCall[1].body;
      expect(requestBody.get('client_id')).toBe(testConfig.auth0ClientId);
      expect(requestBody.get('client_secret')).toBe(testConfig.auth0ClientSecret);
      expect(requestBody.get('grant_type')).toBe('client_credentials');
      expect(requestBody.get('scope')).toBeNull();
      expect(requestBody.get('audience')).toBe(`https://${testConfig.auth0Domain}/api/v2/`);

      // Verify the tokens were stored correctly
      expect(keychain.setToken).toHaveBeenCalledWith(mockTokenResponse.access_token);
      expect(keychain.setDomain).toHaveBeenCalledWith(testConfig.auth0Domain);
      expect(keychain.setTokenExpiresAt).toHaveBeenCalledWith(
        expect.any(Number) // We don't need to test the exact timestamp
      );
    });

    it('should handle authentication errors', async () => {
      // Setup mock error response
      const mockErrorResponse = {
        error: 'invalid_client',
        error_description: 'Client authentication failed',
      };

      // Configure fetch mock to return error
      mockFetch.mockResolvedValueOnce({
        json: async () => mockErrorResponse,
      });

      // Test config
      const testConfig = {
        auth0Domain: 'test-domain.auth0.com',
        auth0ClientId: 'invalid-client-id',
        auth0ClientSecret: 'invalid-client-secret',
      };

      // Execute the function and expect process.exit to be called
      await requestClientCredentialsAuthorization(testConfig);
      expect(mockProcess.exit).toHaveBeenCalledWith(1);
    });

    it('should handle fetch errors', async () => {
      // Configure fetch mock to throw an error
      mockFetch.mockRejectedValueOnce(new Error('Network error'));

      // Test config
      const testConfig = {
        auth0Domain: 'test-domain.auth0.com',
        auth0ClientId: 'test-client-id',
        auth0ClientSecret: 'test-client-secret',
      };

      // Execute the function and expect process.exit to be called
      await requestClientCredentialsAuthorization(testConfig);
      expect(mockProcess.exit).toHaveBeenCalledWith(1);
    });

    it('should use default audience if none provided', async () => {
      // Setup mock response for the token request
      const mockTokenResponse = {
        access_token: 'test-access-token',
        expires_in: 86400,
        token_type: 'Bearer',
      };

      // Configure fetch mock to return token response
      mockFetch.mockResolvedValueOnce({
        json: async () => mockTokenResponse,
      });

      // Test config without audience
      const testConfig = {
        auth0Domain: 'test-domain.auth0.com',
        auth0ClientId: 'test-client-id',
        auth0ClientSecret: 'test-client-secret',
      };

      // Execute the function
      await requestClientCredentialsAuthorization(testConfig);

      // Verify the request body contains default audience
      const fetchCall = mockFetch.mock.calls[0];
      const requestBody = fetchCall[1].body;
      expect(requestBody.get('audience')).toBe(`https://${testConfig.auth0Domain}/api/v2/`);
    });
  });
});
