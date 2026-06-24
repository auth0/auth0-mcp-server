import { describe, it, expect, vi, beforeEach, Mock } from 'vitest';
import { mockLoadConfig, mockValidateConfig, mockConfig } from './mocks/config';
import { startServer } from '../src/server';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { TOOLS, HANDLERS } from '../src/tools/index';

// Mock dependencies
vi.mock('../src/utils/package.js', () => ({
  packageName: 'auth0-mcp-server',
  packageVersion: '0.1.0-beta.1',
}));
vi.mock('../src/utils/config.js', () => ({
  loadConfig: vi.fn().mockImplementation(() => mockLoadConfig()),
  validateConfig: vi.fn().mockImplementation(async (config) => mockValidateConfig(config)),
}));
vi.mock('../src/utils/logger.js', () => ({
  log: vi.fn(),
  logInfo: vi.fn(),
  logError: vi.fn(),
}));
vi.mock('../src/utils/http-utility.js', () => ({
  formatDomain: vi.fn().mockImplementation((domain) => domain),
}));

// Mock the MCP SDK Server class
const mockSetRequestHandler = vi.fn();
const mockConnect = vi.fn().mockResolvedValue(undefined);
const mockClose = vi.fn().mockResolvedValue(undefined);
const mockSendLoggingMessage = vi.fn().mockResolvedValue(undefined);
const mockServer = {
  setRequestHandler: mockSetRequestHandler,
  connect: mockConnect,
  close: mockClose,
  onerror: vi.fn(),
  sendLoggingMessage: mockSendLoggingMessage,
};

vi.mock('@modelcontextprotocol/sdk/server/index.js', () => ({
  Server: vi.fn(function () {
    return mockServer;
  }),
}));

// Mock the StdioServerTransport
vi.mock('@modelcontextprotocol/sdk/server/stdio.js', () => ({
  StdioServerTransport: vi.fn(function () {
    return {
      start: vi.fn().mockResolvedValue(undefined),
      close: vi.fn().mockResolvedValue(undefined),
      send: vi.fn().mockResolvedValue(undefined),
      onmessage: null,
      onclose: null,
      onerror: null,
    };
  }),
}));

// Mock the handlers
vi.mock('../src/tools/index.js', () => {
  const mockHandler = vi.fn().mockResolvedValue({
    content: [{ type: 'text', text: 'Success' }],
    isError: false,
  });

  return {
    TOOLS: [
      { name: 'test_tool', description: 'Test tool', inputSchema: {} },
      {
        name: 'schema_tool',
        description: 'Tool with a declared input schema',
        inputSchema: {
          type: 'object',
          properties: {
            name: { type: 'string' },
            client_id: { type: 'string' },
          },
          required: ['name'],
        },
      },
      {
        name: 'auth0_save_credentials_to_file',
        description: 'Rate-limited credential write tool',
        inputSchema: { type: 'object', properties: {}, additionalProperties: false },
      },
    ],
    HANDLERS: {
      test_tool: mockHandler,
      schema_tool: vi.fn().mockResolvedValue({
        content: [{ type: 'text', text: 'Success' }],
        isError: false,
      }),
      auth0_save_credentials_to_file: vi.fn().mockResolvedValue({
        content: [{ type: 'text', text: 'Credentials saved' }],
        isError: false,
      }),
    },
  };
});

function getCallToolHandler() {
  const handlerCall = mockSetRequestHandler.mock.calls.find(
    (call) => call[0] === CallToolRequestSchema
  );
  expect(handlerCall).toBeDefined();
  return handlerCall![1];
}

