import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ManagementClient } from 'auth0';
import { getManagementClient } from '../../src/utils/management-client';
import * as packageModule from '../../src/utils/package';

// Mock dependencies
vi.mock('auth0', () => ({
  ManagementClient: vi.fn().mockImplementation(() => ({
    // Mock implementation as needed
  })),
}));

vi.mock('../../src/utils/package', () => ({
  packageVersion: '1.2.3', // Mock version for consistent testing
}));

describe('Management Client', () => {
  const mockConfig = {
    domain: 'test-domain.auth0.com',
    token: 'test-token',
    clientId: 'test-client-id',
    clientSecret: 'test-client-secret',
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('getManagementClient', () => {
    it('should initialize ManagementClient with correct parameters', async () => {
      // Act
      await getManagementClient(mockConfig);

      // Assert
      expect(ManagementClient).toHaveBeenCalledWith({
        domain: mockConfig.domain,
        token: mockConfig.token,
        retry: { maxRetries: 10, enabled: true },
        headers: {
          'User-agent': expect.any(String),
        },
      });
    });

    it('should set User-Agent header with correct format', async () => {
      // Arrange
      const originalNodeVersion = process.version;
      Object.defineProperty(process, 'version', {
        value: 'v18.12.1',
        writable: true,
      });

      // Act
      await getManagementClient(mockConfig);

      // Assert
      const callArgs = vi.mocked(ManagementClient).mock.calls[0][0];
      const userAgent = callArgs.headers['User-agent'];

      // Format should be: "auth0-mcp-server/[version] (node.js/[node-version])"
      expect(userAgent).toBe(`auth0-mcp-server/1.2.3 (node.js/18.12.1)`);

      // Restore process.version
      Object.defineProperty(process, 'version', {
        value: originalNodeVersion,
      });
    });

    it('should strip the "v" prefix from Node.js version in User-Agent', async () => {
      // Arrange
      const originalNodeVersion = process.version;
      Object.defineProperty(process, 'version', {
        value: 'v20.0.0',
        writable: true,
      });

      // Act
      await getManagementClient(mockConfig);

      // Assert
      const callArgs = vi.mocked(ManagementClient).mock.calls[0][0];
      const userAgent = callArgs.headers['User-agent'];

      // Should NOT contain "v" prefix in Node version
      expect(userAgent).toContain('node.js/20.0.0');
      expect(userAgent).not.toContain('node.js/v20.0.0');

      // Restore process.version
      Object.defineProperty(process, 'version', {
        value: originalNodeVersion,
      });
    });

    it('should use actual package version from package.ts', async () => {
      // Arrange
      const testVersion = '9.9.9';
      const spy = vi.spyOn(packageModule, 'packageVersion', 'get').mockReturnValue(testVersion);

      // Act
      await getManagementClient(mockConfig);

      // Assert
      const callArgs = vi.mocked(ManagementClient).mock.calls[0][0];
      const userAgent = callArgs.headers['User-agent'];
      expect(userAgent).toContain(`auth0-mcp-server/${testVersion}`);

      // Cleanup
      spy.mockRestore();
    });
  });
});
