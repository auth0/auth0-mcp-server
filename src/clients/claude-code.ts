import * as path from 'path';
import * as os from 'os';
import * as fs from 'fs';
import { BaseClientManager } from './base.js';
import { promptForChoice, promptForPath } from '../utils/terminal.js';
import type { ClientOptions } from '../utils/types.js';

/**
 * Claude Code configuration scope options.
 *
 * - `user`: stored in `~/.claude.json`, available across all projects.
 * - `project`: stored in `.mcp.json` at a project root, shared via version control.
 */
export type ClaudeCodeScope = 'user' | 'project';

/**
 * Extended client options for Claude Code that include scope selection.
 */
export interface ClaudeCodeClientOptions extends ClientOptions {
  scope?: ClaudeCodeScope;
  workspaceFolder?: string;
}

/**
 * Client manager implementation for Claude Code (the Anthropic CLI).
 *
 * Supports both user-scoped configuration (`~/.claude.json`) and
 * project-scoped configuration (`.mcp.json` at a project root). Both scopes
 * use the standard `mcpServers` key, so the base merge logic is reused.
 *
 * @see {@link https://claude.ai/download | Claude Code}
 */
export class ClaudeCodeClientManager extends BaseClientManager {
  private selectedScope: ClaudeCodeScope = 'user';
  private selectedWorkspaceFolder?: string;

  constructor() {
    super({
      clientType: 'claude-code',
      displayName: 'Claude Code',
    });
  }

  /**
   * Returns the path to the Claude Code configuration file for the selected scope.
   *
   * - User scope resolves to `~/.claude.json` (home directory always exists).
   * - Project scope resolves to `<workspaceFolder>/.mcp.json`.
   *
   * @returns The absolute path to the configuration file.
   */
  getConfigPath(): string {
    if (this.selectedScope === 'project') {
      if (!this.selectedWorkspaceFolder) {
        // Fallback to user scope if project folder not set
        return path.join(os.homedir(), '.claude.json');
      }

      if (!fs.existsSync(this.selectedWorkspaceFolder)) {
        throw new Error(`Project folder does not exist: ${this.selectedWorkspaceFolder}`);
      }

      return path.join(this.selectedWorkspaceFolder, '.mcp.json');
    }

    return path.join(os.homedir(), '.claude.json');
  }

  /**
   * Prompts the user to select between user and project scope.
   *
   * @returns Promise resolving to the selected scope.
   */
  private async promptForScope(): Promise<ClaudeCodeScope> {
    return promptForChoice(
      'Where would you like to configure the Auth0 MCP server for Claude Code?',
      [
        {
          label: 'User - Configure for all your projects (~/.claude.json)',
          value: 'user' as const,
        },
        {
          label: 'Project - Configure for a specific project/repository',
          value: 'project' as const,
        },
      ],
      'user'
    );
  }

  /**
   * Prompts the user for the project folder path.
   *
   * @returns Promise resolving to the validated project folder path.
   */
  private async promptForProjectFolder(): Promise<string> {
    return promptForPath('Enter the absolute path to your project folder: ', {
      required: true,
      mustExist: true,
      mustBeDirectory: true,
    });
  }

  /**
   * Configures Claude Code, prompting for scope (user vs project) when not
   * supplied. Once the scope and path are resolved, delegates to the base
   * implementation, which merges the Auth0 server into the `mcpServers` key.
   *
   * @param options - Client configuration options.
   */
  async configure(options: ClaudeCodeClientOptions): Promise<void> {
    // Set scope from options or prompt user
    if (options.scope) {
      this.selectedScope = options.scope;
      this.selectedWorkspaceFolder = options.workspaceFolder;
    } else {
      this.selectedScope = await this.promptForScope();
    }

    // If project scope but no folder specified, prompt for it
    if (this.selectedScope === 'project' && !this.selectedWorkspaceFolder) {
      this.selectedWorkspaceFolder = await this.promptForProjectFolder();
    }

    await super.configure(options);
  }
}
