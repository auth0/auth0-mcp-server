import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import run from '../src/run';

// Mock dependencies
vi.mock('../src/server', () => ({
  startServer: vi.fn().mockResolvedValue({ mockServer: true }),
}));

vi.mock('../src/utils/logger', () => ({
  log: vi.fn(),
  logError: vi.fn(),
}));

vi.mock('os', () => ({
  homedir: vi.fn().mockReturnValue('/mock/home/dir'),
}));

// Import mocked modules
import { startServer } from '../src/server';
import { log, logError } from '../src/utils/logger';
import * as os from 'os';

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
  });

  afterEach(() => {
    // Restore original functions
    process.exit = originalExit;
    console.error = originalConsoleError;

    // Restore original environment
    process.env = originalEnv;
  });

  it('should start the server successfully', async () => {
    await run([]);

    expect(startServer).toHaveBeenCalled();
    expect(log).toHaveBeenCalledWith('✅ Server started successfully');
    expect(process.exit).not.toHaveBeenCalled();
  });

  it('should set HOME environment variable if not set', async () => {
    // Remove HOME environment variable
    delete process.env.HOME;

    // Mock os.homedir to return a specific value
    vi.mocked(os.homedir).mockReturnValue('/mock/home/dir');

    await run([]);

    expect(process.env.HOME).toBe('/mock/home/dir');
    expect(log).toHaveBeenCalledWith('Set HOME environment variable to /mock/home/dir');
  });

  it('should not set HOME environment variable if already set', async () => {
    // Set HOME environment variable
    process.env.HOME = '/existing/home/dir';

    await run([]);

    expect(process.env.HOME).toBe('/existing/home/dir');
    expect(log).not.toHaveBeenCalledWith(expect.stringContaining('Set HOME environment variable'));
  });

  it('should handle server start errors', async () => {
    const mockError = new Error('Server start failed');
    vi.mocked(startServer).mockRejectedValue(mockError);

    await run([]);

    expect(logError).toHaveBeenCalledWith('Fatal error starting server:', mockError);
    expect(process.exit).toHaveBeenCalledWith(1);
  });
});
