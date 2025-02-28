# Auth0 MCP Server

A Model Context Protocol (MCP) server implementation for integrating Auth0 Management API with Claude Desktop.

## Quick Setup

### Prerequisites

- Node.js v18 or higher
- Git

### Installation

1. **Clone and build the Auth0 CLI with MCP support**:

   ```bash
   # Clone the Auth0 CLI with MCP support
   git clone -b mcp-server https://github.com/bharath31/auth0-cli
   cd auth0-cli

   # Build the CLI
   make build

   # Login to Auth0
   ./out/auth0 login
   ```

2. **Clone and build the Auth0 MCP server**:

   ```bash
   # Go back to the root directory
   cd..

   # Clone the repository
   git clone https://github.com/bharath31/auth0-mcp-server
   cd auth0-mcp-server

   # Install dependencies
   npm install

   # Automatically detect and configure Auth0 CLI path
   npm run setup

   # Build the server
   npm run build
   ```

3. **Configure Claude Desktop**:

   ```bash
   # From the auth0-cli directory
   ./out/auth0 mcp init
   ```

   This command configures Claude Desktop to use the Auth0 MCP server. It automatically manages the server process, so you don't need to run it manually.

## Supported Tools

The Auth0 MCP Server provides the following tools for Claude to interact with your Auth0 tenant:

| Tool Name                      | Description                                          |
| ------------------------------ | ---------------------------------------------------- |
| **Applications**               |                                                      |
| `auth0_list_applications`      | List all applications in the Auth0 tenant            |
| `auth0_get_application`        | Get details about a specific Auth0 application       |
| `auth0_search_applications`    | Search for applications by name                      |
| `auth0_create_application`     | Create a new Auth0 application                       |
| `auth0_update_application`     | Update an existing Auth0 application                 |
| `auth0_delete_application`     | Delete an Auth0 application                          |
| **Resource Servers**           |                                                      |
| `auth0_list_resource_servers`  | List all resource servers (APIs) in the Auth0 tenant |
| `auth0_get_resource_server`    | Get details about a specific Auth0 resource server   |
| `auth0_create_resource_server` | Create a new Auth0 resource server (API)             |
| `auth0_update_resource_server` | Update an existing Auth0 resource server             |
| `auth0_delete_resource_server` | Delete an Auth0 resource server                      |
| **Actions**                    |                                                      |
| `auth0_list_actions`           | List all actions in the Auth0 tenant                 |
| `auth0_get_action`             | Get details about a specific Auth0 action            |
| `auth0_create_action`          | Create a new Auth0 action                            |
| `auth0_update_action`          | Update an existing Auth0 action                      |
| `auth0_delete_action`          | Delete an Auth0 action                               |
| `auth0_deploy_action`          | Deploy an Auth0 action                               |
| **Logs**                       |                                                      |
| `auth0_list_logs`              | List logs from the Auth0 tenant                      |
| `auth0_get_log`                | Get a specific log entry by ID                       |
| `auth0_search_logs`            | Search logs with specific criteria                   |
| **Forms**                      |                                                      |
| `auth0_list_forms`             | List all forms in the Auth0 tenant                   |
| `auth0_get_form`               | Get details about a specific Auth0 form              |
| `auth0_create_form`            | Create a new Auth0 form                              |
| `auth0_update_form`            | Update an existing Auth0 form                        |
| `auth0_delete_form`            | Delete an Auth0 form                                 |
| `auth0_publish_form`           | Publish an Auth0 form                                |

## Modes of Operation

The server supports two modes when used with the Auth0 CLI:

### Production Mode (Default)

- Uses the global Auth0 CLI in your PATH
- Minimal logging

### Debug Mode

- Uses a local Auth0 CLI path when available
- More detailed logging
- Enable by setting environment variable: `export AUTH0_MCP_DEBUG=true`

## Troubleshooting

If you encounter issues with the Auth0 CLI path:

1. The `npm run setup` command automatically detects your Auth0 CLI path
2. You can manually set the path: `export AUTH0_CLI_PATH=/path/to/auth0-cli/auth0`
3. Run the validator to check your setup: `npm run utils:validate-env`

## Testing

```bash
# Test the connection
npm test

# Test a specific tool call
npm run test:tools
```

## Additional Information

For more detailed information, check the documentation in the `docs` directory.
