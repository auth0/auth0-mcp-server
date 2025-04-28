import * as fs from 'fs';
import chalk from 'chalk';
import { log } from '../utils/logger.js';
import { cliOutput } from '../utils/terminal.js';
import { packageName } from '../utils/package.js';
import type { ClientOptions } from '../utils/types.js';
import type { ServerConfig, ClientConfig, ClientManager, ClientType } from './types.js';

/**
 * Abstract base class providing common functionality for all supported MCP client managers.
 *
 * Subclasses should extend this class to handle client-specific configuration paths and custom behaviors.
 */
export abstract class BaseClientManager implements ClientManager {
  protected readonly clientType: ClientType;
  public readonly displayName: string;
  protected readonly capabilities?: string[];

  /**
   * Initializes a new BaseClientManager instance.
   *
   * @param options - Configuration options including client type, display name, and optional capabilities.
   */
  constructor(options: { clientType: ClientType; displayName: string; capabilities?: string[] }) {
    this.clientType = options.clientType;
    this.displayName = options.displayName;
    this.capabilities = options.capabilities;
  }

  /**
   * Returns the absolute path to the client's configuration file.
   *
   * Subclasses must implement this method to provide client-specific path resolution.
   * Implementations are responsible for ensuring any necessary directories exist.
   *
   * @returns The resolved configuration file path.
   */
  abstract getConfigPath(): string;

  /**
   * Updates the client’s configuration with Auth0 MCP server settings.
   *
   * Loads the existing configuration, applies updates for the MCP server,
   * and writes the updated configuration back to disk.
   *
   * @param options - Client configuration options such as enabled tools and read-only mode.
   */
  async configure(options: ClientOptions): Promise<void> {
    const configPath = this.getConfigPath();
    const config = this.readConfig(configPath);
    const mcpServers = config.mcpServers || {};
    const serverConfig = this.createServerConfig(options);

    mcpServers['auth0'] = serverConfig;
    config.mcpServers = mcpServers;

    this.writeConfig(configPath, config);
    log(`Updated ${this.displayName} config file at: ${configPath}`);

    cliOutput(
      `\n${chalk.green('✓')} Auth0 MCP server configured. ${chalk.yellow(
        `Restart ${this.displayName}`
      )} to apply changes.\n`
    );
  }

  /**
   * Creates an MCP server configuration entry based on the provided client options.
   *
   * This method transforms the user’s options into a command, arguments,
   * environment variables, and optional capabilities that the client will use to start the MCP server.
   *
   * Subclasses may override this method if additional customization of the server config is needed.
   *
   * @param options - Options controlling server configuration, such as selected tools and read-only mode.
   * @returns A fully-formed ServerConfig object.
   * @protected
   */
  protected createServerConfig(options: ClientOptions): ServerConfig {
    const args = ['-y', packageName, 'run', '--tools', `${options.tools.join(',')}`];

    if (options.readOnly) {
      args.push('--read-only');
    }

    const config: ServerConfig = {
      command: 'npx',
      args,
      env: {
        DEBUG: 'auth0-mcp',
      },
    };

    if (this.capabilities?.length) {
      config.capabilities = this.capabilities;
    }

    return config;
  }

  /**
   * Loads the client’s configuration from disk.
   *
   * Attempts to read and parse the configuration file at the given path.
   * Returns a default configuration object if the file is missing or cannot be read.
   *
   * @param configPath - Path to the client’s configuration file.
   * @returns A parsed ClientConfig object.
   * @protected
   */
  protected readConfig(configPath: string): ClientConfig {
    if (fs.existsSync(configPath)) {
      try {
        const data = fs.readFileSync(configPath, 'utf-8');
        return JSON.parse(data);
      } catch (err) {
        log(`Warning: Could not read config at ${configPath}: ${err}`);
      }
    }
    return { mcpServers: {} };
  }

  /**
   * Writes the provided configuration object to disk.
   *
   * Serializes the configuration to formatted JSON and saves it at the specified path.
   *
   * @param configPath - Path where the configuration should be saved.
   * @param config - Configuration object to serialize and write.
   * @protected
   */
  protected writeConfig(configPath: string, config: ClientConfig): void {
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
  }
}
