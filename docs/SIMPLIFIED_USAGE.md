# Simplified Auth0 MCP Server

A streamlined implementation of the Auth0 MCP server for Claude Desktop that avoids token retrieval issues and provides reliable tool functionality.

## Overview

This simplified implementation addresses several issues with the original Auth0 MCP server:

1. **Token Retrieval Issues**: Uses a direct approach for token retrieval with proper timeouts
2. **Reliable Initialization**: Properly handles MCP initialization requests
3. **Streamlined Design**: Single-file implementation for easier debugging and maintenance

## Installation

### Prerequisites

- Node.js 16 or higher
- Auth0 CLI (authenticated with `auth0 login`)
- An Auth0 account/tenant

### Setup Instructions

1. **Run the configuration script**:

   ```bash
   cd ~/dev/mcp/auth0-mcp-server
   node update-claude-config.js
   ```

2. **Restart Claude Desktop** for the changes to take effect.

## Usage

Once configured, Claude Desktop will automatically use the simplified Auth0 MCP server. You can ask Claude to:

- List applications in your Auth0 tenant
- Manage Auth0 resources
- Query information about your Auth0 configuration

## Available Tools

Currently, the following tools are implemented:

- **auth0_list_applications**: List all applications in your Auth0 tenant

## Troubleshooting

### Token Retrieval Issues

If you encounter problems with token retrieval:

1. Ensure you're logged in with Auth0 CLI:

   ```bash
   auth0 login
   ```

2. Verify the token can be retrieved manually:
   ```bash
   cd ~/dev/mcp/auth0-mcp-server
   node test-token-local.js
   ```

### Server Connection Issues

To test if the server is working correctly:

```bash
cd ~/dev/mcp/auth0-mcp-server
node test-simple-server.js
```

This should run through the entire flow of initializing the server, listing tools, and calling the `auth0_list_applications` tool.

### Claude Desktop Configuration

If Claude Desktop cannot connect to the Auth0 MCP server:

1. Ensure the simplified server path is correct in the Claude Desktop configuration:

   ```bash
   cat ~/Library/Application\ Support/Claude/claude_desktop_config.json | grep auth0
   ```

2. Try running the configuration update script again:

   ```bash
   cd ~/dev/mcp/auth0-mcp-server
   node update-claude-config.js
   ```

3. Verify the script is executable:
   ```bash
   chmod +x ~/dev/mcp/auth0-mcp-server/simple-auth0-server.js
   ```

## Technical Details

### How It Works

The simplified server:

1. Retrieves a token directly from Auth0 CLI with proper timeouts
2. Initializes a JSON-RPC server following the Model Context Protocol
3. Handles tool listing and execution requests
4. Makes API calls to Auth0 Management API

### Performance Considerations

- Token retrieval is cached for better performance
- Proper error handling for all API requests
- Timeouts prevent hanging during token retrieval

## Future Improvements

Planned improvements for the simplified implementation:

1. Add more Auth0 management tools
2. Implement token refresh mechanism
3. Add advanced error reporting
4. Support for additional Auth0 tenant operations

## Testing

Run the following tests to verify the server is working correctly:

```bash
# Test token retrieval
node test-token-local.js

# Test the entire MCP server flow
node test-simple-server.js
```

## References

- [Model Context Protocol Documentation](https://github.com/anthropics/model-context-protocol-spec)
- [Auth0 Management API Documentation](https://auth0.com/docs/api/management/v2)
- [Auth0 CLI Documentation](https://github.com/auth0/auth0-cli)
