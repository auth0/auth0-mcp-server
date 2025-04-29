import { mcpTest } from '../helpers/mcp-test.js';
import { TOOLS } from '../../src/tools/index.js';
import { describe, expect, it } from 'vitest';
import { keychain } from '../../src/utils/keychain.js';

/**
 * Checks if the Auth0 token stored in the keychain is invalid.
 *
 * A token is considered invalid if:
 * - It is missing (null)
 * - It has expired (its expiration time is before or equal to now)
 *
 * @returns {Promise<boolean>} True if the token is invalid; false otherwise.
 */
async function isTokenInvalid(): Promise<boolean> {
  const expiresAt = await keychain.getTokenExpiresAt();
  const now = Date.now();
  return expiresAt === null || expiresAt <= now;
}

describe('MCP Server Integration Test', () => {
  /**
   * NOTE: This test is conditionally skipped at runtime.
   *
   * Background:
   * - The MCP server (npm run dev) requires a valid authorization session stored in the keychain.
   * - If the session is missing or expired, the server fails to start properly.
   * - We intentionally avoid modifying or re-authenticating developer sessions inside tests.
   *
   * Current behavior:
   * - If the token is invalid, the test logs a warning and exits early.
   *
   * To re-enable without skipping:
   * - Add a mock session mechanism or bypass authentication safely for local and CI runs.
   * - Ensure 'npm run dev' can start cleanly without requiring manual auth setup.
   */
  it('should expose exactly the tools defined in TOOLS (skipped if auth session invalid)', async () => {
    if (await isTokenInvalid()) {
      console.warn('[MCP Integration Test] Skipped: Auth0 token is expired or missing.');
      return;
    }

    // Arrange: Build the list of expected tool names
    const expectedToolNames = TOOLS.map((tool) => tool.name).sort();

    // Act: Start the MCP server and fetch the advertised tools
    await mcpTest(
      {
        command: './node_modules/.bin/tsx',
        args: ['src/index.ts', 'run'],
        env: { PATH: process.env.PATH || '' }, // Ensure child process inherits PATH (needed for npm resolution)
      },
      async ({ tools }) => {
        const toolNames = tools.map((tool) => tool.name).sort();

        // Assert: The tools match exactly what was defined
        expect(toolNames).toEqual(expectedToolNames);
      }
    );
  });
});
