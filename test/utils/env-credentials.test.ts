import { describe, it, expect, vi, beforeEach } from 'vitest';
import { http, HttpResponse } from 'msw';
import * as fs from 'fs';
import { server } from '../setup';

const { mockWriteCredentialsToEnv, mockParseEnvFile } = vi.hoisted(() => ({
  mockWriteCredentialsToEnv: vi.fn(),
  mockParseEnvFile: vi.fn(),
}));

vi.mock('../../src/utils/logger.js', () => ({ log: vi.fn() }));
vi.mock('../../src/utils/quickstarts.js', () => ({ fetchQuickstartSpec: vi.fn() }));
vi.mock('../../src/utils/credentials-writer.js', () => ({
  writeCredentialsToEnv: mockWriteCredentialsToEnv,
  parseEnvFile: mockParseEnvFile,
}));

vi.mock('fs');

import { resolveAndWriteCredentials } from '../../src/utils/env-credentials.js';
import { fetchQuickstartSpec } from '../../src/utils/quickstarts.js';

const mockFetchQuickstartSpec = vi.mocked(fetchQuickstartSpec);

const config = { domain: 'test.auth0.com' };
const token = 'valid-token';
const clientId = 'test-client-id';

const fallbackParams = {
  client_id: clientId,
  framework: 'sveltekit',
  project_path: '/mock/project',
};

const mockApplication = {
  client_id: clientId,
  name: 'Test App',
  client_secret: 'test-secret',
  callbacks: ['http://localhost:3000/callback'],
};

const mockWriteResult = {
  file_path: '/mock/project/.env.local',
  keys_written: ['AUTH0_DOMAIN', 'AUTH0_CLIENT_ID', 'AUTH0_CLIENT_SECRET'],
  file_created: true,
};

const specWithSecret = {
  appType: 'webapp' as const,
  defaultAppOrigin: { scheme: 'http', domain: 'localhost', port: 3000 },
  callbackPath: '/callback',
  logoutPath: '/logout',
  envSnippet: {
    type: 'env',
    language: 'shell',
    fileName: '.env.local',
    entries: [
      { type: 'var' as const, name: 'AUTH0_DOMAIN', value: '{yourDomain}' },
      { type: 'var' as const, name: 'AUTH0_CLIENT_ID', value: '{yourClientId}' },
      { type: 'var' as const, name: 'AUTH0_CLIENT_SECRET', value: '{yourClientSecret}', sensitive: true },
    ],
  },
  placeholders: {},
  inputs: {},
  environment: {},
};

const specSpaNoSecret = {
  appType: 'spa' as const,
  defaultAppOrigin: { scheme: 'http', domain: 'localhost', port: 3000 },
  callbackPath: '/callback',
  logoutPath: '/logout',
  envSnippet: {
    type: 'env',
    language: 'shell',
    fileName: '.env.local',
    entries: [
      { type: 'var' as const, name: 'AUTH0_DOMAIN', value: '{yourDomain}' },
      { type: 'var' as const, name: 'AUTH0_CLIENT_ID', value: '{yourClientId}' },
    ],
  },
  placeholders: {},
  inputs: {},
  environment: {},
};

const specWithSecret64 = {
  ...specWithSecret,
  envSnippet: {
    ...specWithSecret.envSnippet,
    entries: [
      ...specWithSecret.envSnippet.entries,
      { type: 'var' as const, name: 'AUTH0_SECRET', value: '{yourSecret}' },
    ],
  },
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(fs.existsSync).mockReturnValue(true);
  vi.mocked(fs.statSync).mockReturnValue({ isDirectory: () => true } as any);
  mockFetchQuickstartSpec.mockResolvedValue(null);
  mockWriteCredentialsToEnv.mockResolvedValue(mockWriteResult);
  mockParseEnvFile.mockReturnValue({});
});

describe('resolveAndWriteCredentials — project path validation', () => {
  it('returns error when project_path does not exist', async () => {
    vi.mocked(fs.existsSync).mockReturnValue(false);

    const result = await resolveAndWriteCredentials(fallbackParams, config, token);

    expect(result.success).toBe(false);
    if (!result.success) expect(result.error).toContain('does not exist or is not a directory');
  });

  it('returns error when project_path is not a directory', async () => {
    vi.mocked(fs.statSync).mockReturnValue({ isDirectory: () => false } as any);

    const result = await resolveAndWriteCredentials(fallbackParams, config, token);

    expect(result.success).toBe(false);
    if (!result.success) expect(result.error).toContain('does not exist or is not a directory');
  });
});

