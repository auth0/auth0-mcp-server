import fetch from 'node-fetch';

import {
  Auth0PaginatedResponse,
  Auth0ResourceServer,
  createErrorResponse,
  formatDomain,
  handleNetworkError,
  HandlerConfig,
  HandlerRequest,
  HandlerResponse,
  httpLog,
  log,
  Tool,
} from './tools-common.js';

// Define all available resource server tools
export const RESOURCE_SERVER_TOOLS: Tool[] = [
  {
    name: 'auth0_list_resource_servers',
    description: 'List all resource servers (APIs) in the Auth0 tenant',
    inputSchema: {
      type: 'object',
      properties: {
        page: { type: 'number', description: 'Page number (0-based)' },
        per_page: { type: 'number', description: 'Number of resource servers per page' },
        include_totals: { type: 'boolean', description: 'Include total count' },
      },
    },
  },
  {
    name: 'auth0_get_resource_server',
    description: 'Get details about a specific Auth0 resource server',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'ID of the resource server to retrieve' },
      },
      required: ['id'],
    },
  },
  {
    name: 'auth0_create_resource_server',
    description: 'Create a new Auth0 resource server (API)',
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Name of the resource server' },
        identifier: {
          type: 'string',
          description: 'Unique identifier for the API (usually a URL)',
        },
        scopes: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              value: { type: 'string', description: 'The scope value (e.g., read:users)' },
              description: { type: 'string', description: 'Description of what the scope allows' },
            },
            required: ['value'],
          },
          description: 'Array of scopes that define the permissions for the API',
        },
        signing_alg: {
          type: 'string',
          description: 'Algorithm used to sign tokens',
          enum: ['HS256', 'RS256'],
        },
        token_lifetime: {
          type: 'number',
          description: 'Token lifetime in seconds',
        },
        allow_offline_access: {
          type: 'boolean',
          description: 'Whether to allow offline access (refresh tokens)',
        },
      },
      required: ['name', 'identifier'],
    },
  },
  {
    name: 'auth0_update_resource_server',
    description: 'Update an existing Auth0 resource server',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'ID of the resource server to update' },
        name: { type: 'string', description: 'New name of the resource server' },
        scopes: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              value: { type: 'string', description: 'The scope value (e.g., read:users)' },
              description: { type: 'string', description: 'Description of what the scope allows' },
            },
            required: ['value'],
          },
          description: 'Array of scopes that define the permissions for the API',
        },
        token_lifetime: {
          type: 'number',
          description: 'Token lifetime in seconds',
        },
        allow_offline_access: {
          type: 'boolean',
          description: 'Whether to allow offline access (refresh tokens)',
        },
      },
      required: ['id'],
    },
  },
  {
    name: 'auth0_delete_resource_server',
    description: 'Delete an Auth0 resource server',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'ID of the resource server to delete' },
      },
      required: ['id'],
    },
  },
];

// Define handlers for each resource server tool
export const RESOURCE_SERVER_HANDLERS: Record<
  string,
  (request: HandlerRequest, config: HandlerConfig) => Promise<HandlerResponse>
