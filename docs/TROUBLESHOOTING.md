# Auth0 MCP Server Troubleshooting Guide

This guide addresses common issues with the Auth0 MCP server, focusing on token retrieval problems and how to resolve them properly.

## Token Retrieval Issues

### Problem: Connection Test Script Stuck on "Getting Auth0 token..."

The most common issue is the test script hanging when attempting to retrieve an Auth0 token. This happens because:

1. External process calls to `auth0 api get-token` may hang indefinitely
2. There are no proper timeouts implemented in the original scripts
3. The token retrieval process has multiple potential failure points

### Solution: Use the Secure Token Retrieval Approach

We've implemented several solutions to address token retrieval issues:

1. **Test Token Retrieval**: Use the dedicated token testing script to diagnose issues

   ```bash
   npm run test-token
   ```

2. **Configure Claude Desktop Securely**: Update Claude Desktop to use dynamic token retrieval

   ```bash
   npm run setup-secure
   ```

3. **Manually Login to Auth0**: Ensure you're properly authenticated with Auth0
   ```bash
   auth0 login
   ```

## Proper Token Management

### DO NOT: Store Tokens in Configuration Files

**Never store Auth0 tokens in configuration files**. This is a security risk and can lead to issues when tokens expire.

### DO: Use Dynamic Token Retrieval

The secure approach implemented in this project:

1. Retrieves tokens dynamically when needed
2. Implements proper timeouts to prevent hanging
3. Uses in-memory caching with expiration checks
4. Falls back to multiple retrieval methods

## Configuration Issues

### Problem: Claude Desktop Configuration Issues

If Claude Desktop cannot connect to the Auth0 MCP server:

1. Check if Auth0 CLI is installed and authenticated

   ```bash
   which auth0
   auth0 tenants list
   ```

2. Verify the wrapper script is executable

   ```bash
   chmod +x dynamic-wrapper.sh
   ```

3. Update Claude Desktop configuration securely
   ```bash
   npm run setup-secure
   ```

### Solution: Use the Proper Dynamic Configuration

The secure configuration:

1. Uses the dynamic wrapper script
2. Doesn't store any tokens in the configuration
3. Sets up proper environment for dynamic token retrieval

## Advanced Troubleshooting

### Testing the Server Directly

You can test the server directly using the test scripts:

```bash
# Test connection with dynamic token retrieval
npm run test-connection

# Test the simple wrapper approach
npm run test-simple
```

### Check Claude Desktop Logs

Claude Desktop logs can be found at:

- macOS: `~/Library/Logs/Claude/main.log`
- Windows: `%USERPROFILE%\AppData\Roaming\Claude\logs\main.log`

### Manually Reset Configuration

If you need to completely reset your configuration:

1. Stop Claude Desktop
2. Restore the backup:
   ```bash
   cp "/Users/username/Library/Application Support/Claude/claude_desktop_config.json.backup" "/Users/username/Library/Application Support/Claude/claude_desktop_config.json"
   ```
3. Restart Claude Desktop

## Security Best Practices

1. **Never store tokens in configuration files**
2. **Always use dynamic token retrieval with proper timeouts**
3. **Keep Auth0 CLI authenticated with `auth0 login`**
4. **Implement token caching with proper expiration checking**
5. **Handle token refresh and error cases gracefully**