describe('resolveAndWriteCredentials — spec with no envSnippet', () => {
  it('returns success with no-op message when spec has no envSnippet', async () => {
    mockFetchQuickstartSpec.mockResolvedValue({
      ...specSpaNoSecret,
      envSnippet: undefined,
    });

    const result = await resolveAndWriteCredentials(fallbackParams, config, token);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.message).toBe('No .env file needed for this framework.');
      expect(result.keys_written).toEqual([]);
    }
    expect(mockWriteCredentialsToEnv).not.toHaveBeenCalled();
  });
});

describe('resolveAndWriteCredentials — fallback path (unsupported framework)', () => {
  it('returns 404 error when application is not found', async () => {
    server.use(
      http.get('https://*/api/v2/clients/:clientId', () => new HttpResponse(null, { status: 404 }))
    );

    const result = await resolveAndWriteCredentials(fallbackParams, config, token);

    expect(result.success).toBe(false);
    if (!result.success) expect(result.error).toContain(`Application with client_id '${clientId}' not found`);
  });

  it('returns 401 error with helpful message when token is expired or invalid', async () => {
    server.use(
      http.get('https://*/api/v2/clients/:clientId', () =>
        new HttpResponse(JSON.stringify({ message: 'Unauthorized' }), {
          status: 401,
          headers: { 'Content-Type': 'application/json' },
        })
      )
    );

    const result = await resolveAndWriteCredentials(fallbackParams, config, token);

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toContain('token may be expired');
      expect(result.error).toContain('auth0-mcp-server init');
    }
  });

  it('returns error when application has no client_secret (public client)', async () => {
    server.use(
      http.get('https://*/api/v2/clients/:clientId', () =>
        HttpResponse.json({ client_id: clientId, name: 'Public App' })
      )
    );

    const result = await resolveAndWriteCredentials(fallbackParams, config, token);

    expect(result.success).toBe(false);
    if (!result.success) expect(result.error).toContain('does not have a client_secret');
  });

  it('writes AUTH0_DOMAIN, AUTH0_CLIENT_ID, AUTH0_CLIENT_SECRET, and callback_url from params', async () => {
    server.use(
      http.get('https://*/api/v2/clients/:clientId', () => HttpResponse.json(mockApplication))
    );

    const result = await resolveAndWriteCredentials(
      { ...fallbackParams, callback_url: 'http://localhost:3000/callback' },
      config,
      token
    );

    expect(result.success).toBe(true);
    expect(mockWriteCredentialsToEnv).toHaveBeenCalledWith(
      expect.objectContaining({
        AUTH0_DOMAIN: config.domain,
        AUTH0_CLIENT_ID: clientId,
        AUTH0_CLIENT_SECRET: mockApplication.client_secret,
        AUTH0_CALLBACK_URL: 'http://localhost:3000/callback',
      }),
      expect.any(Object)
    );
  });

  it('falls back to app callbacks when no callback_url param is provided', async () => {
    server.use(
      http.get('https://*/api/v2/clients/:clientId', () => HttpResponse.json(mockApplication))
    );

    await resolveAndWriteCredentials(fallbackParams, config, token);

    expect(mockWriteCredentialsToEnv).toHaveBeenCalledWith(
      expect.objectContaining({
        AUTH0_CALLBACK_URL: mockApplication.callbacks[0],
      }),
      expect.any(Object)
    );
  });

  it('omits AUTH0_CALLBACK_URL when no callback_url is available', async () => {
    server.use(
      http.get('https://*/api/v2/clients/:clientId', () =>
        HttpResponse.json({ ...mockApplication, callbacks: [] })
      )
    );

    await resolveAndWriteCredentials(fallbackParams, config, token);

    const credentialMap = mockWriteCredentialsToEnv.mock.calls[0][0];
    expect(credentialMap).not.toHaveProperty('AUTH0_CALLBACK_URL');
  });
});

