import { describe, it, expect, vi, beforeEach, Mock } from 'vitest';
import { mockLoadConfig, mockValidateConfig, mockConfig } from './mocks/config';
import { startServer } from '../src/server';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { TOOLS, HANDLERS } from '../src/tools/index';

// Mock modules before importing the module that uses them
vi.mock('../src/utils/config.js', () => ({
  loadConfig: vi.fn().mockImplementation(() => mockLoadConfig()),
  validateConfig: vi.fn().mockImplementation((config) => mockValidateConfig(config)),
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
const mockServer = {
  setRequestHandler: mockSetRequestHandler,
  connect: mockConnect,
  close: mockClose,
  onerror: vi.fn(),
};

vi.mock('@modelcontextprotocol/sdk/server/index.js', () => ({
  Server: vi.fn().mockImplementation(() => mockServer),
}));

// Mock the handlers
vi.mock('../src/tools/index.js', () => {
  const mockHandler = vi.fn().mockResolvedValue({
    content: [{ type: 'text', text: 'Success' }],
    isError: false,
  });

  return {
    TOOLS: [{ name: 'test_tool', description: 'Test tool', inputSchema: {} }],
    HANDLERS: {
      test_tool: mockHandler,
    },
  };
});

describe('Server', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset the mock implementations
    mockSetRequestHandler.mockClear();
    mockConnect.mockClear();
    mockClose.mockClear();
    mockValidateConfig.mockImplementation((config) => true);
  });

  describe('Initialization', () => {
    it('should initialize the server successfully', async () => {
      const server = await startServer();

      expect(mockLoadConfig).toHaveBeenCalledTimes(1);
      expect(mockValidateConfig).toHaveBeenCalledWith(mockConfig);
      expect(server).toBeDefined();
      expect(Server).toHaveBeenCalledWith(
        { name: 'auth0', version: '1.0.0' },
        { capabilities: { tools: {} } }
      );
    });

    it('should throw an error if config validation fails', async () => {
      mockValidateConfig.mockReturnValueOnce(false);

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

      // Get the handler function that was registered
      const handlerCall = mockSetRequestHandler.mock.calls.find(
        (call) => call[0] === CallToolRequestSchema
      );
      expect(handlerCall).toBeDefined();
      const handlerFn = handlerCall![1];

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
      expect(result).toHaveProperty('isError');
    });

    it('should handle unknown tool errors', async () => {
      await startServer();

      // Get the handler function that was registered
      const handlerCall = mockSetRequestHandler.mock.calls.find(
        (call) => call[0] === CallToolRequestSchema
      );
      expect(handlerCall).toBeDefined();
      const handlerFn = handlerCall![1];

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
      expect(result.content[0].text).toContain('Error: Unknown tool');
    });

    it('should reload config if it becomes invalid during a tool call', async () => {
      // First call to validateConfig returns true, second call returns false, third call returns true
      mockValidateConfig
        .mockReturnValueOnce(true) // Initial validation during server start
        .mockReturnValueOnce(false) // Validation during tool call
        .mockReturnValueOnce(true); // Validation after reload

      await startServer();

      // Get the handler function that was registered
      const handlerCall = mockSetRequestHandler.mock.calls.find(
        (call) => call[0] === CallToolRequestSchema
      );
      expect(handlerCall).toBeDefined();
      const handlerFn = handlerCall![1];

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
      mockValidateConfig.mockReturnValueOnce(true).mockReturnValue(false);

      await startServer();

      // Get the handler function that was registered
      const handlerCall = mockSetRequestHandler.mock.calls.find(
        (call) => call[0] === CallToolRequestSchema
      );
      expect(handlerCall).toBeDefined();
      const handlerFn = handlerCall![1];

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

      // Get the handler function that was registered
      const handlerCall = mockSetRequestHandler.mock.calls.find(
        (call) => call[0] === CallToolRequestSchema
      );
      expect(handlerCall).toBeDefined();
      const handlerFn = handlerCall![1];

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

      // Get the handler function that was registered
      const handlerCall = mockSetRequestHandler.mock.calls.find(
        (call) => call[0] === CallToolRequestSchema
      );
      expect(handlerCall).toBeDefined();
      const handlerFn = handlerCall![1];

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
  });
});
