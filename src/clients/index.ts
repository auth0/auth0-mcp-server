/**
 * MCP client exports for configuration management.
 *
 * Provides initialized client manager instances for supported applications.
 *
 * @module clients
 */

// Import client classes
import { ClaudeClientManager } from './claude.js';
import { CursorClientManager } from './cursor.js';
import { WindsurfClientManager } from './windsurf.js';

// Create client manager instances
const claude = new ClaudeClientManager();
const cursor = new CursorClientManager();
const windsurf = new WindsurfClientManager();

/**
 * Namespace object containing initialized client managers.
 *
 * Each property corresponds to a supported client application.
 *
 * @property {ClaudeClientManager} claude - Manager for Claude Desktop.
 * @property {CursorClientManager} cursor - Manager for Cursor code editor.
 * @property {WindsurfClientManager} windsurf - Manager for Windsurf editor.
 *
 * @see {@link https://claude.ai/download | Claude Desktop}
 * @see {@link https://www.cursor.com/ | Cursor Code Editor}
 * @see {@link https://windsurf.com/editor | Windsurf Editor}
 */
export const clients = {
  claude,
  cursor,
  windsurf,
};

// Export types
export type { ClientType, ClientManager, ClientConfig, ServerConfig } from './types.js';
