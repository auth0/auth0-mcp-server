import type { ClientOptions } from '../utils/types.js';

/**
 * Supported client types.
 *
 * Represents the set of known MCP client applications supported by this project.
 */
export type ClientType = 'claude' | 'cursor' | 'windsurf';

/**
 * MCP server configuration object used in client configuration files.
 *
 * Defines the parameters needed to launch the MCP server in the context of a client application.
 */
export interface ServerConfig {
  /** Command-line arguments to pass when launching the MCP server. */
  args: string[];
  /** Base command to execute (typically 'npx' or similar). */
  command: string;
  /** Optional environment variables to set when executing the command. */
  env?: Record<string, string>;
  /** Optional list of capabilities supported by the client integration. */
  capabilities?: string[];
}

/**
 * Generic client configuration format shared across different MCP clients.
 *
 * Defines the structure of the configuration file used by client applications
 * to specify MCP server settings.
 */
export interface ClientConfig {
  /** Dictionary of MCP server configurations, keyed by server identifier. */
  mcpServers: Record<string, ServerConfig>;
  /** Additional client-specific configuration fields. */
  [key: string]: any;
}

/**
 * Interface for client managers responsible for handling client-specific configuration.
 *
 * Client managers locate, read, and update configuration files
 * to integrate MCP server support into client applications.
 */
export interface ClientManager {
  /**
   * Returns the absolute path to the client's configuration file.
   *
   * @returns The full filesystem path to the configuration file.
   * @throws Error if the configuration directory cannot be created or accessed.
   */
  getConfigPath(): string;

  /**
   * Updates the client's configuration with Auth0 MCP server settings.
   *
   * @param options - Configuration options, including enabled tools and read-only mode.
   * @returns A Promise that resolves when the configuration update has been completed successfully.
   * @throws Error if the configuration cannot be written to disk.
   */
  configure(options: ClientOptions): Promise<void>;
}

/**
 * Platform-specific path templates.
 *
 * Provides OS-specific configuration directory paths for Darwin (macOS), Windows, and Linux.
 */
export interface PlatformPaths {
  /** Path template for macOS platforms ('darwin'). */
  darwin: string;
  /** Path template for Windows platforms ('win32'). */
  win32: string;
  /** Path template for Linux platforms ('linux'). */
  linux: string;
}
