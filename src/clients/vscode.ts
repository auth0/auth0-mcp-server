import * as path from 'path';
import * as os from 'os';
import * as fs from 'fs';
import chalk from 'chalk';
import { BaseClientManager } from './base.js';
import { getPlatformPath, ensureDir } from './utils.js';
import { log } from '../utils/logger.js';
import { cliOutput, promptForChoice, promptForPath } from '../utils/terminal.js';
import type { ClientOptions } from '../utils/types.js';

/**
 * VS Code configuration scope options
 */
export type VSCodeScope = 'workspace' | 'global';

/**
 * Extended client options for VS Code that includes scope selection
 */
export interface VSCodeClientOptions extends ClientOptions {
  scope?: VSCodeScope;
  workspaceFolder?: string;
}

/**
 * Client manager implementation for VS Code.
 *
 * Responsible for configuring and managing the MCP server integration
 * for the VS Code editor application with support for both workspace-specific
 * and global configurations.
 *
 * @see {@link https://code.visualstudio.com/ | VS Code Official Website}
 */
export class VSCodeClientManager extends BaseClientManager {
  private selectedScope: VSCodeScope = 'global';
  private selectedWorkspaceFolder?: string;

  constructor() {
    super({
      clientType: 'vscode',
      displayName: 'VS Code',
    });
  }

  /**
   * Returns the path to the VS Code configuration file.
   * Uses the currently selected scope and workspace folder.
   *
   * @returns The absolute path to the configuration file.
   */
  getConfigPath(): string {
    if (this.selectedScope === 'workspace') {
      if (!this.selectedWorkspaceFolder) {
        // Fallback to global if workspace folder not set
        return this.getGlobalConfigPath();
      }

      if (!fs.existsSync(this.selectedWorkspaceFolder)) {
        throw new Error(`Workspace folder does not exist: ${this.selectedWorkspaceFolder}`);
      }

      const vscodeDir = path.join(this.selectedWorkspaceFolder, '.vscode');
      ensureDir(vscodeDir);
      return path.join(vscodeDir, 'mcp.json');
    }

    return this.getGlobalConfigPath();
  }

  /**
   * Returns the path to the global VS Code configuration file.
   *
   * @returns The absolute path to the global configuration file.
   */
  private getGlobalConfigPath(): string {
    const configDir = getPlatformPath({
      darwin: path.join(os.homedir(), 'Library', 'Application Support', 'Code', 'User'),
      win32: path.join('{APPDATA}', 'Code', 'User'),
      linux: path.join(os.homedir(), '.config', 'Code', 'User'),
    });

    ensureDir(configDir);
    return path.join(configDir, 'mcp.json');
  }

  /**
   * Prompts user to select between workspace and global scope.
   *
   * @returns Promise resolving to the selected scope
   */
  private async promptForScope(): Promise<VSCodeScope> {
    return promptForChoice(
      'Where would you like to configure the Auth0 MCP server for VS Code?',
      [
        {
          label: 'Workspace - Configure for a specific project/repository',
          value: 'workspace' as const,
        },
        { label: 'Global - Configure for all VS Code instances', value: 'global' as const },
      ],
      'workspace'
    );
  }

  /**
   * Prompts user for workspace folder path.
   *
   * @returns Promise resolving to the validated workspace folder path
   */
  private async promptForWorkspaceFolder(): Promise<string> {
    return promptForPath('Enter the absolute path to your workspace/project folder: ', {
      required: true,
      mustExist: true,
      mustBeDirectory: true,
    });
  }

  /**
   * Enhanced configure method that handles VS Code-specific scope selection.
   *
   * First prompts for configuration scope (workspace vs global), then if workspace
   * is selected, prompts for the project folder path.
   *
   * @param options - Client configuration options
   */
  async configure(options: VSCodeClientOptions): Promise<void> {
    // Set scope from options or prompt user
    if (options.scope) {
      this.selectedScope = options.scope;
      this.selectedWorkspaceFolder = options.workspaceFolder;
    } else {
      this.selectedScope = await this.promptForScope();
    }

    // If workspace scope but no folder specified, prompt for it
    if (this.selectedScope === 'workspace' && !this.selectedWorkspaceFolder) {
      this.selectedWorkspaceFolder = await this.promptForWorkspaceFolder();
    }

    const configPath = this.getConfigPath();
    const config = this.readVSCodeConfig(configPath);
    const serverConfig = this.createServerConfig(options);

    // VS Code uses a different configuration structure for MCP
    if (!config['servers']) {
      config['servers'] = {};
    }

    config['servers']['auth0'] = serverConfig;

    this.writeVSCodeConfig(configPath, config);

    const scopeDescription =
      this.selectedScope === 'workspace' ? `workspace (${this.selectedWorkspaceFolder})` : 'global';

    log(`Updated ${this.displayName} ${scopeDescription} config file at: ${configPath}`);

    if (this.selectedScope === 'workspace') {
      cliOutput(
        `\n${chalk.green('✓')} Auth0 MCP server configured for workspace.\n` +
          `${chalk.yellow('Note:')} Make sure to open VS Code in the workspace folder: ${this.selectedWorkspaceFolder}\n` +
          `${chalk.yellow('Restart VS Code')} to apply changes.\n`
      );
    } else {
      cliOutput(
        `\n${chalk.green('✓')} Auth0 MCP server configured globally for ${this.displayName}.\n` +
          `${chalk.yellow('Restart VS Code')} to apply changes.\n`
      );
    }
  }

  /**
   * Loads VS Code-specific configuration from disk.
   * VS Code uses settings.json format, not the mcpServers format used by other clients.
   *
   * @param configPath - Path to the VS Code settings file
   * @returns Parsed configuration object
   */
  private readVSCodeConfig(configPath: string): Record<string, any> {
    if (fs.existsSync(configPath)) {
      try {
        const data = fs.readFileSync(configPath, 'utf-8');
        return JSON.parse(data);
      } catch (err) {
        log(`Warning: Could not read VS Code config at ${configPath}: ${err}`);
      }
    }
    return {};
  }

  /**
   * Writes VS Code configuration to disk with proper formatting.
   *
   * @param configPath - Path where the configuration should be saved
   * @param config - Configuration object to serialize and write
   */
  private writeVSCodeConfig(configPath: string, config: Record<string, any>): void {
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
  }
}
