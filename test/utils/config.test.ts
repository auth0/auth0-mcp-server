import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { jwtDecode } from 'jwt-decode';
import { keychain } from '../../src/utils/keychain.js';
import { getValidAccessToken, isTokenExpired } from '../../src/auth/device-auth-flow.js';
import { getTenantFromToken } from '../../src/utils/terminal.js';

vi.mock('jwt-decode', () => ({
  jwtDecode: vi.fn(),
}));

vi.mock('../../src/utils/keychain.js', () => ({
  keychain: {
    getDomain: vi.fn(),
  },
}));

vi.mock('../../src/auth/device-auth-flow.js', () => ({
  isTokenExpired: vi.fn(),
  refreshAccessToken: vi.fn(),
  getValidAccessToken: vi.fn(),
}));

vi.mock('../../src/utils/logger.js', () => ({
  log: vi.fn(),
  logError: vi.fn(),
}));

vi.mock('../../src/utils/terminal.js', () => ({
  getTenantFromToken: vi.fn(),
}));

describe('config', () => {
  const originalEnv = { ...process.env };

  const importConfigModule = async () => import('../../src/utils/config.js');

  beforeEach(() => {
    process.env = { ...originalEnv };
    delete process.env.AUTH0_TOKEN;
    delete process.env.AUTH0_DOMAIN;
    delete process.env.AUTH0_MCP_DEBUG;
    delete process.env.DEBUG;

    vi.resetModules();
    vi.clearAllMocks();

    vi.mocked(getTenantFromToken).mockReturnValue('inferred.auth0.com');
    vi.mocked(getValidAccessToken).mockResolvedValue('keychain-token');
    vi.mocked(keychain.getDomain).mockResolvedValue('keychain.auth0.com');
    vi.mocked(isTokenExpired).mockResolvedValue(false);
    vi.mocked(jwtDecode).mockReturnValue({
      exp: Math.floor(Date.now() / 1000) + 3600,
    });
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  describe('loadConfig', () => {
    it('prefers environment credentials when AUTH0_TOKEN is set', async () => {
      process.env.AUTH0_TOKEN = '  env-token  ';
      process.env.AUTH0_DOMAIN = 'tenant.auth0.com';

      const { loadConfig } = await importConfigModule();

      await expect(loadConfig()).resolves.toEqual({
        token: 'env-token',
        domain: 'tenant.auth0.com',
        tenantName: 'tenant.auth0.com',
        source: 'env',
      });
      expect(getValidAccessToken).not.toHaveBeenCalled();
      expect(keychain.getDomain).not.toHaveBeenCalled();
    });

    it('infers the domain from the token when AUTH0_DOMAIN is missing', async () => {
      process.env.AUTH0_TOKEN = 'env-token';

      const { loadConfig } = await importConfigModule();

      await expect(loadConfig()).resolves.toEqual({
        token: 'env-token',
        domain: 'inferred.auth0.com',
        tenantName: 'inferred.auth0.com',
        source: 'env',
      });
      expect(getTenantFromToken).toHaveBeenCalledWith('env-token');
    });

    it('falls back to keychain-backed credentials when AUTH0_TOKEN is absent', async () => {
      const { loadConfig } = await importConfigModule();

      await expect(loadConfig()).resolves.toEqual({
        token: 'keychain-token',
        domain: 'keychain.auth0.com',
        tenantName: 'keychain.auth0.com',
        source: 'keychain',
      });
      expect(getValidAccessToken).toHaveBeenCalledTimes(1);
      expect(keychain.getDomain).toHaveBeenCalledTimes(1);
    });
  });

  describe('validateConfig', () => {
    it('returns false when config is null', async () => {
      const { validateConfig } = await importConfigModule();

      await expect(validateConfig(null)).resolves.toBe(false);
    });

    it('rejects environment-backed config when the JWT is expired', async () => {
      vi.mocked(jwtDecode).mockReturnValue({
        exp: Math.floor(Date.now() / 1000) - 60,
      });

      const { validateConfig } = await importConfigModule();

      await expect(
        validateConfig({
          token: 'env-token',
          domain: 'tenant.auth0.com',
          source: 'env',
        })
      ).resolves.toBe(false);
      expect(isTokenExpired).not.toHaveBeenCalled();
    });

    it('accepts environment-backed config when the JWT is still valid', async () => {
      const { validateConfig } = await importConfigModule();

      await expect(
        validateConfig({
          token: 'env-token',
          domain: 'tenant.auth0.com',
          source: 'env',
        })
      ).resolves.toBe(true);
      expect(isTokenExpired).not.toHaveBeenCalled();
    });

    it('delegates token expiry checks for keychain-backed config', async () => {
      vi.mocked(isTokenExpired).mockResolvedValueOnce(true).mockResolvedValueOnce(false);

      const { validateConfig } = await importConfigModule();

      await expect(
        validateConfig({
          token: 'keychain-token',
          domain: 'tenant.auth0.com',
          source: 'keychain',
        })
      ).resolves.toBe(false);

      await expect(
        validateConfig({
          token: 'keychain-token',
          domain: 'tenant.auth0.com',
          source: 'keychain',
        })
      ).resolves.toBe(true);
    });
  });
});
