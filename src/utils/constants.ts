/**
 * Core application constants for the Auth0 MCP Server.
 *
 * This module defines globally shared constants used across the application,
 * such as identifiers for logging, configuration defaults, and service names.
 */

/**
 * Application identifier used for debug logging namespaces and telemetry.
 */
export const APP_ID = 'auth0-mcp';

/**
 * Default MCP server name registered in client configuration files.
 */
export const MCP_SERVER_NAME = 'auth0';

// Re-export keychain-related constants for backward compatibility
export { KEYCHAIN_SERVICE_NAME, KeychainItem, ALL_KEYCHAIN_ITEMS } from './keychain.js';
