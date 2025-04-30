import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import type { Prompt, Resource, Tool } from '@modelcontextprotocol/sdk/types';

/**
 * Options for starting an MCP test session.
 */
export interface MCPTestOptions {
  /** Command to execute (e.g., 'npx') */
  command: string;
  /** Arguments to pass to the command */
  args?: string[];
  /** Environment variables for the command process */
  env?: Record<string, string>;
}

/**
 * Context passed to the MCP test callback.
 */
export interface MCPTestContext {
  /** Connected MCP client instance */
  client: Client;
  /** Tools advertised by the MCP server */
  tools: Tool[];
  /** Resources advertised by the MCP server */
  resources: Resource[];
  /** Prompts advertised by the MCP server */
  prompts: Prompt[];
  /**
   * Checks whether a specific method is callable on the server
   * @param methodName - Fully qualified method name (e.g., 'tool.list')
   */
  isMethodExist: (methodName: string) => Promise<boolean>;
}

/** Callback defining a test case against an MCP server */
export type MCPTestCallback = (ctx: MCPTestContext) => Promise<void>;

/**
 * Runs a test against an MCP server implementation.
 *
 * Connects to a locally spawned MCP server, discovers available features,
 * and provides testing utilities.
 *
 * @example
 * ```typescript
 * await mcpTest(
 *   {
 *     command: 'npx',
 *     args: ['-y', '@modelcontextprotocol/server-filesystem', '/path/to/directory'],
 *   },
 *   async ({ tools, isMethodExist }) => {
 *     expect(tools.length).toBeGreaterThan(0);
 *     expect(await isMethodExist('tool.list')).toBe(true);
 *   }
 * );
 * ```
 */
export async function mcpTest(
  { command, args = [], env = {} }: MCPTestOptions,
  callback: MCPTestCallback
): Promise<void> {
  // Start transport with subprocess
  const transport = new StdioClientTransport({ command, args, env });

  // Create minimal client
  const client = new Client(
    { name: 'mcp-test', version: '0.1.0' },
    { capabilities: { tools: {}, resources: {}, prompts: {} } }
  );

  try {
    try {
      await client.connect(transport);
    } catch (err) {
      console.error('[mcpTest] Failed to connect MCP client to transport:', err);
      throw err;
    }

    // Simple method callability checker
    const isMethodExist = async (methodName: string): Promise<boolean> => {
      try {
        await client.request({ method: methodName }, {} as any);
        return true;
      } catch {
        return false;
      }
    };

    // Discover server features with graceful fallbacks
    const [tools, resources, prompts] = await Promise.all([
      client
        .listTools()
        .then((res) => res.tools)
        .catch(() => []),
      client
        .listResources()
        .then((res) => res.resources)
        .catch(() => []),
      client
        .listPrompts()
        .then((res) => res.prompts)
        .catch(() => []),
    ]);

    // Run the test callback
    await callback({ client, tools, resources, prompts, isMethodExist });
  } finally {
    // Ensure client is always closed
    await client.close();
  }
}
