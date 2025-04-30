import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as fs from 'fs';
import { BaseClientManager } from '../../src/clients/base.js';
import { cliOutput } from '../../src/utils/terminal.js';
import { log } from '../../src/utils/logger.js';
import type { ClientOptions } from '../../src/utils/types.js';
import type { ClientType } from '../../src/clients/types.js';
import { packageName } from '../../src/utils/package.js';

// Mock dependencies
vi.mock('fs');
vi.mock('../../src/utils/terminal.js');
vi.mock('../../src/utils/logger.js');
vi.mock('../../src/utils/package.js', () => ({
  packageName: '@auth0/auth0-mcp-server',
}));

// Test client manager subclass
class TestClientManager extends BaseClientManager {
  constructor() {
    super({
      clientType: 'test' as ClientType,
      displayName: 'Test Client',
      capabilities: ['test-capability'],
    });
  }

  getConfigPath(): string {
    return '/path/to/test/config.json';
  }
}

describe('BaseClientManager', () => {
  let manager: TestClientManager;

  beforeEach(() => {
    vi.resetAllMocks();
    manager = new TestClientManager();
  });

  describe('configure()', () => {
    it('should read and update an existing config file', async () => {
      // Arrange
      const configPath = '/path/to/test/config.json';
      const mockConfig = { mcpServers: { existing: {} } };
      const options: ClientOptions = { tools: ['foo', 'bar'] };

      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(mockConfig));

      // Act
      await manager.configure(options);

      // Assert
      expect(fs.writeFileSync).toHaveBeenCalledWith(configPath, expect.stringContaining('"auth0"'));
      expect(log).toHaveBeenCalledWith(expect.stringContaining('Updated Test Client config'));
      expect(cliOutput).toHaveBeenCalledWith(
        expect.stringContaining('Auth0 MCP server configured')
      );
    });

    it('should create a new config file if none exists', async () => {
      // Arrange
      const configPath = '/path/to/test/config.json';
      const options: ClientOptions = { tools: ['foo', 'bar'] };

      vi.mocked(fs.existsSync).mockReturnValue(false);

      // Act
      await manager.configure(options);

      // Assert
      expect(fs.writeFileSync).toHaveBeenCalledWith(configPath, expect.stringContaining('"auth0"'));
    });

    it('should create a server config with correct options', async () => {
      // Arrange
      const options: ClientOptions = { tools: ['foo', 'bar'], readOnly: true };
      vi.mocked(fs.existsSync).mockReturnValue(false);

      // Act
      await manager.configure(options);

      // Assert
      expect(fs.writeFileSync).toHaveBeenCalledWith(
        expect.any(String),
        expect.stringContaining('--read-only')
      );
      expect(fs.writeFileSync).toHaveBeenCalledWith(
        expect.any(String),
        expect.stringContaining('--tools')
      );
      expect(fs.writeFileSync).toHaveBeenCalledWith(
        expect.any(String),
        expect.stringContaining('foo,bar')
      );
      expect(fs.writeFileSync).toHaveBeenCalledWith(
        expect.any(String),
        expect.stringContaining('test-capability')
      );
      expect(fs.writeFileSync).toHaveBeenCalledWith(
        expect.any(String),
        expect.stringContaining(packageName)
      );
    });

    it('should preserve existing mcpServers entries when updating config', async () => {
      // Arrange
      const mockConfig = {
        mcpServers: {
          existing: { command: 'existing-cmd' },
        },
      };
      const options: ClientOptions = { tools: ['foo'] };

      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(mockConfig));

      // Act
      await manager.configure(options);

      // Assert
      const writeCall = vi.mocked(fs.writeFileSync).mock.calls[0];
      const writtenData = typeof writeCall[1] === 'string' ? writeCall[1] : writeCall[1].toString();
      const writtenConfig = JSON.parse(writtenData);

      expect(writtenConfig.mcpServers).toHaveProperty('existing');
      expect(writtenConfig.mcpServers).toHaveProperty('auth0');
    });
  });
});
