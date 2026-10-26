import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import keytar from '@github/keytar';

// Mock all dependencies before importing the module
vi.mock('@github/keytar');
vi.mock('open', () => ({
  default: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../../src/utils/terminal', () => ({
  startSpinner: vi.fn(),
  stopSpinner: vi.fn(),
  getTenantFromToken: vi.fn().mockReturnValue('test-tenant.auth0.com'),
  cliOutput: vi.fn(),
  promptForBrowserPermission: vi.fn().mockResolvedValue(undefined),
  promptForLoginHint: vi.fn().mockResolvedValue(null),
}));

vi.mock('../../src/utils/logger', () => ({
  log: vi.fn(),
  logError: vi.fn(),
}));

// Import the module after mocking
import { requestAuthorization } from '../../src/auth/device-auth-flow';
import { promptForBrowserPermission, promptForLoginHint } from '../../src/utils/terminal';

describe('requestAuthorization interaction option', () => {
  let originalFetch: typeof global.fetch;
  let mockFetch: ReturnType<typeof vi.fn>;

  const mockDeviceCodeResponse = {
    device_code: 'mock-device-code',
    user_code: 'MOCK-CODE',
    verification_uri_complete: 'https://auth0.auth0.com/activate?user_code=MOCK-CODE',
    expires_in: 900,
    interval: 5,
  };

  const mockTokenResponse = {
    access_token: 'mock-access-token',
    refresh_token: 'mock-refresh-token',
    expires_in: 86400,
  };

  beforeEach(() => {
    // Save original fetch and replace with mock
    originalFetch = global.fetch;
    mockFetch = vi.fn();
    global.fetch = mockFetch as unknown as typeof global.fetch;

    // Reset all mocks
    vi.clearAllMocks();

    // Setup keytar mock
    vi.mocked(keytar.setPassword).mockResolvedValue();
  });

  afterEach(() => {
    // Restore original fetch
    global.fetch = originalFetch;
  });

  const setupSuccessfulAuthFlow = () => {
    // Mock device code request
    mockFetch.mockResolvedValueOnce({
      json: vi.fn().mockResolvedValue(mockDeviceCodeResponse),
    });
    // Mock token exchange - return successful token
    mockFetch.mockResolvedValueOnce({
      json: vi.fn().mockResolvedValue(mockTokenResponse),
    });
  };

  it('should call promptForBrowserPermission when interaction is true', async () => {
    setupSuccessfulAuthFlow();

    await requestAuthorization(['read:users'], true);

    expect(promptForBrowserPermission).toHaveBeenCalledTimes(1);
  });

  it('should NOT call promptForBrowserPermission when interaction is false', async () => {
    setupSuccessfulAuthFlow();

    await requestAuthorization(['read:users'], false);

    expect(promptForBrowserPermission).not.toHaveBeenCalled();
  });

  it('should call promptForBrowserPermission by default (interaction defaults to true)', async () => {
    setupSuccessfulAuthFlow();

    await requestAuthorization(['read:users']);

    expect(promptForBrowserPermission).toHaveBeenCalledTimes(1);
  });

  it('should call promptForLoginHint when interaction is true', async () => {
    setupSuccessfulAuthFlow();

    await requestAuthorization(['read:users'], true);

    expect(promptForLoginHint).toHaveBeenCalledTimes(1);
  });

  it('should NOT call promptForLoginHint when interaction is false', async () => {
    setupSuccessfulAuthFlow();

    await requestAuthorization(['read:users'], false);

    expect(promptForLoginHint).not.toHaveBeenCalled();
  });

  it('should include login_hint in device code request when email is provided', async () => {
    vi.mocked(promptForLoginHint).mockResolvedValueOnce('user@enterprise.com');
    setupSuccessfulAuthFlow();

    await requestAuthorization(['read:users'], true);

    const deviceCodeCall = mockFetch.mock.calls[0];
    const body = new URLSearchParams(deviceCodeCall[1].body);
    expect(body.get('login_hint')).toBe('user@enterprise.com');
  });

  it('should not include login_hint in device code request when email is skipped', async () => {
    vi.mocked(promptForLoginHint).mockResolvedValueOnce(null);
    setupSuccessfulAuthFlow();

    await requestAuthorization(['read:users'], true);

    const deviceCodeCall = mockFetch.mock.calls[0];
    const body = new URLSearchParams(deviceCodeCall[1].body);
    expect(body.get('login_hint')).toBeNull();
  });
});
