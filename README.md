# Auth0 MCP Server



A Model Context Protocol (MCP) server implementation that integrates Auth0 Management API with Claude Desktop, enabling AI-assisted management of your Auth0 tenant.

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Node.js Version](https://img.shields.io/badge/node-%3E%3D18.0.0-brightgreen.svg)](https://nodejs.org/)

## Overview

The Auth0 MCP Server allows Claude AI to interact with your Auth0 tenant through the Model Context Protocol. This enables Claude to help you manage applications, resource servers, actions, logs, forms, and more within your Auth0 environment.

Key features:
- Secure authentication using device authorization flow
- Credential storage in system keychain for enhanced security
- Comprehensive set of tools for Auth0 tenant management
- Seamless integration with Claude Desktop

## Quick Start

### Prerequisites

- Node.js v18 or higher
- Claude Desktop application
- Auth0 account with appropriate permissions

### Installation

Install and initialize the Auth0 MCP Server with a single command:

```bash
npx @auth0/auth0-mcp-server init
```

This will:
1. Start the device authorization flow
2. Open your browser to authenticate with Auth0
3. Store your credentials securely in your system's keychain
4. Configure Claude Desktop to use the Auth0 MCP Server

### Connecting to Claude Desktop

After installation:

1. Restart Claude Desktop
2. In a conversation with Claude, ask it to help you manage your Auth0 tenant
3. Claude will now have access to your Auth0 environment through the MCP server

## Architecture

The Auth0 MCP Server implements the Model Context Protocol, allowing Claude to:

1. Request a list of available Auth0 tools
2. Call specific tools with parameters
3. Receive structured responses from the Auth0 Management API

The server handles authentication, request validation, and secure communication with the Auth0 Management API.

## Authentication

The server uses OAuth 2.0 device authorization flow for secure authentication with Auth0. Your credentials are stored securely in your system's keychain and are never exposed in plain text.

## Supported Tools

The Auth0 MCP Server provides the following tools for Claude to interact with your Auth0 tenant:

### Applications

| Tool Name | Description |
|-----------|-------------|
| `auth0_list_applications` | List all applications in the Auth0 tenant |
| `auth0_get_application` | Get details about a specific Auth0 application |
| `auth0_search_applications` | Search for applications by name |
| `auth0_create_application` | Create a new Auth0 application |
| `auth0_update_application` | Update an existing Auth0 application |
| `auth0_delete_application` | Delete an Auth0 application |

### Resource Servers

| Tool Name | Description |
|-----------|-------------|
| `auth0_list_resource_servers` | List all resource servers (APIs) in the Auth0 tenant |
| `auth0_get_resource_server` | Get details about a specific Auth0 resource server |
| `auth0_create_resource_server` | Create a new Auth0 resource server (API) |
| `auth0_update_resource_server` | Update an existing Auth0 resource server |
| `auth0_delete_resource_server` | Delete an Auth0 resource server |

### Actions

| Tool Name | Description |
|-----------|-------------|
| `auth0_list_actions` | List all actions in the Auth0 tenant |
| `auth0_get_action` | Get details about a specific Auth0 action |
| `auth0_create_action` | Create a new Auth0 action |
| `auth0_update_action` | Update an existing Auth0 action |
| `auth0_delete_action` | Delete an Auth0 action |
| `auth0_deploy_action` | Deploy an Auth0 action |

### Logs

| Tool Name | Description |
|-----------|-------------|
| `auth0_list_logs` | List logs from the Auth0 tenant |
| `auth0_get_log` | Get a specific log entry by ID |
| `auth0_search_logs` | Search logs with specific criteria |

### Forms

| Tool Name | Description |
|-----------|-------------|
| `auth0_list_forms` | List all forms in the Auth0 tenant |
| `auth0_get_form` | Get details about a specific Auth0 form |
| `auth0_create_form` | Create a new Auth0 form |
| `auth0_update_form` | Update an existing Auth0 form |
| `auth0_delete_form` | Delete an Auth0 form |
| `auth0_publish_form` | Publish an Auth0 form |

## Advanced Usage

### Command Line Interface

The server provides a CLI with the following commands:

```bash
# Initialize the server (authenticate and configure)
npx @auth0/auth0-mcp-server init

# Run the server
npx @auth0/auth0-mcp-server run
```

### Operation Modes

The server supports two modes:

#### Production Mode (Default)
- Uses the global Auth0 CLI in your PATH
- Minimal logging

#### Debug Mode
- More detailed logging
- Enable by setting environment variable: `export DEBUG=auth0-mcp:*`

### Configuration

The server stores configuration securely in your system's keychain. No configuration files or environment variables are needed for normal operation.

## Troubleshooting

### Common Issues

1. **Authentication Failures**
   - Ensure you have the correct permissions in your Auth0 tenant
   - Try re-initializing with `npx @auth0/auth0-mcp-server init`

2. **Claude Can't Connect to the Server**
   - Restart Claude Desktop after installation
   - Check that the server is running with `ps aux | grep auth0-mcp`

3. **API Errors**
   - Enable debug mode with `export DEBUG=auth0-mcp:*`
   - Check your Auth0 token permissions and expiration

### Logs

For detailed logs, run the server in debug mode:

```bash
DEBUG=auth0-mcp:* npx @auth0/auth0-mcp-server run
```

## Development

### Building from Source

```bash
# Clone the repository
git clone https://github.com/auth0/auth0-mcp-server.git
cd auth0-mcp-server

# Install dependencies
npm install

# Build the project
npm run build

# Run the server
npm start
```


## Security

The Auth0 MCP Server prioritizes security:

- Credentials are stored in the system's secure keychain
- No sensitive information is stored in plain text
- Authentication uses OAuth 2.0 device authorization flow
- Minimal permissions are requested for API access

## Feedback and Contributing

We appreciate feedback and contributions to this project! Before you get started, please see:

- [Auth0's general contribution guidelines](https://github.com/auth0/open-source-template/blob/master/GENERAL-CONTRIBUTING.md)
- [Auth0's code of conduct guidelines](https://github.com/auth0/open-source-template/blob/master/CODE-OF-CONDUCT.md)

### Reporting Issues

To provide feedback or report a bug, please [raise an issue on our issue tracker](https://github.com/auth0/node-auth0/issues).

### Vulnerability Reporting

Please do not report security vulnerabilities on the public GitHub issue tracker. The [Responsible Disclosure Program](https://auth0.com/whitehat) details the procedure for disclosing security issues.

## What is Auth0?
<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="https://cdn.auth0.com/website/sdks/logos/auth0_dark_mode.png" width="150">
    <source media="(prefers-color-scheme: light)" srcset="https://cdn.auth0.com/website/sdks/logos/auth0_light_mode.png" width="150">
    <img alt="Auth0 Logo" src="https://cdn.auth0.com/website/sdks/logos/auth0_light_mode.png" width="150">
  </picture>
</p>


Auth0 is an easy to implement, adaptable authentication and authorization platform. To learn more checkout [Why Auth0?](https://auth0.com/why-auth0)

## License

This project is licensed under the MIT license. See the [LICENSE](https://github.com/auth0/node-auth0/blob/master/LICENSE) file for more info.

