import { describe, it, expect, vi, beforeEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// Create mocks for imported modules
const mockAddHelpText = vi.fn().mockReturnThis();
const mockVersion = vi.fn().mockReturnThis();
const mockCommand = vi.fn().mockReturnThis();
const mockName = vi.fn().mockReturnThis();
const mockDescription = vi.fn().mockReturnThis();
const mockOption = vi.fn().mockReturnThis();
const mockAction = vi.fn().mockReturnThis();
const mockParseAsync = vi.fn().mockResolvedValue(true);

// Mock the Command class
vi.mock('commander', () => {
  return {
    Command: vi.fn(function() {
      return {
        name: mockName,
        description: mockDescription,
        version: mockVersion,
        addHelpText: mockAddHelpText,
        command: mockCommand,
        option: mockOption,
        action: mockAction,
        parseAsync: mockParseAsync,
      };
    }),
  };
});

// Read the actual package.json for the test
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const packageJsonPath = path.resolve(__dirname, '../package.json');
const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));

// Mock the createRequire function to return the actual package.json data
vi.mock('module', () => {
  return {
    createRequire: vi.fn().mockImplementation(() => {
      return () => ({
        name: packageJson.name,
        version: packageJson.version,
      });
    }),
  };
});

describe('Index Module', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // Reset the module cache to force re-execution of the index.js file
    vi.resetModules();
  });

  it('validates the integration with Commander.js help system', async () => {
    // Import the index file to initialize Commander
    await import('../src/index.js');

    // Verify version was called with the package version
    expect(mockVersion).toHaveBeenCalled();

    // Verify addHelpText was called for before and after help sections
    expect(mockAddHelpText).toHaveBeenCalledWith(
      'before',
      expect.stringContaining('Auth0 MCP Server')
    );

    expect(mockAddHelpText).toHaveBeenCalledWith('after', expect.stringContaining('Examples:'));

    // Verify the help text includes important examples and info
    const afterHelpCalls = mockAddHelpText.mock.calls.filter((call) => call[0] === 'after');

    const helpText = afterHelpCalls.length > 0 ? afterHelpCalls[0][1] : '';

    // Check for the GitHub repository link
    expect(helpText).toContain('https://github.com/auth0/auth0-mcp-server');

    // Check for example commands
    expect(helpText).toContain('npx @auth0/auth0-mcp-server init --tools ');
    expect(helpText).toContain(
      "npx @auth0/auth0-mcp-server init --tools 'auth0_*' --client claude"
    );
    expect(helpText).toContain(
      "npx @auth0/auth0-mcp-server init --tools 'auth0_*_applications' --client windsurf"
    );
    expect(helpText).toContain(
      "npx @auth0/auth0-mcp-server init --tools 'auth0_list_*,auth0_get_*' --client cursor"
    );
    expect(helpText).toContain('npx @auth0/auth0-mcp-server run');
  });

  it('sets up all required commands', async () => {
    // Import the index file to initialize Commander
    await import('../src/index.js');

    // Verify commander command setup
    expect(mockCommand).toHaveBeenCalledWith('init');
    expect(mockCommand).toHaveBeenCalledWith('run');
    expect(mockCommand).toHaveBeenCalledWith('logout');
    expect(mockCommand).toHaveBeenCalledWith('session');
  });
});
