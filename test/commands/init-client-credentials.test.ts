import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import init from '../../src/commands/init';
import type { ClientType } from '../../src/clients/types';
import { requestAuthorization } from '../../src/auth/device-auth-flow';
import { requestClientCredentialsAuthorization } from '../../src/auth/client-credentials-flow';
import { clients } from '../../src/clients/index';

// Mock dependencies
vi.mock('../../src/auth/device-auth-flow', () => ({
  requestAuthorization: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../../src/auth/client-credentials-flow', () => ({
  requestClientCredentialsAuthorization: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../../src/utils/logger', () => ({
  log: vi.fn(),
  logError: vi.fn(),
}));

vi.mock('../../src/utils/terminal', () => ({
  promptForScopeSelection: vi.fn().mockResolvedValue(['read:users', 'read:clients']),
}));

vi.mock('../../src/utils/analytics', () => ({
  default: {
    trackInit: vi.fn(),
  },
}));

vi.mock('../../src/clients/index', () => ({
  clients: {
    claude: {
      displayName: 'Claude',
      configure: vi.fn().mockResolvedValue(undefined),
    },
    windsurf: {
      displayName: 'Windsurf',
      configure: vi.fn().mockResolvedValue(undefined),
    },
    cursor: {
      displayName: 'Cursor',
      configure: vi.fn().mockResolvedValue(undefined),
    },
  },
}));

describe('init command with client credentials', () => {
  const mockProcess = {
    exit: vi.fn(),
  };

  beforeEach(() => {
    // Backup and replace process.exit
    global.process.exit = mockProcess.exit as any;
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  it('should use client credentials flow when domain, clientId and clientSecret are provided', async () => {
    // Test options for client credentials flow
    const options = {
      client: 'claude' as ClientType,
      tools: ['*'],
      readOnly: false,
      auth0Domain: 'private-instance.auth0.com',
      auth0ClientId: 'test-client-id',
      auth0ClientSecret: 'test-client-secret',
      scopes: ['read:users', 'read:clients'],
    };

    // Execute init function
    await init(options);

    // Verify client credentials flow was used
    expect(requestClientCredentialsAuthorization).toHaveBeenCalledWith({
      auth0Domain: options.auth0Domain,
      auth0ClientId: options.auth0ClientId,
      auth0ClientSecret: options.auth0ClientSecret,
      scopes: options.scopes,
    });

    // Verify device flow was not used
    expect(requestAuthorization).not.toHaveBeenCalled();
  });

  it('should use device auth flow when client credentials are not provided', async () => {
    // Test options for device auth flow
    const options = {
      client: 'claude' as ClientType,
      tools: ['*'],
      readOnly: false,
      scopes: ['read:users', 'read:clients'],
    };

    // Execute init function
    await init(options);

    // Verify device auth flow was used
    expect(requestAuthorization).toHaveBeenCalled();

    // Verify client credentials flow was not used
    expect(requestClientCredentialsAuthorization).not.toHaveBeenCalled();
  });

  it('should exit with error when incomplete client credentials are provided', async () => {
    // Test options with incomplete client credentials
    const options = {
      client: 'claude' as ClientType,
      tools: ['*'],
      readOnly: false,
      auth0Domain: 'private-instance.auth0.com',
      auth0ClientId: 'test-client-id',
      // Missing auth0ClientSecret
    };

    // Execute init function
    await init(options);

    // Verify process.exit was called with error code
    expect(mockProcess.exit).toHaveBeenCalledWith(1);

    // Verify neither auth flow was used
    expect(requestClientCredentialsAuthorization).not.toHaveBeenCalled();
    expect(requestAuthorization).not.toHaveBeenCalled();
  });

  it('should configure the client after successful authentication with client credentials', async () => {
    // Test options for client credentials flow
    const options = {
      client: 'claude' as ClientType,
      tools: ['*'],
      readOnly: false,
      auth0Domain: 'private-instance.auth0.com',
      auth0ClientId: 'test-client-id',
      auth0ClientSecret: 'test-client-secret',
    };

    // Execute init function
    await init(options);

    // Get the configure function from the clients mock
    const clientsMock = vi.mocked(clients);
    const configureMock = clientsMock.claude.configure;

    // Verify client was configured after authentication
    expect(configureMock).toHaveBeenCalledWith({
      tools: options.tools,
      readOnly: options.readOnly,
    });
  });
});
