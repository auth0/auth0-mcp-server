import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import { ensureDir, getPlatformPath } from '../../src/clients/utils.js';

// Mock dependencies
vi.mock('fs');
vi.mock('os');

describe('Client Utilities', () => {
  const originalPlatform = process.platform;
  const originalEnv = { ...process.env };
  let mockPlatform: string;

  beforeEach(() => {
    vi.resetAllMocks();

    // Arrange: Mock platform getter dynamically
    Object.defineProperty(process, 'platform', {
      get: () => mockPlatform,
    });

    // Arrange: Mock user's home directory
    vi.mocked(os.homedir).mockReturnValue('/home/user');

    // Arrange: Mock Windows APPDATA environment variable
    process.env.APPDATA = 'C:\\Users\\user\\AppData\\Roaming';
  });

  afterEach(() => {
    // Restore original platform and env
    Object.defineProperty(process, 'platform', {
      value: originalPlatform,
    });
    process.env = { ...originalEnv };
  });

  describe('ensureDir', () => {
    it('should create the directory if it does not exist', () => {
      // Arrange
      const dirPath = '/test/dir';

      // Act
      ensureDir(dirPath);

      // Assert
      expect(fs.mkdirSync).toHaveBeenCalledWith(dirPath, { recursive: true });
    });

    it('should throw an error if directory creation fails', () => {
      // Arrange
      const error = new Error('Directory creation failed');
      vi.mocked(fs.mkdirSync).mockImplementationOnce(() => {
        throw error;
      });

      // Act & Assert
      expect(() => ensureDir('/test/dir')).toThrow(
        'Failed to create directory: Directory creation failed'
      );
    });
  });

  describe('getPlatformPath', () => {
    const paths = {
      darwin: '/darwin/path',
      win32: '{APPDATA}/win/path',
      linux: '/linux/path',
    };

    it('should return the correct path for macOS', () => {
      // Arrange
      mockPlatform = 'darwin';

      // Act
      const result = getPlatformPath(paths);

      // Assert
      expect(result).toBe('/darwin/path');
    });

    it('should return the correct path for Windows with APPDATA substitution', () => {
      // Arrange
      mockPlatform = 'win32';

      // Act
      const result = getPlatformPath(paths);

      // Assert
      expect(result).toBe('C:\\Users\\user\\AppData\\Roaming/win/path');
    });

    it('should return the correct path for Linux', () => {
      // Arrange
      mockPlatform = 'linux';

      // Act
      const result = getPlatformPath(paths);

      // Assert
      expect(result).toBe('/linux/path');
    });

    it('should throw an error for unsupported platforms', () => {
      // Arrange
      mockPlatform = 'freebsd';

      // Act & Assert
      expect(() => getPlatformPath(paths)).toThrow('Unsupported operating system: freebsd');
    });

    it('should throw an error if APPDATA is not set on Windows', () => {
      // Arrange
      mockPlatform = 'win32';
      delete process.env.APPDATA;

      // Act & Assert
      expect(() => getPlatformPath(paths)).toThrow('APPDATA environment variable not set');
    });
  });
});