describe('Server', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset the mock implementations
    mockSetRequestHandler.mockClear();
    mockConnect.mockClear();
    mockClose.mockClear();
    mockValidateConfig.mockImplementation(() => Promise.resolve(true));
  });

  describe('Initialization', () => {
    it('should initialize the server successfully', async () => {
      const server = await startServer();

      expect(mockLoadConfig).toHaveBeenCalledTimes(1);
      expect(mockValidateConfig).toHaveBeenCalledWith(mockConfig);
      expect(server).toBeDefined();
      expect(Server).toHaveBeenCalledWith(
        { name: 'auth0', version: '0.1.0-beta.1' },
        { capabilities: { tools: {}, logging: {} } }
      );
    });

    it('should not emit MCP logging notifications during startup', async () => {
      await startServer();

      expect(mockSendLoggingMessage).not.toHaveBeenCalled();
    });

    it('should initialize the server with filtered tools', async () => {
      const options = { tools: ['auth0_list_applications'] };
      const server = await startServer(options);

      expect(mockLoadConfig).toHaveBeenCalledTimes(1);
      expect(mockValidateConfig).toHaveBeenCalledWith(mockConfig);
      expect(server).toBeDefined();

      // Get the ListToolsRequestSchema handler to check filtered tools
      const handlerCall = mockSetRequestHandler.mock.calls.find(
        (call) => call[0] === ListToolsRequestSchema
      );
      expect(handlerCall).toBeDefined();

      // Since the handler returns a filtered list of tools, we can't easily test that here
      // But we can verify it was called
      expect(handlerCall).toBeTruthy();
    });

    it('should throw an error if config validation fails', async () => {
      mockValidateConfig.mockResolvedValueOnce(false);

      await expect(startServer()).rejects.toThrow('Invalid Auth0 configuration');

      expect(mockLoadConfig).toHaveBeenCalledTimes(1);
      expect(mockValidateConfig).toHaveBeenCalledWith(mockConfig);
    });

    it('should handle connection timeout', async () => {
      // Mock the connect method to simulate a timeout by rejecting with a timeout error
      mockConnect.mockRejectedValueOnce(new Error('Connection timeout'));

      // The startServer function should propagate the timeout error
      await expect(startServer()).rejects.toThrow('Connection timeout');
    }, 10000); // Increase timeout for this test
  });

  describe('Request Handlers', () => {
    it('should set up ListToolsRequestSchema handler', async () => {
      await startServer();

      // Verify the handler was registered
      expect(mockSetRequestHandler).toHaveBeenCalledWith(
        ListToolsRequestSchema,
        expect.any(Function)
      );

      // Get the handler function that was registered
      const handlerCall = mockSetRequestHandler.mock.calls.find(
        (call) => call[0] === ListToolsRequestSchema
      );
      expect(handlerCall).toBeDefined();
      const handlerFn = handlerCall![1];

      // Call the handler and verify it returns the expected tools
      const result = await handlerFn();
      expect(result).toEqual({ tools: TOOLS });
    });

    it('should set up CallToolRequestSchema handler', async () => {
      await startServer();

      // Verify the handler was registered
      expect(mockSetRequestHandler).toHaveBeenCalledWith(
        CallToolRequestSchema,
        expect.any(Function)
      );

      const handlerFn = getCallToolHandler();

      // Call the handler with a valid tool request
      const request = {
        params: {
          name: 'test_tool',
          arguments: { param: 'value' },
        },
      };

      const result = await handlerFn(request);

      // Verify the handler called the tool handler with the right parameters
      expect(HANDLERS.test_tool).toHaveBeenCalledWith(
        {
          token: mockConfig.token,
          parameters: { param: 'value' },
        },
        { domain: mockConfig.domain }
      );

      // Verify the result is passed through correctly
      expect(result).toHaveProperty('content');
      expect(result).toHaveProperty('isError', false);
    });

    it('should handle unknown tool errors', async () => {
      await startServer();

      const handlerFn = getCallToolHandler();

      // Call the handler with an invalid tool name
      const request = {
        params: {
          name: 'unknown_tool',
          arguments: {},
        },
      };

      const result = await handlerFn(request);

      // Verify the error response
      expect(result).toHaveProperty('content');
      expect(result).toHaveProperty('isError', true);
      expect(result.content[0].text).toContain('Error: Unknown or restricted tool');
    });

    it('should reject a tool that is in HANDLERS but filtered out of availableTools', async () => {
      // Start server with a restrictive tools filter that excludes test_tool
      await startServer({ tools: ['nonexistent_*'], readOnly: false });

      const handlerFn = getCallToolHandler();

      // test_tool exists in HANDLERS but is not in availableTools (filtered out)
      const request = {
        params: {
          name: 'test_tool',
          arguments: {},
        },
      };

      const result = await handlerFn(request);

      expect(result).toHaveProperty('isError', true);
      expect(result.content[0].text).toContain('Unknown or restricted tool');
      expect(HANDLERS.test_tool).not.toHaveBeenCalled();
    });

    it('should reload config if it becomes invalid during a tool call', async () => {
      // First call to validateConfig returns true, second call returns false, third call returns true
      mockValidateConfig
        .mockResolvedValueOnce(true) // Initial validation during server start
        .mockResolvedValueOnce(false) // Validation during tool call
        .mockResolvedValueOnce(true); // Validation after reload

      await startServer();

      const handlerFn = getCallToolHandler();

      // Call the handler
      const request = {
        params: {
          name: 'test_tool',
          arguments: {},
        },
      };

      await handlerFn(request);

      // Verify loadConfig was called twice (once during initialization, once during reload)
      expect(mockLoadConfig).toHaveBeenCalledTimes(2);

      // Verify validateConfig was called three times
      expect(mockValidateConfig).toHaveBeenCalledTimes(3);
    });

    it('should throw an error if config is still invalid after reload', async () => {
      // First call to validateConfig returns true, subsequent calls return false
      mockValidateConfig.mockResolvedValueOnce(true).mockResolvedValue(false);

      await startServer();

      const handlerFn = getCallToolHandler();

      // Call the handler
      const request = {
        params: {
          name: 'test_tool',
          arguments: {},
        },
      };

      const result = await handlerFn(request);

      // Verify the error response
      expect(result).toHaveProperty('isError', true);
      expect(result.content[0].text).toContain('Auth0 configuration is invalid');
    });

    it('should handle missing domain error', async () => {
      // Mock config without domain
      mockLoadConfig.mockResolvedValueOnce({ ...mockConfig, domain: undefined });

      await startServer();

      const handlerFn = getCallToolHandler();

      // Call the handler
      const request = {
        params: {
          name: 'test_tool',
          arguments: {},
        },
      };

      const result = await handlerFn(request);

      // Verify the error response
      expect(result).toHaveProperty('isError', true);
      expect(result.content[0].text).toContain('AUTH0_DOMAIN environment variable is not set');
    });

    it('should handle tool execution errors', async () => {
      // Mock the handler to throw an error
      const mockHandler = HANDLERS.test_tool as Mock;
      mockHandler.mockRejectedValueOnce(new Error('Tool execution failed'));

      await startServer();

      const handlerFn = getCallToolHandler();

      // Call the handler
      const request = {
        params: {
          name: 'test_tool',
          arguments: {},
        },
      };

      const result = await handlerFn(request);

      // Verify the error response
      expect(result).toHaveProperty('isError', true);
      expect(result.content[0].text).toContain('Error: Tool execution failed');
    });

    it('should reject arguments not declared in the tool inputSchema', async () => {
      await startServer();

      const handlerFn = getCallToolHandler();

      // custom_login_page is a security-critical Auth0 param that is NOT declared
      // in schema_tool's inputSchema, so it must be rejected before reaching the handler.
      const request = {
        params: {
          name: 'schema_tool',
          arguments: {
            name: 'My App',
            custom_login_page_on: true,
            custom_login_page: '<script>steal()</script>',
          },
        },
      };

      const result = await handlerFn(request);

      expect(result).toHaveProperty('isError', true);
      expect(result.content[0].text).toContain('Rejected undeclared parameters');
      expect(result.content[0].text).toContain('custom_login_page_on');
      expect(result.content[0].text).toContain('custom_login_page');
      expect(HANDLERS.schema_tool).not.toHaveBeenCalled();
    });

    it('should allow arguments that are all declared in the tool inputSchema', async () => {
      await startServer();

      const handlerFn = getCallToolHandler();

      const request = {
        params: {
          name: 'schema_tool',
          arguments: {
            name: 'My App',
            client_id: 'abc123',
          },
        },
      };

      const result = await handlerFn(request);

      expect(result).toHaveProperty('isError', false);
      expect(HANDLERS.schema_tool).toHaveBeenCalledWith(
        {
          token: mockConfig.token,
          parameters: { name: 'My App', client_id: 'abc123' },
        },
        { domain: mockConfig.domain }
      );
    });

    it('should not enforce an allowlist when the tool declares no schema properties', async () => {
      await startServer();

      const handlerFn = getCallToolHandler();

      // test_tool has an empty inputSchema (no properties), so validation is skipped.
      const request = {
        params: {
          name: 'test_tool',
          arguments: { anything: 'goes' },
        },
      };

      const result = await handlerFn(request);

      expect(result).toHaveProperty('isError', false);
      expect(HANDLERS.test_tool).toHaveBeenCalled();
    });

    it('should rate-limit auth0_save_credentials_to_file after 5 calls', async () => {
      await startServer();
      const handlerFn = getCallToolHandler();
      const request = {
        params: { name: 'auth0_save_credentials_to_file', arguments: {} },
      };

      for (let i = 0; i < 5; i++) {
        const result = await handlerFn(request);
        expect(result).toHaveProperty('isError', false);
      }

      const result = await handlerFn(request);
      expect(result).toHaveProperty('isError', true);
      expect(result.content[0].text).toContain('Rate limit exceeded');
      expect(result.content[0].text).toContain('5 calls per 60 seconds');
    });

    it('should not rate-limit other tools', async () => {
      await startServer();
      const handlerFn = getCallToolHandler();
      const request = {
        params: { name: 'test_tool', arguments: {} },
      };

      for (let i = 0; i < 10; i++) {
        const result = await handlerFn(request);
        expect(result).toHaveProperty('isError', false);
      }
    });
  });
});