> = {
  auth0_list_resource_servers: async (
    request: HandlerRequest,
    config: HandlerConfig
  ): Promise<HandlerResponse> => {
    try {
      if (!config.domain) {
        log('Error: AUTH0_DOMAIN environment variable is not set');
        return createErrorResponse('Error: AUTH0_DOMAIN environment variable is not set');
      }

      // Ensure domain is properly formatted
      const domain = formatDomain(config.domain);

      // Log token info without exposing the full token
      const tokenLength = request.token ? request.token.length : 0;
      log(`Token information - Length: ${tokenLength}`);
      if (tokenLength > 0) {
        log(
          `Token preview: ${request.token.substring(0, 5)}...${request.token.substring(tokenLength - 5)}`
        );
      } else {
        log('Warning: Token is empty or undefined');
      }

      // Build query parameters
      const params = new URLSearchParams();
      if (request.parameters.page !== undefined) {
        params.append('page', request.parameters.page.toString());
      }
      if (request.parameters.per_page !== undefined) {
        params.append('per_page', request.parameters.per_page.toString());
      } else {
        // Default to 5 items per page if not specified
        params.append('per_page', '5');
      }
      if (request.parameters.include_totals !== undefined) {
        params.append('include_totals', request.parameters.include_totals.toString());
      } else {
        // Default to include totals
        params.append('include_totals', 'true');
      }

      // Full URL for debugging
      const apiUrl = `https://${domain}/api/v2/resource-servers?${params.toString()}`;
      log(`Making API request to ${apiUrl}`);

      try {
        // Make API request to Auth0 Management API with timeout
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 15000);

        // Log headers (without sensitive info)
        httpLog(
          `Request headers: ${JSON.stringify({
            'Content-Type': 'application/json',
            Authorization: 'Bearer [TOKEN_REDACTED]',
          })}`
        );

        // Detailed fetch implementation with more logging
        httpLog(`Starting network request to ${apiUrl}`);
        const startTime = Date.now();

        const response = await fetch(apiUrl, {
          headers: {
            Authorization: `Bearer ${request.token}`,
            'Content-Type': 'application/json',
            Accept: 'application/json',
          },
          signal: controller.signal,
        });

        const elapsed = Date.now() - startTime;
        httpLog(`Request completed in ${elapsed}ms with status ${response.status}`);

        clearTimeout(timeoutId);

        if (!response.ok) {
          const errorText = await response.text();
          log(`API request failed with status ${response.status}: ${errorText}`);

          let errorMessage = `Failed to list resource servers: ${response.status} ${response.statusText}`;

          // Add more context based on common error codes
          if (response.status === 401) {
            errorMessage +=
              '\nError: Unauthorized. Your token might be expired or invalid. Try running "auth0 login" to refresh your token.';
          } else if (response.status === 403) {
            errorMessage +=
              '\nError: Forbidden. Your token might not have the required scopes (read:resource_servers). Try running "auth0 login --scopes read:resource_servers" to get the proper permissions.';
          } else if (response.status === 429) {
            errorMessage +=
              '\nError: Rate limited. You have made too many requests to the Auth0 API. Please try again later.';
          } else if (response.status >= 500) {
            errorMessage +=
              '\nError: Auth0 server error. The Auth0 API might be experiencing issues. Please try again later.';
          }

          return createErrorResponse(errorMessage);
        }

        // Parse the response
        httpLog('Parsing response body');
        const parseStartTime = Date.now();
        const responseData = (await response.json()) as Auth0PaginatedResponse;
        const parseElapsed = Date.now() - parseStartTime;
        httpLog(`Response parsed in ${parseElapsed}ms`);

        if (!responseData.resource_servers || !Array.isArray(responseData.resource_servers)) {
          log('Invalid response format - missing resource_servers array');
          log('Response data:', responseData);

          return createErrorResponse(
            'Error: Received invalid response format from Auth0 API. The "resource_servers" array is missing or invalid.'
          );
        }

        // Format resource servers list
        const resourceServers = responseData.resource_servers.map(server => ({
          id: server.id,
          name: server.name,
          identifier: server.identifier,
          scopes: server.scopes?.length || 0,
        }));

        // Get pagination info
        const total = responseData.total || resourceServers.length;
        const page = responseData.page !== undefined ? responseData.page : 0;
        const perPage = responseData.per_page || resourceServers.length;
        const totalPages = Math.ceil(total / perPage);
        const nextPage = page + 1 < totalPages ? page + 1 : 0;

        log(
          `Successfully retrieved ${resourceServers.length} resource servers (page ${page + 1} of ${totalPages}, total: ${total})`
        );

        // Create table format
        let resultText = `### Auth0 Resource Servers (${resourceServers.length}/${total})\n\n`;
        resultText += '| Name | Identifier | Scopes |\n';
        resultText += '|------|------------|--------|\n';

        resourceServers.forEach(server => {
          resultText += `| ${server.name} | ${server.identifier} | ${server.scopes} |\n`;
        });

        // Add pagination info
        if (totalPages > 1) {
          resultText += `\n*Page ${page + 1} of ${totalPages} (${perPage} items per page)*`;
          resultText +=
            '\n\nTo see more results, use: `auth0_list_resource_servers(page=${nextPage})`';
        }

        if (resourceServers.length > 0) {
          resultText += '\n### Resource Server IDs for Reference\n\n';
          resourceServers.forEach(rs => {
            resultText += `- **${rs.name}**: \`${rs.id}\`\n`;
          });
        }

        return {
          toolResult: {
            content: [
              {
                type: 'text',
                text: resultText,
              },
            ],
            isError: false,
          },
        };
      } catch (fetchError: any) {
        // Handle network-specific errors
        httpLog(`Network error: ${fetchError.message || fetchError}`);
        httpLog('Error details:', fetchError);

        const errorMessage = handleNetworkError(fetchError);

        return createErrorResponse(errorMessage);
      }
    } catch (error: any) {
      // Handle any other errors
      log('Error processing request:', error);

      return createErrorResponse(
        `Error: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  },
  auth0_get_resource_server: async (
    request: HandlerRequest,
    config: HandlerConfig
  ): Promise<HandlerResponse> => {
    try {
      if (!config.domain) {
        return createErrorResponse('Error: AUTH0_DOMAIN environment variable is not set');
      }

      const id = request.parameters.id;
      if (!id) {
        return createErrorResponse('Error: id is required');
      }

      // Ensure domain is properly formatted
      const domain = formatDomain(config.domain);

      // API URL for getting a resource server
      const apiUrl = `https://${domain}/api/v2/resource-servers/${id}`;
      log(`Making API request to ${apiUrl}`);

      try {
        // Make API request to Auth0 Management API
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 15000);

        const response = await fetch(apiUrl, {
          headers: {
            Authorization: `Bearer ${request.token}`,
            'Content-Type': 'application/json',
          },
          signal: controller.signal,
        });

        clearTimeout(timeoutId);

        if (!response.ok) {
          const errorText = await response.text();
          log(`API request failed with status ${response.status}: ${errorText}`);

          let errorMessage = `Failed to get resource server: ${response.status} ${response.statusText}`;

          if (response.status === 404) {
            errorMessage = `Resource server with id '${id}' not found.`;
          } else if (response.status === 401) {
            errorMessage +=
              '\nError: Unauthorized. Your token might be expired or invalid or missing read:resource_servers scope.';
          }

          return createErrorResponse(errorMessage);
        }

        // Parse the response
        const resourceServer = (await response.json()) as Auth0ResourceServer;

        // Format resource server details in markdown
        let resultText = `### Resource Server: ${resourceServer.name}\n\n`;
        resultText += `- **ID**: ${resourceServer.id}\n`;
        resultText += `- **Identifier**: ${resourceServer.identifier}\n`;
        resultText += `- **Signing Algorithm**: ${resourceServer.signing_alg || 'Not specified'}\n`;
        resultText += `- **Token Lifetime**: ${resourceServer.token_lifetime || 'Default'} seconds\n`;
        resultText += `- **Allow Offline Access**: ${resourceServer.allow_offline_access ? 'Yes' : 'No'}\n\n`;

        if (resourceServer.scopes && resourceServer.scopes.length) {
          resultText += `#### Scopes (${resourceServer.scopes.length})\n\n`;
          resultText += '| Scope | Description |\n';
          resultText += '|-------|-------------|\n';

          resourceServer.scopes.forEach((scope: any) => {
            resultText += `| \`${scope.value}\` | ${scope.description || '-'} |\n`;
          });
          resultText += '\n';
        } else {
          resultText += '#### Scopes\n\nNo scopes defined for this resource server.\n\n';
        }

        log(
          `Successfully retrieved resource server: ${resourceServer.name} (${resourceServer.id})`
        );

        return {
          toolResult: {
            content: [
              {
                type: 'text',
                text: resultText,
              },
            ],
            isError: false,
          },
        };
      } catch (fetchError: any) {
        // Handle network-specific errors
        const errorMessage = handleNetworkError(fetchError);

        return createErrorResponse(errorMessage);
      }
    } catch (error: any) {
      // Handle any other errors
      log('Error processing request:', error);

      return createErrorResponse(
        `Error: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  },
  auth0_create_resource_server: async (
    request: HandlerRequest,
    config: HandlerConfig
  ): Promise<HandlerResponse> => {
    try {
      if (!config.domain) {
        return createErrorResponse('Error: AUTH0_DOMAIN environment variable is not set');
      }

      const { name, identifier, scopes, signing_alg, token_lifetime, allow_offline_access } =
        request.parameters;

      if (!name) {
        return createErrorResponse('Error: name is required');
      }

      if (!identifier) {
        return createErrorResponse('Error: identifier is required');
      }

      // Ensure domain is properly formatted
      const domain = formatDomain(config.domain);

      // API URL for creating a resource server
      const apiUrl = `https://${domain}/api/v2/resource-servers`;
      log(`Making API request to ${apiUrl}`);

      // Prepare request body
      const requestBody: Record<string, any> = {
        name,
        identifier,
      };

      // Add optional fields if provided
      if (scopes !== undefined) requestBody.scopes = scopes;
      if (signing_alg !== undefined) requestBody.signing_alg = signing_alg;
      if (token_lifetime !== undefined) requestBody.token_lifetime = token_lifetime;
      if (allow_offline_access !== undefined)
        requestBody.allow_offline_access = allow_offline_access;

      try {
        // Make API request to Auth0 Management API
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 15000);

        const response = await fetch(apiUrl, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${request.token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(requestBody),
          signal: controller.signal,
        });

        clearTimeout(timeoutId);

        if (!response.ok) {
          const errorText = await response.text();
          log(`API request failed with status ${response.status}: ${errorText}`);

          let errorMessage = `Failed to create resource server: ${response.status} ${response.statusText}`;

          if (response.status === 401) {
            errorMessage +=
              '\nError: Unauthorized. Your token might be expired or invalid or missing create:resource_servers scope.';
          } else if (response.status === 422) {
            errorMessage +=
              '\nError: Validation errors in your request. Check that your parameters are valid.';
          } else if (response.status === 409) {
            errorMessage += '\nError: A resource server with this identifier already exists.';
          }

          return createErrorResponse(errorMessage);
        }

        // Parse the response
        const newResourceServer = (await response.json()) as Auth0ResourceServer;

        // Format resource server details in markdown
        let resultText = `### Resource Server Created Successfully\n\n`;
        resultText += `- **Name**: ${newResourceServer.name}\n`;
        resultText += `- **ID**: ${newResourceServer.id}\n`;
        resultText += `- **Identifier**: ${newResourceServer.identifier}\n`;

        if (newResourceServer.signing_alg) {
          resultText += `- **Signing Algorithm**: ${newResourceServer.signing_alg}\n`;
        }

        if (newResourceServer.token_lifetime) {
          resultText += `- **Token Lifetime**: ${newResourceServer.token_lifetime} seconds\n`;
        }

        resultText += `- **Allow Offline Access**: ${newResourceServer.allow_offline_access ? 'Yes' : 'No'}\n\n`;

        if (newResourceServer.scopes && newResourceServer.scopes.length) {
          resultText += `#### Scopes (${newResourceServer.scopes.length})\n\n`;
          resultText += '| Scope | Description |\n';
          resultText += '|-------|-------------|\n';

          newResourceServer.scopes.forEach((scope: any) => {
            resultText += `| \`${scope.value}\` | ${scope.description || '-'} |\n`;
          });
          resultText += '\n';
        }

        log(
          `Successfully created resource server: ${newResourceServer.name} (${newResourceServer.id})`
        );

        return {
          toolResult: {
            content: [
              {
                type: 'text',
                text: resultText,
              },
            ],
            isError: false,
          },
        };
      } catch (fetchError: any) {
        // Handle network-specific errors
        const errorMessage = handleNetworkError(fetchError);

        return createErrorResponse(errorMessage);
      }
    } catch (error: any) {
      // Handle any other errors
      log('Error processing request:', error);

      return createErrorResponse(
        `Error: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  },
  auth0_update_resource_server: async (
    request: HandlerRequest,
    config: HandlerConfig
  ): Promise<HandlerResponse> => {
    try {
      if (!config.domain) {
        return createErrorResponse('Error: AUTH0_DOMAIN environment variable is not set');
      }

      const id = request.parameters.id;
      if (!id) {
        return createErrorResponse('Error: id is required');
      }

      // Extract other parameters to update
      const { name, scopes, token_lifetime, allow_offline_access } = request.parameters;

      // Prepare update body, only including fields that are present
      const updateBody: Record<string, any> = {};
      if (name !== undefined) updateBody.name = name;
      if (scopes !== undefined) updateBody.scopes = scopes;
      if (token_lifetime !== undefined) updateBody.token_lifetime = token_lifetime;
      if (allow_offline_access !== undefined)
        updateBody.allow_offline_access = allow_offline_access;

      // Ensure domain is properly formatted
      const domain = formatDomain(config.domain);

      // API URL for updating a resource server
      const apiUrl = `https://${domain}/api/v2/resource-servers/${id}`;
      log(`Making API request to ${apiUrl}`);

      try {
        // Make API request to Auth0 Management API
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 15000);

        const response = await fetch(apiUrl, {
          method: 'PATCH',
          headers: {
            Authorization: `Bearer ${request.token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(updateBody),
          signal: controller.signal,
        });

        clearTimeout(timeoutId);

        if (!response.ok) {
          const errorText = await response.text();
          log(`API request failed with status ${response.status}: ${errorText}`);

          let errorMessage = `Failed to update resource server: ${response.status} ${response.statusText}`;

          if (response.status === 404) {
            errorMessage = `Resource server with id '${id}' not found.`;
          } else if (response.status === 401) {
            errorMessage +=
              '\nError: Unauthorized. Your token might be expired or invalid or missing update:resource_servers scope.';
          } else if (response.status === 422) {
            errorMessage +=
              '\nError: Validation errors in your request. Check that your parameters are valid.';
          }

          return createErrorResponse(errorMessage);
        }

        // Parse the response
        const updatedResourceServer = (await response.json()) as Auth0ResourceServer;

        // Format resource server details in markdown
        let resultText = `### Resource Server Updated Successfully\n\n`;
        resultText += `- **Name**: ${updatedResourceServer.name}\n`;
        resultText += `- **ID**: ${updatedResourceServer.id}\n`;
        resultText += `- **Identifier**: ${updatedResourceServer.identifier}\n`;

        if (updatedResourceServer.signing_alg) {
          resultText += `- **Signing Algorithm**: ${updatedResourceServer.signing_alg}\n`;
        }

        if (updatedResourceServer.token_lifetime) {
          resultText += `- **Token Lifetime**: ${updatedResourceServer.token_lifetime} seconds\n`;
        }

        resultText += `- **Allow Offline Access**: ${updatedResourceServer.allow_offline_access ? 'Yes' : 'No'}\n\n`;

        if (updatedResourceServer.scopes && updatedResourceServer.scopes.length) {
          resultText += `#### Scopes (${updatedResourceServer.scopes.length})\n\n`;
          resultText += '| Scope | Description |\n';
          resultText += '|-------|-------------|\n';

          updatedResourceServer.scopes.forEach((scope: any) => {
            resultText += `| \`${scope.value}\` | ${scope.description || '-'} |\n`;
          });
          resultText += '\n';
        } else {
          resultText += '#### Scopes\n\nNo scopes defined for this resource server.\n\n';
        }

        log(
          `Successfully updated resource server: ${updatedResourceServer.name} (${updatedResourceServer.id})`
        );

        return {
          toolResult: {
            content: [
              {
                type: 'text',
                text: resultText,
              },
            ],
            isError: false,
          },
        };
      } catch (fetchError: any) {
        // Handle network-specific errors
        const errorMessage = handleNetworkError(fetchError);

        return createErrorResponse(errorMessage);
      }
    } catch (error: any) {
      // Handle any other errors
      log('Error processing request:', error);

      return createErrorResponse(
        `Error: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  },
  auth0_delete_resource_server: async (
    request: HandlerRequest,
    config: HandlerConfig
  ): Promise<HandlerResponse> => {
    try {
      if (!config.domain) {
        return createErrorResponse('Error: AUTH0_DOMAIN environment variable is not set');
      }

      const id = request.parameters.id;
      if (!id) {
        return createErrorResponse('Error: id is required');
      }

      // Ensure domain is properly formatted
      const domain = formatDomain(config.domain);

      // API URL for deleting a resource server
      const apiUrl = `https://${domain}/api/v2/resource-servers/${id}`;
      log(`Making API request to ${apiUrl}`);

      try {
        // Make API request to Auth0 Management API
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 15000);

        const response = await fetch(apiUrl, {
          method: 'DELETE',
          headers: {
            Authorization: `Bearer ${request.token}`,
            'Content-Type': 'application/json',
          },
          signal: controller.signal,
        });

        clearTimeout(timeoutId);

        if (!response.ok) {
          const errorText = await response.text();
          log(`API request failed with status ${response.status}: ${errorText}`);

          let errorMessage = `Failed to delete resource server: ${response.status} ${response.statusText}`;

          if (response.status === 404) {
            errorMessage = `Resource server with id '${id}' not found.`;
          } else if (response.status === 401) {
            errorMessage +=
              '\nError: Unauthorized. Your token might be expired or invalid or missing delete:resource_servers scope.';
          } else if (response.status === 403) {
            errorMessage +=
              '\nError: Forbidden. You cannot delete the Auth0 Management API resource server.';
          }

          return createErrorResponse(errorMessage);
        }

        // Delete operations typically return 204 No Content
        let resultText = `### Resource Server Deleted Successfully\n\n`;
        resultText += `Resource server with id '${id}' has been deleted.`;

        log(`Successfully deleted resource server with id: ${id}`);

        return {
          toolResult: {
            content: [
              {
                type: 'text',
                text: resultText,
              },
            ],
            isError: false,
          },
        };
      } catch (fetchError: any) {
        // Handle network-specific errors
        const errorMessage = handleNetworkError(fetchError);

        return createErrorResponse(errorMessage);
      }
    } catch (error: any) {
      // Handle any other errors
      log('Error processing request:', error);

      return createErrorResponse(
        `Error: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  },
};
