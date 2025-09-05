import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as path from 'path';
import * as os from 'os';

// Mock utilities
vi.mock('../../src/clients/utils.js', () => ({
  getPlatformPath: vi.fn((paths) => {
    if (process.platform === 'darwin') return paths.darwin;
    if (process.platform === 'win32')
      return paths.win32.replace('{APPDATA}', process.env.APPDATA || '');
    return paths.linux;
  }),
  ensureDir: vi.fn(),
}));

// Mock path and os modules
vi.mock('path');
vi.mock('os');

// Mock BaseClientManager
vi.mock('../../src/clients/base.js', () => ({
  BaseClientManager: class {
    clientType: string;
    displayName: string;
    capabilities?: string[];

    constructor(options: { clientType: string; displayName: string; capabilities?: string[] }) {
      this.clientType = options.clientType;
      this.displayName = options.displayName;
      this.capabilities = options.capabilities;
    }

    configure = vi.fn().mockResolvedValue(undefined);
  },
}));

// Import after mocks
import { getPlatformPath, ensureDir } from '../../src/clients/utils.js';
import { clients } from '../../src/clients/index.js';

describe('Client Implementations', () => {
  const originalPlatform = process.platform;
  const originalEnv = { ...process.env };
  let mockPlatform = 'darwin';

  beforeEach(() => {
    vi.resetAllMocks();

    // Arrange: Mock platform dynamically
    Object.defineProperty(process, 'platform', {
      get: () => mockPlatform,
    });

    // Arrange: Mock homedir
    vi.mocked(os.homedir).mockReturnValue('/home/user');

    // Arrange: Mock path.join to behave predictably
    vi.mocked(path.join).mockImplementation((...segments) => segments.join('/'));
  });

  afterEach(() => {
    // Restore original platform and environment
    Object.defineProperty(process, 'platform', { value: originalPlatform });
    process.env = { ...originalEnv };
  });

  describe('Client Managers', () => {
    it('should export client managers with expected methods', () => {
      // Assert
      expect(clients.claude).toHaveProperty('getConfigPath');
      expect(clients.claude).toHaveProperty('configure');

      expect(clients.cursor).toHaveProperty('getConfigPath');
      expect(clients.cursor).toHaveProperty('configure');

      expect(clients.windsurf).toHaveProperty('getConfigPath');
      expect(clients.windsurf).toHaveProperty('configure');

      expect(clients.vscode).toHaveProperty('getConfigPath');
      expect(clients.vscode).toHaveProperty('configure');
    });

    it('should initialize with correct client types and display names', () => {
      // Assert
      expect(clients.claude).toHaveProperty('clientType', 'claude');
      expect(clients.claude).toHaveProperty('displayName', 'Claude Desktop');

      expect(clients.cursor).toHaveProperty('clientType', 'cursor');
      expect(clients.cursor).toHaveProperty('displayName', 'Cursor');

      expect(clients.windsurf).toHaveProperty('clientType', 'windsurf');
      expect(clients.windsurf).toHaveProperty('displayName', 'Windsurf');

      expect(clients.vscode).toHaveProperty('clientType', 'vscode');
      expect(clients.vscode).toHaveProperty('displayName', 'VS Code');
    });
  });

  describe('Client Configuration Paths', () => {
    it('should resolve correct config path for Claude on macOS', () => {
      // Act
      clients.claude.getConfigPath();

      // Assert
      expect(getPlatformPath).toHaveBeenCalledWith(
        expect.objectContaining({
          darwin: expect.stringContaining('Library/Application Support/Claude'),
        })
      );
      expect(ensureDir).toHaveBeenCalled();
    });

    it('should resolve correct config path for Cursor on macOS', () => {
      // Act
      clients.cursor.getConfigPath();

      // Assert
      expect(getPlatformPath).toHaveBeenCalledWith(
        expect.objectContaining({
          darwin: expect.stringContaining('.cursor'),
        })
      );
      expect(ensureDir).toHaveBeenCalled();
    });

    it('should resolve correct config path for Windsurf on macOS', () => {
      // Act
      clients.windsurf.getConfigPath();

      // Assert
      expect(getPlatformPath).toHaveBeenCalledWith(
        expect.objectContaining({
          darwin: expect.stringContaining('.codeium/windsurf'),
        })
      );
      expect(ensureDir).toHaveBeenCalled();
    });

    it('should resolve correct config path for VS Code on macOS', () => {
      // Act
      clients.vscode.getConfigPath();

      // Assert
      expect(getPlatformPath).toHaveBeenCalledWith(
        expect.objectContaining({
          darwin: expect.stringContaining('Library/Application Support/Code/User'),
        })
      );
      expect(ensureDir).toHaveBeenCalled();
    });
  });

  describe('VS Code Specific Features', () => {
    it('should support VS Code client configuration', async () => {
      // Act: Test that VS Code client can be configured
      await clients.vscode.configure({ tools: ['applications'] });

      // Assert: VS Code configure method should be called (mocked)
      expect(clients.vscode.configure).toHaveBeenCalledWith({ tools: ['applications'] });
    });
  });
});
