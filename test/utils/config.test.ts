import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../../src/utils/keychain.js', () => ({
  keychain: {
    getToken: vi.fn(),
    getDomain: vi.fn(),
    getTokenExpiresAt: vi.fn(),
  },
}));

vi.mock('../../src/auth/device-auth-flow.js', () => ({
  getValidAccessToken: vi.fn(),
  isTokenExpired: vi.fn(),
  refreshAccessToken: vi.fn(),
}));

vi.mock('../../src/utils/logger.js', () => ({
  log: vi.fn(),
}));

import { loadConfig, validateConfig } from '../../src/utils/config.js';
import { keychain } from '../../src/utils/keychain.js';
import { getValidAccessToken, isTokenExpired } from '../../src/auth/device-auth-flow.js';

describe('loadConfig', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('returns env var config when AUTH0_DOMAIN and AUTH0_TOKEN are set', async () => {
    vi.stubEnv('AUTH0_DOMAIN', 'env-tenant.auth0.com');
    vi.stubEnv('AUTH0_TOKEN', 'env-token');

    const config = await loadConfig();

    expect(config).toEqual({
      domain: 'env-tenant.auth0.com',
      token: 'env-token',
      tenantName: 'env-tenant.auth0.com',
      source: 'env',
    });
    expect(getValidAccessToken).not.toHaveBeenCalled();
    expect(keychain.getDomain).not.toHaveBeenCalled();
  });

  it('falls back to keychain when env vars are not set', async () => {
    vi.stubEnv('AUTH0_DOMAIN', '');
    vi.stubEnv('AUTH0_TOKEN', '');
    vi.mocked(getValidAccessToken).mockResolvedValue('keychain-token');
    vi.mocked(keychain.getDomain).mockResolvedValue('keychain-tenant.auth0.com');

    const config = await loadConfig();

    expect(config).toEqual({
      domain: 'keychain-tenant.auth0.com',
      token: 'keychain-token',
      tenantName: 'keychain-tenant.auth0.com',
      source: 'keychain',
    });
  });

  it('falls back to keychain when only AUTH0_DOMAIN is set', async () => {
    vi.stubEnv('AUTH0_DOMAIN', 'env-tenant.auth0.com');
    vi.stubEnv('AUTH0_TOKEN', '');
    vi.mocked(getValidAccessToken).mockResolvedValue('keychain-token');
    vi.mocked(keychain.getDomain).mockResolvedValue('keychain-tenant.auth0.com');

    const config = await loadConfig();

    expect(config?.source).toBe('keychain');
    expect(getValidAccessToken).toHaveBeenCalled();
  });
});

describe('validateConfig', () => {
  beforeEach(() => {
    vi.mocked(isTokenExpired).mockResolvedValue(false);
  });

  it('returns false for null config', async () => {
    expect(await validateConfig(null)).toBe(false);
  });

  it('returns false when token is missing', async () => {
    expect(await validateConfig({ domain: 'tenant.auth0.com', token: '', source: 'env' })).toBe(false);
  });

  it('returns false when domain is missing', async () => {
    expect(await validateConfig({ domain: '', token: 'some-token', source: 'env' })).toBe(false);
  });

  it('skips isTokenExpired check when source is env', async () => {
    const config = { domain: 'tenant.auth0.com', token: 'env-token', source: 'env' as const };

    const result = await validateConfig(config);

    expect(result).toBe(true);
    expect(isTokenExpired).not.toHaveBeenCalled();
  });

  it('checks isTokenExpired when source is keychain', async () => {
    vi.mocked(isTokenExpired).mockResolvedValue(false);
    const config = { domain: 'tenant.auth0.com', token: 'keychain-token', source: 'keychain' as const };

    const result = await validateConfig(config);

    expect(result).toBe(true);
    expect(isTokenExpired).toHaveBeenCalled();
  });

  it('returns false when keychain token is expired', async () => {
    vi.mocked(isTokenExpired).mockResolvedValue(true);
    const config = { domain: 'tenant.auth0.com', token: 'keychain-token', source: 'keychain' as const };

    expect(await validateConfig(config)).toBe(false);
  });
});