describe('resolveAndWriteCredentials — spec path (supported framework)', () => {
  const specParams = { ...fallbackParams, framework: 'react' };

  beforeEach(() => {
    mockFetchQuickstartSpec.mockResolvedValue(specWithSecret);
    server.use(
      http.get('https://*/api/v2/clients/:clientId', () => HttpResponse.json(mockApplication))
    );
  });

  it('returns 404 error when application is not found', async () => {
    server.use(
      http.get('https://*/api/v2/clients/:clientId', () => new HttpResponse(null, { status: 404 }))
    );

    const result = await resolveAndWriteCredentials(specParams, config, token);

    expect(result.success).toBe(false);
    if (!result.success) expect(result.error).toContain(`Application with client_id '${clientId}' not found`);
  });

  it('returns 401 error with helpful message when token is expired or invalid', async () => {
    server.use(
      http.get('https://*/api/v2/clients/:clientId', () =>
        new HttpResponse(JSON.stringify({ message: 'Unauthorized' }), {
          status: 401,
          headers: { 'Content-Type': 'application/json' },
        })
      )
    );

    const result = await resolveAndWriteCredentials(specParams, config, token);

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toContain('token may be expired');
      expect(result.error).toContain('auth0-mcp-server init');
    }
  });

  it('skips the API call entirely for SPA specs with no secret keys', async () => {
    mockFetchQuickstartSpec.mockResolvedValue(specSpaNoSecret);
    server.use(
      http.get('https://*/api/v2/clients/:clientId', () => new HttpResponse(null, { status: 500 }))
    );

    const result = await resolveAndWriteCredentials(specParams, config, token);

    expect(result.success).toBe(true);
    expect(mockWriteCredentialsToEnv).toHaveBeenCalledWith(
      expect.objectContaining({ AUTH0_DOMAIN: config.domain, AUTH0_CLIENT_ID: clientId }),
      expect.any(Object)
    );
  });

  it('resolves DOMAIN and CLIENT_ID from key name patterns', async () => {
    mockFetchQuickstartSpec.mockResolvedValue(specSpaNoSecret);

    await resolveAndWriteCredentials(specParams, config, token);

    expect(mockWriteCredentialsToEnv).toHaveBeenCalledWith(
      { AUTH0_DOMAIN: config.domain, AUTH0_CLIENT_ID: clientId },
      expect.any(Object)
    );
  });

  it('resolves CLIENT_SECRET for sensitive keys', async () => {
    await resolveAndWriteCredentials(specParams, config, token);

    expect(mockWriteCredentialsToEnv).toHaveBeenCalledWith(
      expect.objectContaining({ AUTH0_CLIENT_SECRET: mockApplication.client_secret }),
      expect.any(Object)
    );
  });

  it('generates AUTH0_SECRET when not already in the env file', async () => {
    mockFetchQuickstartSpec.mockResolvedValue(specWithSecret64);
    mockParseEnvFile.mockReturnValue({});

    const result = await resolveAndWriteCredentials(specParams, config, token);

    expect(result.success).toBe(true);
    if (result.success) expect(result.generated_keys).toContain('AUTH0_SECRET');

    const credentialMap = mockWriteCredentialsToEnv.mock.calls[0][0];
    expect(credentialMap['AUTH0_SECRET']).toMatch(/^[0-9a-f]{64}$/);
  });

  it('skips AUTH0_SECRET generation when already present in the env file', async () => {
    mockFetchQuickstartSpec.mockResolvedValue(specWithSecret64);
    mockParseEnvFile.mockReturnValue({ AUTH0_SECRET: 'existing-secret' });

    const result = await resolveAndWriteCredentials(specParams, config, token);

    expect(result.success).toBe(true);
    if (result.success) expect(result.generated_keys).not.toContain('AUTH0_SECRET');

    const credentialMap = mockWriteCredentialsToEnv.mock.calls[0][0];
    expect(credentialMap).not.toHaveProperty('AUTH0_SECRET');
  });

  it('uses provided base_url over the framework default', async () => {
    mockFetchQuickstartSpec.mockResolvedValue({
      ...specSpaNoSecret,
      envSnippet: {
        ...specSpaNoSecret.envSnippet,
        entries: [
          { type: 'var' as const, name: 'AUTH0_BASE_URL', value: '{yourBaseUrl}' },
        ],
      },
    });

    await resolveAndWriteCredentials({ ...specParams, base_url: 'http://localhost:4000' }, config, token);

    expect(mockWriteCredentialsToEnv).toHaveBeenCalledWith(
      expect.objectContaining({ AUTH0_BASE_URL: 'http://localhost:4000' }),
      expect.any(Object)
    );
  });

  it('uses provided port to construct the default base_url', async () => {
    mockFetchQuickstartSpec.mockResolvedValue({
      ...specSpaNoSecret,
      envSnippet: {
        ...specSpaNoSecret.envSnippet,
        entries: [{ type: 'var' as const, name: 'AUTH0_BASE_URL', value: '{yourBaseUrl}' }],
      },
    });

    await resolveAndWriteCredentials({ ...specParams, port: 5173 }, config, token);

    expect(mockWriteCredentialsToEnv).toHaveBeenCalledWith(
      expect.objectContaining({ AUTH0_BASE_URL: 'http://localhost:5173' }),
      expect.any(Object)
    );
  });

  it('includes generated_keys message in the success result', async () => {
    mockFetchQuickstartSpec.mockResolvedValue(specWithSecret64);
    mockWriteCredentialsToEnv.mockResolvedValue({
      ...mockWriteResult,
      file_path: '/mock/project/.env.local',
    });

    const result = await resolveAndWriteCredentials(specParams, config, token);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.message).toContain('AUTH0_SECRET');
      expect(result.message).toContain('generated automatically');
    }
  });
});
