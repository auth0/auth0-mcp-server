![MCP server for Auth0](assets/mcp-banner-light.png)

<div align="center">

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Node.js Version](https://img.shields.io/badge/node-%3E%3D18.0.0-brightgreen.svg)](https://nodejs.org/)
![Downloads](https://img.shields.io/npm/dw/auth0-mcp-server)
</div>

<div align="center">

📚 [Documentation](http://auth0.com/docs/getstarted/ai-tools/model-context-protocol-MCP) • 🚀 [Getting Started](#getting-started) • 💻 [Supported Tools](#supported-tools) • 💬 [Feedback](#feedback)
</div>

</br>

[MCP (Model Context Protocol)](https://modelcontextprotocol.io/introduction) is an open protocol introduced by Anthropic that standardizes how large language models communicate with external tools, resources or remote services.

The Auth0 MCP Server integrates with LLMs and AI agents, allowing you to perform various Auth0 management operations using natural language. For instance, you could simply ask Claude to perform Auth0 management operations:

- > Create a new Auth0 app and get the domain and client ID
- > Create and deploy a new Auth0 action to generate a JWT token
- > Could you check Auth0 logs for logins from 192.108.92.3 IP address?

<br/>

<div align="center">
  <img src="assets/auth0-mcp-example-demo.gif" alt="Auth0 MCP Server Demo" width="800">
</div>

## 🚀 Getting Started

**Prerequisites:**

- [Node.js v18 or higher](https://nodejs.org/en/download)
- [Claude Desktop](https://claude.ai/download) or any other [MCP Client](https://modelcontextprotocol.io/clients)
- [Auth0](https://auth0.com/) account with appropriate permissions

<br/>

### Install the Auth0 MCP Server

Install Auth0 MCP Server and configure it to work with your preferred MCP client. 

**Claude Desktop**
```bash
npx @auth0/auth0-mcp-server init
```
**Windsurf**

```bash
npx @auth0/auth0-mcp-server init --client windsurf
```

**Cursor**

```bash
npx @auth0/auth0-mcp-server init --client cursor
```

**Other MCP Clients**

To use Auth0 MCP Server with any other MCP Client, you can manually add this configuration to the client and restart for changes to take effect:
 
```bash
{
  "mcpServers": {
    "auth0": {
      "command": "npx",
      "args": ["-y", "@auth0/auth0-mcp-server", "run"],
      "capabilities": ["tools"],
      "env": {
        "DEBUG": "auth0-mcp"
      }
    }
  }
```
</br>

### Authenticate with Auth0
Your browser will automatically open to initiate the OAuth 2.0 device authorization flow. Log into your Auth0 account and grant the requested permissions. 

> [!NOTE]
> Credentials are securely stored in your system's keychain. You can optionally verify storage through your keychain management tool. Checkout [Authentication](#-authentication) for more info. 

</br>

### Verify your integration

Restart your MCP Client(Claude, Windsurf, Cursor, etc...) and ask it to help you manage your Auth0 tenant

<div align="left">
  <img src="assets/help-image-01.png" alt="Claude installed Help Image" width="300">
</div>

</br>

## 🛠️ Supported Tools

The Auth0 MCP Server provides the following tools for Claude to interact with your Auth0 tenant:

<div align="center" style="display: flex; justify-content: center; gap: 20px;">
  <img src="assets/help-image-02.png" alt="Supported Tools img" width="400">
  <img src="assets/help-image-03.png" alt="Supported Tools img" width="400">
</div>

### Applications

| Tool                      | Description                                       | Usage Examples                                                                                                                                                              |
|---------------------------|---------------------------------------------------|--------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| `auth0_list_applications` | List all applications in the Auth0 tenant or search by name | - `Show me all my Auth0 applications` <br> - `Find applications with 'api' in their name` <br> - `What applications do I have in my Auth0 tenant?`              |
| `auth0_get_application`  | Get details about a specific Auth0 application     | - `Show me details for the application called 'Customer Portal'` <br> - `Get information about my application with client ID abc123` <br> - `What are the callback URLs for my 'Mobile App'?` |
| `auth0_create_application`| Create a new Auth0 application                      | - `Create a new single-page application called 'Analytics Dashboard'` <br> - `Set up a new native mobile app called 'iOS Client'` <br> - `Create a machine-to-machine application for our background service` |
| `auth0_update_application`| Update an existing Auth0 application                | - `Update the callback URLs for my 'Web App' to include https://staging.example.com/callback` <br> - `Change the logout URL for the 'Customer Portal'` <br> - `Add development environment metadata to my 'Admin Dashboard' application` |

### Resource Servers

| Tool                          | Description                                             | Usage Examples                                                                                                                                                              |
|-------------------------------|---------------------------------------------------------|--------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| `auth0_list_resource_servers` | List all resource servers (APIs) in the Auth0 tenant     | - `Show me all the APIs in my Auth0 tenant` <br> - `List my resource servers` <br> - `What APIs have I configured in Auth0?`                                         |
| `auth0_get_resource_server`  | Get details about a specific Auth0 resource server      | - `Show me details for the 'User API'` <br> - `What scopes are defined for my 'Payment API'?` <br> - `Get information about the resource server with identifier https://api.example.com"` |
| `auth0_create_resource_server`| Create a new Auth0 resource server (API)                | - `Create a new API called 'Inventory API' with read and write scopes` <br> - `Set up a resource server for our customer data API` <br> - `Create an API with the identifier https://orders.example.com"` |
| `auth0_update_resource_server`| Update an existing Auth0 resource server               | - `Add an 'admin' scope to the 'User API'` <br> - `Update the token lifetime for my 'Payment API' to 1 hour` <br> - `Change the signing algorithm for my API to RS256`         |

### Actions

| Tool                  | Description                          | Usage Examples                                                                                                                               |
|-----------------------|--------------------------------------|--------------------------------------------------------------------------------------------------------------------------------------------|
| `auth0_list_actions`  | List all actions in the Auth0 tenant | - `Show me all my Auth0 actions` <br> - `What actions do I have configured?` <br> - `List the actions in my tenant`                            |
| `auth0_get_action`   | Get details about a specific Auth0 action | - `Show me the code for my 'Enrich User Profile' action` <br> - `Get details about my login flow action` <br> - `What does my 'Add Custom Claims' action do?` |
| `auth0_create_action`| Create a new Auth0 action            | - `Create an action that adds user roles to tokens` <br> - `Set up an action to log failed login attempts` <br> - `Create a post-login action that checks user location` |
| `auth0_update_action`| Update an existing Auth0 action      | - `Update my 'Add Custom Claims' action to include department information` <br> - `Modify the IP filtering logic in my security action` <br> - `Fix the bug in my user enrichment action` |
| `auth0_deploy_action`| Deploy an Auth0 action               | - `Deploy my 'Add Custom Claims' action to production` <br> - `Make my new security action live` <br> - `Deploy the updated user enrichment action` |

### Logs

| Tool             | Description                     | Usage Examples                                                                                                                               |
|------------------|---------------------------------|--------------------------------------------------------------------------------------------------------------------------------------------|
| `auth0_list_logs` | List logs from the Auth0 tenant | - `Show me recent login attempts` <br> - `Find failed logins from the past 24 hours` <br> - `Get authentication logs from yesterday` <br> - `Show me successful logins for user john@example.com` |
| `auth0_get_log`  | Get a specific log entry by ID  | - `Show me details for log entry abc123` <br> - `Get more information about this failed login attempt` <br> - `What caused this authentication error?` |

### Forms

| Tool                   | Description                       | Usage Examples                                                                                                                               |
|------------------------|-----------------------------------|--------------------------------------------------------------------------------------------------------------------------------------------|
| `auth0_list_forms`     | List all forms in the Auth0 tenant | - `Show me all my Auth0 forms` <br> - `What login forms do I have configured?` <br> - `List the custom forms in my tenant`                      |
| `auth0_get_form`      | Get details about a specific Auth0 form | - `Show me the details of my 'Corporate Login' form` <br> - `What does my password reset form look like?` <br> - `Get the configuration for my signup form` |
| `auth0_create_form`    | Create a new Auth0 form           | - `Create a new login form with our company branding` <br> - `Set up a custom signup form that collects department information` <br> - `Create a password reset form with our logo` |
| `auth0_update_form`    | Update an existing Auth0 form     | - `Update the colors on our login form to match our new brand guidelines` <br> - `Add a privacy policy link to our signup form` <br> - `Change the logo on our password reset form` |
| `auth0_publish_form`   | Publish an Auth0 form             | - `Publish my updated login form` <br> - `Make the new signup form live` <br> - `Deploy the password reset form to production`                |


## 🕸️ Architecture

The Auth0 MCP Server implements the Model Context Protocol, allowing Claude to:

1. Request a list of available Auth0 tools
2. Call specific tools with parameters
3. Receive structured responses from the Auth0 Management API

The server handles authentication, request validation, and secure communication with the Auth0 Management API.

<div align="centre">
  <img src="assets/auth0-mcp-server-hld.png" alt="Auth0 MCP Server HLD" width="800">
</div>

> [!NOTE]
> The server operates as a local process that connects to Claude Desktop, enabling secure communication without exposing your Auth0 credentials.

</br>

## 🔐 Authentication

The Auth0 MCP Server uses the Auth0 Management API and requires authentication to access your Auth0 tenant.

### Initial Setup

To authenticate the MCP Server:

```bash
npx @auth0/auth0-mcp-server init
```

This will start the device authorization flow, allowing you to log in to your Auth0 account and select the tenant you want to use.

> [!IMPORTANT]
> The `init` command needs to be run whenever:
> - You're setting up the MCP Server for the first time
> - You've logged out from a previous session
> - You want to switch to a different tenant
> - Your token has expired

### Session Management

To see information about your current authentication session:

```bash
npx @auth0/auth0-mcp-server session
```

### Logging Out

For security best practices, always use the logout command when you're done with a session:

```bash
npx @auth0/auth0-mcp-server logout
```

This ensures your authentication tokens are properly removed from the system keychain.

### Authentication Flow

The server uses OAuth 2.0 device authorization flow for secure authentication with Auth0. Your credentials are stored securely in your system's keychain and are never exposed in plain text.

<div align="centre">
  <img src="assets/mcp-server-auth.png" alt="Authentication Sequence Diagram" width="800">
</div>

</br>

## 🩺 Troubleshooting

Get command line help: View a list of supported commands and usage examples

```bash
# Command help
npx @auth0/auth0-mcp-server help

# Initialize the server (authenticate and configure)
npx @auth0/auth0-mcp-server init

# Initialize with specific scopes (supports glob patterns)
npx @auth0/auth0-mcp-server init --scopes 'read:*,create:clients'

# Run the server
npx @auth0/auth0-mcp-server run

# Display current session information
npx @auth0/auth0-mcp-server session

# Remove Auth0 tokens from keychain
npx @auth0/auth0-mcp-server logout
```

### 🚥 Operation Modes

#### 🐞 Debug Mode

- More detailed logging
- Enable by setting environment variable: `export DEBUG=auth0-mcp`

> [!TIP]
> Debug mode is particularly useful when troubleshooting connection or authentication issues.

#### 🔑 Scope Selection

The server provides an interactive scope selection interface during initialization:

- **Interactive Selection**: Navigate with arrow keys and toggle selections with spacebar
- **No Default Scopes**: By default, no scopes are selected for maximum security
- **Glob Pattern Support**: Quickly select multiple related scopes with patterns:
  ```bash
  # Select all read scopes
  npx @auth0/auth0-mcp-server init --scopes 'read:*'
  
  # Select multiple scope patterns (comma-separated)
  npx @auth0/auth0-mcp-server init --scopes 'read:*,create:clients,update:actions'
  ```

> [!NOTE]
> Selected scopes determine what operations the MCP server can perform on your Auth0 tenant.

### ⚙️ Configuration

#### Other MCP Clients:

To use Auth0 MCP Server with any other MCP Client, you can add this configuration to the client and restart for changes to take effect:

```json
{
  "mcpServers": {
    "auth0": {
      "command": "npx",
      "args": ["-y", "@auth0/auth0-mcp-server", "run"],
      "capabilities": ["tools"],
      "env": {
        "DEBUG": "auth0-mcp"
      }
    }
  }
}
```

> [!NOTE]  
> you can manually update if needed or if any unexpected errors occur during the npx init command.

### 🚨 Common Issues
1. **Authentication Failures**

   - Ensure you have the correct permissions in your Auth0 tenant
   - Try re-initializing with `npx @auth0/auth0-mcp-server init`

2. **Claude Can't Connect to the Server**

   - Restart Claude Desktop after installation
   - Check that the server is running with `ps aux | grep auth0-mcp`

3. **API Errors or Permission Issues**
 
   - Enable debug mode with `export DEBUG=auth0-mcp`
   - Check your Auth0 token permissions and expiration
   - Reinitialize with specific scopes: `npx @auth0/auth0-mcp-server init --scopes 'read:*,update:*,create:*'`
   - If a specific operation fails, you may be missing the required scope

> [!TIP]
> Most connection issues can be resolved by restarting both the server and Claude Desktop.

</br>

## 📋 Debug logs

Enable debug mode to view detailed logs:
```sh
export DEBUG=auth0-mcp
```
Get detailed MCP Client logs from Claude Desktop:

```sh
# Follow logs in real-time
tail -n 20 -F ~/Library/Logs/Claude/mcp*.log
```

For advanced troubleshooting, use the MCP Inspector:

```sh
npx @modelcontextprotocol/inspector -e DEBUG='auth0-mcp' @auth0/auth0-mcp-server run
```

For detailed MCP Server logs, run the server in debug mode:

```bash
DEBUG=auth0-mcp npx @auth0/auth0-mcp-server run
```
</br>

## 👨‍💻 Development

### Building from Source

```bash
# Clone the repository
git clone https://github.com/auth0/auth0-mcp-server.git
cd auth0-mcp-server

# Install dependencies
npm install

# Build the project
npm run build

# Initiate device auth flow
npx . init

# Configure your MCP client(Claude Desktop) with MCP server path
npm run local-setup

# Restart MCP client, in this case claude desktop app
```

> [!NOTE]
> This server requires [Node.js v18 or higher](https://nodejs.org/en/download).

</br>

## 🔒 Security

The Auth0 MCP Server prioritizes security:

- Credentials are stored in the system's secure keychain
- No sensitive information is stored in plain text
- Authentication uses OAuth 2.0 device authorization flow
- No permissions (scopes) are requested by default
- Interactive scope selection allows you to choose exactly which permissions to grant
- Support for glob patterns to quickly select related scopes (e.g., `read:*`)
- Easy token removal via `logout` command when no longer needed

> [!IMPORTANT]
> For security best practices, always use `npx @auth0/auth0-mcp-server logout` when you're done with a session or switching between tenants. This ensures your authentication tokens are properly removed from the system keychain.

> [!CAUTION]
> Always review the permissions requested during the authentication process to ensure they align with your security requirements.

</br>

## 💬 Feedback and Contributing

We appreciate feedback and contributions to this project! Before you get started, please see:

- [Auth0's general contribution guidelines](https://github.com/auth0/open-source-template/blob/master/GENERAL-CONTRIBUTING.md)
- [Auth0's code of conduct guidelines](https://github.com/auth0/open-source-template/blob/master/CODE-OF-CONDUCT.md)

### Reporting Issues

To provide feedback or report a bug, please [raise an issue on our issue tracker](https://github.com/auth0/auth0-mcp-server/issues).

### Vulnerability Reporting

Please do not report security vulnerabilities on the public GitHub issue tracker. The [Responsible Disclosure Program](https://auth0.com/whitehat) details the procedure for disclosing security issues.

</br>

## 📄 License

This project is licensed under the MIT license. See the [LICENSE](LICENSE) file for more info.

## What is Auth0?

<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="https://cdn.auth0.com/website/auth0-logos/2023-branding/favicon/auth0-icon-ondark.svg" width="150" height="75">
    <source media="(prefers-color-scheme: light)" srcset="https://cdn.auth0.com/website/auth0-logos/2023-branding/favicon/auth0-icon-onlight.svg" width="150" height="75">
    <img alt="Auth0 Logo" src="https://cdn.auth0.com/website/sdks/logos/auth0_light_mode.png" width="150">
  </picture>
</p>
<p align="center">
  Auth0 is an easy to implement, adaptable authentication and authorization platform. To learn more checkout <a href="https://auth0.com/why-auth0">Why Auth0?</a>
</p>
