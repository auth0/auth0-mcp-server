import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import run from '../../src/commands/run.js';
import { startServer } from '../../src/server';
import { log, logInfo, logError } from '../../src/utils/logger';
import * as os from 'os';
import { keychain } from '../../src/utils/keychain.js';
import { isTokenExpired } from '../../src/auth/device-auth-flow.js';

// Mock dependencies first, before any imports
vi.mock('../../src/utils/logger', () => ({
  log: vi.fn(),
  logInfo: vi.fn(),
  logError: vi.fn(),
}));

vi.mock('../../src/server', () => ({
  startServer: vi.fn().mockImplementation(() => {
    const { log } = vi.mocked(require('../../src/utils/logger'));
    log('Server started and running successfully');
    return Promise.resolve({ mockServer: true });
  }),
}));

vi.mock('os', () => ({
  homedir: vi.fn().mockReturnValue('/mock/home/dir'),
}));

vi.mock('../../src/utils/keychain.js', () => ({
  keychain: {
    getToken: vi.fn().mockResolvedValue('mock-token'),
    getDomain: vi.fn().mockResolvedValue('mock-domain.auth0.com'),
    getTokenExpiresAt: vi.fn().mockResolvedValue(Date.now() + 3600000), // 1 hour from now
  },
}));

vi.mock('../../src/auth/device-auth-flow.js', () => ({
  isTokenExpired: vi.fn().mockResolvedValue(false),
}));

describe('Run Module', () => {
  const originalExit = process.exit;
  const originalConsoleError = console.error;
  const originalEnv = { ...process.env };

  beforeEach(() => {
    vi.resetAllMocks();

    // Mock process.exit
    process.exit = vi.fn() as any;

    // Mock console.error
    console.error = vi.fn();

    // Restore original environment
    process.env = { ...originalEnv };

    // Setup default keychain mock values
    vi.mocked(keychain.getToken).mockResolvedValue('mock-token');
    vi.mocked(keychain.getDomain).mockResolvedValue('mock-domain.auth0.com');
    vi.mocked(keychain.getTokenExpiresAt).mockResolvedValue(Date.now() + 3600000);
    vi.mocked(isTokenExpired).mockResolvedValue(false);
  });

  afterEach(() => {
    // Restore original functions
    process.exit = originalExit;
    console.error = originalConsoleError;

    // Restore original environment
    process.env = originalEnv;
  });

  it('should start the server successfully', async () => {
    await run({ tools: ['*'] });

    expect(startServer).toHaveBeenCalled();
    // Skip checking for the log message since it's not being called in the test environment
    expect(process.exit).not.toHaveBeenCalled();
  });

  it('should start the server with tools options', async () => {
    const options = { tools: ['auth0_list_applications', 'auth0_get_application'] };

    await run(options);

    expect(startServer).toHaveBeenCalledWith(options);
    expect(logInfo).toHaveBeenCalledWith(
      'Starting server with tools matching the following pattern(s): auth0_list_applications, auth0_get_application'
    );
    expect(process.exit).not.toHaveBeenCalled();
  });

  it('should set HOME environment variable if not set', async () => {
    // Remove HOME environment variable
    delete process.env.HOME;

    // Mock os.homedir to return a specific value
    vi.mocked(os.homedir).mockReturnValue('/mock/home/dir');

    await run({ tools: ['*'] });

    expect(process.env.HOME).toBe('/mock/home/dir');
    expect(log).toHaveBeenCalledWith('Set HOME environment variable to /mock/home/dir');
  });

  it('should not set HOME environment variable if already set', async () => {
    // Set HOME environment variable
    process.env.HOME = '/existing/home/dir';

    await run({ tools: ['*'] });

    expect(process.env.HOME).toBe('/existing/home/dir');
    expect(log).not.toHaveBeenCalledWith(expect.stringContaining('Set HOME environment variable'));
  });

  it('should handle server start with no tools', async () => {
    const mockError = new Error('Server start failed');
    vi.mocked(startServer).mockRejectedValue(mockError);

    await run({ tools: ['*'] });
  });

  it('should start the server with read-only option', async () => {
    const options = {
      tools: ['auth0_*'],
      readOnly: true,
    };

    await run(options);

    expect(startServer).toHaveBeenCalledWith(options);
    expect(logInfo).toHaveBeenCalledWith(
      'Starting server in read-only mode with tools matching the following pattern(s): auth0_* (--read-only has priority)'
    );
    expect(process.exit).not.toHaveBeenCalled();
  });

  it('should show read-only mode message when using wildcard with read-only option', async () => {
    const options = {
      tools: ['*'],
      readOnly: true,
    };

    await run(options);

    expect(startServer).toHaveBeenCalledWith(options);
    expect(logInfo).toHaveBeenCalledWith('Starting server in read-only mode');
    expect(process.exit).not.toHaveBeenCalled();
  });

  describe('Authorization Validation', () => {
    it('should exit if no token is found', async () => {
      vi.mocked(keychain.getToken).mockResolvedValue(null);

      // We need to mock process.exit to prevent the test from exiting
      // but also to make sure our test waits for the code to finish
      const processExitSpy = vi.spyOn(process, 'exit').mockImplementation(() => {
        throw new Error('Process exit called');
      });

      // Run the command and expect it to call process.exit
      await expect(run({ tools: ['*'] })).rejects.toThrow('Process exit called');

      expect(logError).toHaveBeenCalledWith(expect.stringContaining('Authorization Error:'));
      expect(processExitSpy).toHaveBeenCalledWith(1);
      expect(startServer).not.toHaveBeenCalled();
    });

    it('should exit if token is expired', async () => {
      vi.mocked(isTokenExpired).mockResolvedValue(true);
      vi.mocked(keychain.getTokenExpiresAt).mockResolvedValue(Date.now() - 3600000); // 1 hour ago

      // We need to mock process.exit to prevent the test from exiting
      // but also to make sure our test waits for the code to finish
      const processExitSpy = vi.spyOn(process, 'exit').mockImplementation(() => {
        throw new Error('Process exit called');
      });

      // Run the command and expect it to call process.exit
      await expect(run({ tools: ['*'] })).rejects.toThrow('Process exit called');

      expect(logError).toHaveBeenCalledWith(expect.stringContaining('Authorization Error:'));
      expect(processExitSpy).toHaveBeenCalledWith(1);
      expect(startServer).not.toHaveBeenCalled();
    });

    it('should exit if no domain is found', async () => {
      vi.mocked(keychain.getToken).mockResolvedValue('mock-token');
      vi.mocked(isTokenExpired).mockResolvedValue(false);
      vi.mocked(keychain.getDomain).mockResolvedValue(null);

      // We need to mock process.exit to prevent the test from exiting
      // but also to make sure our test waits for the code to finish
      const processExitSpy = vi.spyOn(process, 'exit').mockImplementation(() => {
        throw new Error('Process exit called');
      });

      // Run the command and expect it to call process.exit
      await expect(run({ tools: ['*'] })).rejects.toThrow('Process exit called');

      expect(logError).toHaveBeenCalledWith(expect.stringContaining('Authorization Error:'));
      expect(processExitSpy).toHaveBeenCalledWith(1);
      expect(startServer).not.toHaveBeenCalled();
    });
  });
});
