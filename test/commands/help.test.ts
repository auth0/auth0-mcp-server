import { describe, it, expect, vi, beforeEach, Mock } from 'vitest';
import help from '../../src/commands/help.js';
import * as cliUtility from '../../src/utils/cli-utility';

// Mock the cliOutput function
vi.mock('../../src/utils/cli-utility.js', () => ({
  cliOutput: vi.fn().mockReturnValue(true),
}));

// Get a reference to the mocked function
const mockCliOutput = vi.fn().mockReturnValue(true);
vi.mocked(cliUtility.cliOutput).mockImplementation(mockCliOutput);

describe('Help Command', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should output help information', async () => {
    // Call the help function
    await help();

    // Verify cliOutput was called
    expect(cliUtility.cliOutput).toHaveBeenCalledTimes(1);
  });

  it('should include all required sections in the help text', async () => {
    // Call the help function
    await help();

    // Get the help text that was passed to cliOutput
    const helpText = (cliUtility.cliOutput as Mock).mock.calls[0][0];

    // Verify the help text includes all required sections
    expect(helpText).toContain('Auth0 MCP Server');
    expect(helpText).toContain('USAGE:');
    expect(helpText).toContain('COMMANDS:');
    expect(helpText).toContain('init');
    expect(helpText).toContain('run');
    expect(helpText).toContain('help');
    expect(helpText).toContain('EXAMPLES:');
  });

  it('should include client options in the help text', async () => {
    // Call the help function
    await help();

    // Get the help text that was passed to cliOutput
    const helpText = (cliUtility.cliOutput as Mock).mock.calls[0][0];

    // Verify the help text includes client options
    expect(helpText).toContain('--client');
    expect(helpText).toContain('claude');
    expect(helpText).toContain('windsurf');
    expect(helpText).toContain('cursor');
  });

  it('should include example commands in the help text', async () => {
    // Call the help function
    await help();

    // Get the help text that was passed to cliOutput
    const helpText = (cliUtility.cliOutput as Mock).mock.calls[0][0];

    // Verify the help text includes example commands
    expect(helpText).toContain('npx @auth0/auth0-mcp-server init');
    expect(helpText).toContain('npx @auth0/auth0-mcp-server init --client windsurf');
    expect(helpText).toContain('npx @auth0/auth0-mcp-server init --client cursor');
    expect(helpText).toContain('npx @auth0/auth0-mcp-server run');
  });

  it('should include a link to the GitHub repository', async () => {
    // Call the help function
    await help();

    // Get the help text that was passed to cliOutput
    const helpText = (cliUtility.cliOutput as Mock).mock.calls[0][0];

    // Verify the help text includes the GitHub repository link
    expect(helpText).toContain('https://github.com/auth0/auth0-mcp-server');
  });

  it('should call cliOutput with the help text', async () => {
    // Mock cliOutput to return true for this test
    vi.mocked(cliUtility.cliOutput).mockReturnValueOnce(true);

    // Call the help function
    await help();

    // Verify cliOutput was called with a string
    expect(cliUtility.cliOutput).toHaveBeenCalledWith(expect.any(String));
  });
});
