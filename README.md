# Auth0 MCP Server

A Model Context Protocol (MCP) server implementation for integrating Auth0 Management API with Claude Desktop.

## Quick Setup

### Prerequisites

- Node.js v18 or higher
- Git

### Installation

1. **run npx command**:

   ```bash
   npx @auth0/auth0-mcp-server init
   ```


 

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



## Feedback

### Contributing

We appreciate feedback and contribution to this repo! Before you get started, please see the following:

- [Auth0's general contribution guidelines](https://github.com/auth0/open-source-template/blob/master/GENERAL-CONTRIBUTING.md)
- [Auth0's code of conduct guidelines](https://github.com/auth0/open-source-template/blob/master/CODE-OF-CONDUCT.md)

### Raise an issue

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
<p align="center">
  Auth0 is an easy to implement, adaptable authentication and authorization platform. To learn more checkout <a href="https://auth0.com/why-auth0">Why Auth0?</a>
</p>
<p align="center">
  This project is licensed under the MIT license. See the <a href="https://github.com/auth0/node-auth0/blob/master/LICENSE"> LICENSE</a> file for more info.
</p>

