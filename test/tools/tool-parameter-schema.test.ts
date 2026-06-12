import { describe, it, expect, vi } from 'vitest';
import { TOOLS, HANDLERS } from '../../src/tools/index';
import { mockConfig } from '../mocks/config';
import '../setup';

vi.mock('../../src/utils/logger', () => ({
  log: vi.fn(),
  logInfo: vi.fn(),
  logError: vi.fn(),
}));

// Avoid analytics firing real network requests while exercising handlers.
vi.mock('../../src/utils/analytics.js', () => ({
  default: { trackTool: vi.fn() },
}));

type JsonSchema = {
  type?: string;
  properties?: Record<string, JsonSchema>;
};

// Build a benign placeholder for a schema property so the handler can read it
// without throwing before we have recorded which keys it touched.
function placeholderFor(schema: JsonSchema | undefined): unknown {
  switch (schema?.type) {
    case 'array':
      return [];
    case 'object':
      return {};
    case 'boolean':
      return true;
    case 'number':
      return 1;
    default:
      return 'smoke-test-value';
  }
}

// Wrap request.parameters in a Proxy that records every key the handler reads.
// Handlers destructure their parameters up front (before any network call), so
// the recorded set is exactly the set of parameters each handler consumes.
function buildRecordingParameters(properties: Record<string, JsonSchema>) {
  const accessed = new Set<string>();
  const target: Record<string, unknown> = {};
  for (const [key, propSchema] of Object.entries(properties)) {
    target[key] = placeholderFor(propSchema);
  }
  // JS internals probed by JSON.stringify / await, not client-sent parameters.
  const internals = new Set(['toJSON', 'then', 'catch', 'finally', 'constructor']);
  const proxy = new Proxy(target, {
    get(obj, prop, receiver) {
      if (typeof prop === 'string' && !internals.has(prop)) {
        accessed.add(prop);
      }
      return Reflect.get(obj, prop, receiver);
    },
  });
  return { proxy, accessed };
}

describe('Tool parameter schema consistency', () => {
  it('registers a handler for every tool and vice versa', () => {
    const toolNames = TOOLS.map((t) => t.name).sort();
    const handlerNames = Object.keys(HANDLERS).sort();
    expect(handlerNames).toEqual(toolNames);
  });

  // The server enforces an allowlist that rejects any argument not declared in a
  // tool's inputSchema. A handler must therefore never read a parameter the schema
  // omits: if it does, the tool is effectively broken because the client can never
  // send that parameter (sending it is rejected before the handler runs). This test
  // exercises every handler and fails if any reads a parameter outside its schema,
  // keeping each tool's declared inputs and consumed inputs in sync.
  for (const tool of TOOLS) {
    it(`${tool.name}: reads only parameters declared in its inputSchema`, async () => {
      const properties = (tool.inputSchema?.properties ?? {}) as Record<string, JsonSchema>;
      const declared = new Set(Object.keys(properties));
      const { proxy, accessed } = buildRecordingParameters(properties);

      const handler = HANDLERS[tool.name];
      expect(handler, `no handler for ${tool.name}`).toBeDefined();

      // Network calls are mocked/irrelevant: parameters are read before any
      // request, and handlers catch downstream errors. We only assert no throw
      // escapes and that no undeclared parameter was read.
      await expect(
        handler(
          { token: mockConfig.token, parameters: proxy as never },
          { domain: mockConfig.domain }
        )
      ).resolves.toBeDefined();

      const undeclared = [...accessed].filter((key) => !declared.has(key));
      expect(
        undeclared,
        `${tool.name} handler reads parameters not in its inputSchema: ${undeclared.join(', ')}`
      ).toEqual([]);
    });
  }
});
