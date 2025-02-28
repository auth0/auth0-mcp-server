import fetch from 'node-fetch';

import {
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

// Define Auth0 Action interfaces
interface Auth0Action {
  id: string;
  name: string;
  supported_triggers: Auth0ActionTrigger[];
  code: string;
  dependencies: Auth0ActionDependency[];
  runtime: string;
  status: string;
  secrets: Auth0ActionSecret[];
  [key: string]: any;
}

interface Auth0ActionTrigger {
  id: string;
  version: string;
  [key: string]: any;
}

interface Auth0ActionDependency {
  name: string;
  version: string;
  [key: string]: any;
}

interface Auth0ActionSecret {
  name: string;
  value?: string;
  updated_at?: string;
  [key: string]: any;
}

interface Auth0PaginatedActionsResponse {
  actions: Auth0Action[];
  total?: number;
  page?: number;
  per_page?: number;
  [key: string]: any;
}

// Define all available action tools
export const ACTION_TOOLS: Tool[] = [
  {
    name: 'auth0_list_actions',
    description: 'List all actions in the Auth0 tenant',
    inputSchema: {
      type: 'object',
      properties: {
        page: { type: 'number', description: 'Page number (0-based)' },
        per_page: { type: 'number', description: 'Number of actions per page' },
        include_totals: { type: 'boolean', description: 'Include total count' },
        trigger_id: { type: 'string', description: 'Filter by trigger ID' },
      },
    },
  },
  {
    name: 'auth0_get_action',
    description: 'Get details about a specific Auth0 action',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'ID of the action to retrieve' },
      },
      required: ['id'],
    },
  },
  {
    name: 'auth0_create_action',
    description: 'Create a new Auth0 action',
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Name of the action' },
        trigger_id: { type: 'string', description: 'ID of the trigger (e.g., post-login)' },
        code: { type: 'string', description: 'JavaScript code for the action' },
        runtime: {
          type: 'string',
          description: 'Runtime for the action',
          enum: ['node12', 'node16', 'node18'],
        },
        dependencies: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              name: { type: 'string', description: 'Name of the dependency' },
              version: { type: 'string', description: 'Version of the dependency' },
            },
            required: ['name', 'version'],
          },
          description: 'NPM dependencies for the action',
        },
        secrets: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              name: { type: 'string', description: 'Name of the secret' },
              value: { type: 'string', description: 'Value of the secret' },
            },
            required: ['name', 'value'],
          },
          description: 'Secrets for the action',
        },
      },
      required: ['name', 'trigger_id', 'code'],
    },
  },
  {
    name: 'auth0_update_action',
    description: 'Update an existing Auth0 action',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'ID of the action to update' },
        name: { type: 'string', description: 'New name of the action' },
        code: { type: 'string', description: 'New JavaScript code for the action' },
        dependencies: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              name: { type: 'string', description: 'Name of the dependency' },
              version: { type: 'string', description: 'Version of the dependency' },
            },
            required: ['name', 'version'],
          },
          description: 'New NPM dependencies for the action',
        },
        secrets: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              name: { type: 'string', description: 'Name of the secret' },
              value: { type: 'string', description: 'Value of the secret' },
            },
            required: ['name'],
          },
          description: 'Secrets to update for the action',
        },
      },
      required: ['id'],
    },
  },
  {
    name: 'auth0_delete_action',
    description: 'Delete an Auth0 action',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'ID of the action to delete' },
      },
      required: ['id'],
    },
  },
  {
    name: 'auth0_deploy_action',
    description: 'Deploy an Auth0 action',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'ID of the action to deploy' },
      },
      required: ['id'],
    },
  },
];

// Define handlers for each action tool
export const ACTION_HANDLERS: Record<
  string,
  (request: HandlerRequest, config: HandlerConfig) => Promise<HandlerResponse>
> = {
  auth0_list_actions: async (
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

      // Build query parameters - Fix parameter names to match Auth0 API requirements
      const params = new URLSearchParams();

      // Check Auth0 API docs for correct parameter names
      if (request.parameters.page !== undefined) {
        params.append('page', request.parameters.page.toString());
      }

      if (request.parameters.per_page !== undefined) {
        params.append('per_page', request.parameters.per_page.toString());
      } else {
        // Default to 5 items per page
        params.append('per_page', '5');
      }

      // The parameter name should be include_totals, not include_total
      if (request.parameters.include_totals !== undefined) {
        params.append('include_totals', request.parameters.include_totals.toString());
      } else {
        // Default to include totals
        params.append('include_totals', 'true');
      }

      // The parameter name should be triggerId, not trigger_id
      if (request.parameters.trigger_id) {
        // This might be the issue - check Auth0 API docs for correct parameter name
        params.append('triggerId', request.parameters.trigger_id);
      }

      // Full URL for debugging
      const apiUrl = `https://${domain}/api/v2/actions/actions?${params.toString()}`;
      log(`Making API request to ${apiUrl}`);

      // Try a simpler request first to debug
      const simpleApiUrl = `https://${domain}/api/v2/actions/actions`;
      log(`Making simplified API request to ${simpleApiUrl}`);

      try {
        // Make API request to Auth0 Management API with timeout
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 15000);

        // Try with a simpler request first
        const response = await fetch(simpleApiUrl, {
          headers: {
            Authorization: `Bearer ${request.token}`,
            'Content-Type': 'application/json',
            Accept: 'application/json',
          },
          signal: controller.signal,
        });

        clearTimeout(timeoutId);

        if (!response.ok) {
          const errorText = await response.text();
          log(`API request failed with status ${response.status}: ${errorText}`);

          let errorMessage = `Failed to list actions: ${response.status} ${response.statusText}`;

          if (response.status === 401) {
            errorMessage +=
              '\nError: Unauthorized. Your token might be expired or invalid or missing read:actions scope.';
          } else if (response.status === 400) {
            // Log more details about the 400 error
            errorMessage += `\nError: Bad Request. Details: ${errorText}`;
            log('Request URL was:', simpleApiUrl);
            log('Request headers:', {
              Authorization: 'Bearer [token redacted]',
              'Content-Type': 'application/json',
              Accept: 'application/json',
            });
          }

          return createErrorResponse(errorMessage);
        }

        // Parse the response
        const responseData = (await response.json()) as unknown;
        log('Response data:', JSON.stringify(responseData).substring(0, 200) + '...');

        // Handle different response formats
        let actions: Auth0Action[] = [];
        let total = 0;
        let page = 0;
        let perPage = 5;

        if (Array.isArray(responseData)) {
          // Simple array response
          actions = responseData as Auth0Action[];
          total = actions.length;
        } else if (typeof responseData === 'object' && responseData !== null) {
          // Check if it has an 'actions' property that is an array
          if ('actions' in responseData && Array.isArray((responseData as any).actions)) {
            actions = (responseData as any).actions;
            total = (responseData as any).total || actions.length;
            page = (responseData as any).page || 0;
            perPage = (responseData as any).per_page || actions.length;
          } else {
            // Log the actual structure to help debug
            log('Response structure:', Object.keys(responseData));
            return createErrorResponse(
              'Error: Unexpected response format from Auth0 API. Missing actions array.'
            );
          }
        } else {
          log('Invalid response format:', responseData);
          return createErrorResponse('Error: Received invalid response format from Auth0 API.');
        }

        if (actions.length === 0) {
          return {
            toolResult: {
              content: [
                {
                  type: 'text',
                  text: 'No actions found in your Auth0 tenant.',
                },
              ],
              isError: false,
            },
          };
        }

        // Format actions in a readable way
        let resultText = `### Auth0 Actions (${actions.length}${total > actions.length ? ' of ' + total : ''})\n\n`;
        resultText += '| Name | Trigger | Status | Runtime |\n';
        resultText += '|------|---------|--------|--------|\n';

        actions.forEach(action => {
          const name = action.name || 'Unnamed Action';
          const trigger =
            action.supported_triggers && action.supported_triggers.length > 0
              ? action.supported_triggers[0].id
              : '-';
          const status = action.status || '-';
          const runtime = action.runtime || '-';

          resultText += `| ${name} | ${trigger} | ${status} | ${runtime} |\n`;
        });

        // Add pagination info if there are more actions
        if (actions.length < total) {
          const totalPages = Math.ceil(total / perPage);
          const nextPage = page + 1 < totalPages ? page + 1 : 0;

          resultText += `\n*Page ${page + 1} of ${totalPages} (${perPage} items per page, ${total} total)*\n`;

          if (nextPage > 0) {
            resultText += `\nTo see more results, use: \`auth0_list_actions(page=${nextPage})\`\n`;
          }
        }

        // Add note about viewing details
        if (actions.length > 0) {
          resultText += `\nTo view details of a specific action, use: \`auth0_get_action(id="action_id")\`\n`;
        }

        if (actions.length > 0) {
          resultText += '\n### Action IDs for Reference\n\n';
          actions.forEach(action => {
            resultText += `- **${action.name}**: \`${action.id}\`\n`;
          });
        }

        log(`Successfully retrieved ${actions.length} actions`);

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
        log('Fetch error:', fetchError);
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
  auth0_get_action: async (
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

      // API URL for getting an action
      const apiUrl = `https://${domain}/api/v2/actions/actions/${id}`;
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

          let errorMessage = `Failed to get action: ${response.status} ${response.statusText}`;

          if (response.status === 404) {
            errorMessage = `Action with id '${id}' not found.`;
          } else if (response.status === 401) {
            errorMessage +=
              '\nError: Unauthorized. Your token might be expired or invalid or missing read:actions scope.';
          }

          return createErrorResponse(errorMessage);
        }

        // Parse the response
        const action = (await response.json()) as Auth0Action;

        // Format action details in markdown
        let resultText = `### Action: ${action.name}\n\n`;
        resultText += `- **ID**: ${action.id}\n`;
        resultText += `- **Trigger**: ${action.supported_triggers?.[0]?.id || 'Not specified'}\n`;
        resultText += `- **Status**: ${action.status || 'Unknown'}\n`;
        resultText += `- **Runtime**: ${action.runtime || 'Unknown'}\n\n`;

        if (action.dependencies && action.dependencies.length) {
          resultText += `#### Dependencies (${action.dependencies.length})\n\n`;
          resultText += '| Package | Version |\n';
          resultText += '|---------|--------|\n';

          action.dependencies.forEach(dep => {
            resultText += `| ${dep.name} | ${dep.version} |\n`;
          });
          resultText += '\n';
        }

        if (action.secrets && action.secrets.length) {
          resultText += `#### Secrets (${action.secrets.length})\n\n`;
          resultText += '| Name | Updated |\n';
          resultText += '|------|--------|\n';

          action.secrets.forEach(secret => {
            resultText += `| ${secret.name} | ${secret.updated_at || 'Unknown'} |\n`;
          });
          resultText += '\n';
        }

        resultText += `#### Code\n\n\`\`\`javascript\n${action.code || 'No code available'}\n\`\`\`\n`;

        log(`Successfully retrieved action: ${action.name} (${action.id})`);

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
  auth0_create_action: async (
    request: HandlerRequest,
    config: HandlerConfig
  ): Promise<HandlerResponse> => {
    try {
      if (!config.domain) {
        return createErrorResponse('Error: AUTH0_DOMAIN environment variable is not set');
      }

      const {
        name,
        trigger_id,
        code,
        runtime = 'node18',
        dependencies = [],
        secrets = [],
      } = request.parameters;

      if (!name) {
        return createErrorResponse('Error: name is required');
      }

      if (!trigger_id) {
        return createErrorResponse('Error: trigger_id is required');
      }

      if (!code) {
        return createErrorResponse('Error: code is required');
      }

      // Ensure domain is properly formatted
      const domain = formatDomain(config.domain);

      // API URL for creating an action
      const apiUrl = `https://${domain}/api/v2/actions/actions`;
      log(`Making API request to ${apiUrl}`);

      // Prepare request body
      const requestBody = {
        name,
        supported_triggers: [
          {
            id: trigger_id,
            version: 'v2', // Default to v2 for most triggers
          },
        ],
        code,
        runtime,
        dependencies,
        secrets,
      };

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

          let errorMessage = `Failed to create action: ${response.status} ${response.statusText}`;

          if (response.status === 401) {
            errorMessage +=
              '\nError: Unauthorized. Your token might be expired or invalid or missing create:actions scope.';
          } else if (response.status === 422) {
            errorMessage +=
              '\nError: Validation errors in your request. Check that your parameters are valid.';
          }

          return createErrorResponse(errorMessage);
        }

        // Parse the response
        const newAction = (await response.json()) as Auth0Action;

        // Format action details in markdown
        let resultText = `### Action Created Successfully\n\n`;
        resultText += `- **Name**: ${newAction.name}\n`;
        resultText += `- **ID**: ${newAction.id}\n`;
        resultText += `- **Trigger**: ${newAction.supported_triggers?.[0]?.id || 'Not specified'}\n`;
        resultText += `- **Status**: ${newAction.status || 'Draft'}\n`;
        resultText += `- **Runtime**: ${newAction.runtime}\n\n`;

        if (newAction.dependencies && newAction.dependencies.length) {
          resultText += `#### Dependencies (${newAction.dependencies.length})\n\n`;
          resultText += '| Package | Version |\n';
          resultText += '|---------|--------|\n';

          newAction.dependencies.forEach(dep => {
            resultText += `| ${dep.name} | ${dep.version} |\n`;
          });
          resultText += '\n';
        }

        if (newAction.secrets && newAction.secrets.length) {
          resultText += `#### Secrets (${newAction.secrets.length})\n\n`;
          resultText += '| Name |\n';
          resultText += '|------|\n';

          newAction.secrets.forEach(secret => {
            resultText += `| ${secret.name} |\n`;
          });
          resultText += '\n';
        }

        resultText += `⚠️ **Note**: The action has been created but not deployed. Use \`auth0_deploy_action(id="${newAction.id}")\` to deploy it.\n\n`;

        log(`Successfully created action: ${newAction.name} (${newAction.id})`);

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
  auth0_update_action: async (
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
      const { name, code, dependencies, secrets } = request.parameters;

      // Prepare update body, only including fields that are present
      const updateBody: Record<string, any> = {};
      if (name !== undefined) updateBody.name = name;
      if (code !== undefined) updateBody.code = code;
      if (dependencies !== undefined) updateBody.dependencies = dependencies;

      // Ensure domain is properly formatted
      const domain = formatDomain(config.domain);

      // API URL for updating an action
      const apiUrl = `https://${domain}/api/v2/actions/actions/${id}`;
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

          let errorMessage = `Failed to update action: ${response.status} ${response.statusText}`;

          if (response.status === 404) {
            errorMessage = `Action with id '${id}' not found.`;
          } else if (response.status === 401) {
            errorMessage +=
              '\nError: Unauthorized. Your token might be expired or invalid or missing update:actions scope.';
          } else if (response.status === 422) {
            errorMessage +=
              '\nError: Validation errors in your request. Check that your parameters are valid.';
          }

          return createErrorResponse(errorMessage);
        }

        // Parse the response
        const updatedAction = (await response.json()) as Auth0Action;

        // Handle secrets separately if provided (they need to be updated one by one)
        let secretsUpdated = false;
        if (secrets && secrets.length > 0) {
          secretsUpdated = true;
          for (const secret of secrets) {
            const secretUrl = `https://${domain}/api/v2/actions/actions/${id}/secrets`;

            const secretResponse = await fetch(secretUrl, {
              method: 'PATCH',
              headers: {
                Authorization: `Bearer ${request.token}`,
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                secrets: [secret],
              }),
            });

            if (!secretResponse.ok) {
              log(`Failed to update secret ${secret.name}: ${secretResponse.status}`);
            }
          }
        }

        // Format action details in markdown
        let resultText = `### Action Updated Successfully\n\n`;
        resultText += `- **Name**: ${updatedAction.name}\n`;
        resultText += `- **ID**: ${updatedAction.id}\n`;
        resultText += `- **Trigger**: ${updatedAction.supported_triggers?.[0]?.id || 'Not specified'}\n`;
        resultText += `- **Status**: ${updatedAction.status || 'Draft'}\n`;
        resultText += `- **Runtime**: ${updatedAction.runtime}\n\n`;

        if (updatedAction.dependencies && updatedAction.dependencies.length) {
          resultText += `#### Dependencies (${updatedAction.dependencies.length})\n\n`;
          resultText += '| Package | Version |\n';
          resultText += '|---------|--------|\n';

          updatedAction.dependencies.forEach(dep => {
            resultText += `| ${dep.name} | ${dep.version} |\n`;
          });
          resultText += '\n';
        }

        if (secretsUpdated) {
          resultText += `✅ Secrets were also updated.\n\n`;
        }

        resultText += `⚠️ **Note**: The action has been updated but changes are not deployed. Use \`auth0_deploy_action(id="${updatedAction.id}")\` to deploy the changes.\n\n`;

        log(`Successfully updated action: ${updatedAction.name} (${updatedAction.id})`);

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
  auth0_delete_action: async (
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

      // API URL for deleting an action
      const apiUrl = `https://${domain}/api/v2/actions/actions/${id}`;
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

          let errorMessage = `Failed to delete action: ${response.status} ${response.statusText}`;

          if (response.status === 404) {
            errorMessage = `Action with id '${id}' not found.`;
          } else if (response.status === 401) {
            errorMessage +=
              '\nError: Unauthorized. Your token might be expired or invalid or missing delete:actions scope.';
          } else if (response.status === 409) {
            errorMessage +=
              '\nError: Cannot delete an action that is currently bound to a trigger.';
          }

          return createErrorResponse(errorMessage);
        }

        // Delete operations typically return 204 No Content
        let resultText = `### Action Deleted Successfully\n\n`;
        resultText += `Action with id '${id}' has been deleted.`;

        log(`Successfully deleted action with id: ${id}`);

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
  auth0_deploy_action: async (
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

      // API URL for deploying an action
      const apiUrl = `https://${domain}/api/v2/actions/actions/${id}/deploy`;
      log(`Making API request to ${apiUrl}`);

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
          signal: controller.signal,
        });

        clearTimeout(timeoutId);

        if (!response.ok) {
          const errorText = await response.text();
          log(`API request failed with status ${response.status}: ${errorText}`);

          let errorMessage = `Failed to deploy action: ${response.status} ${response.statusText}`;

          if (response.status === 404) {
            errorMessage = `Action with id '${id}' not found.`;
          } else if (response.status === 401) {
            errorMessage +=
              '\nError: Unauthorized. Your token might be expired or invalid or missing update:actions scope.';
          } else if (response.status === 422) {
            errorMessage += '\nError: The action has validation errors and cannot be deployed.';
          }

          return createErrorResponse(errorMessage);
        }

        // Parse the response (deployment returns the updated action)
        const deployedAction = (await response.json()) as Auth0Action;

        // Format action details in markdown
        let resultText = `### Action Deployed Successfully\n\n`;
        resultText += `- **Name**: ${deployedAction.name}\n`;
        resultText += `- **ID**: ${deployedAction.id}\n`;
        resultText += `- **Trigger**: ${deployedAction.supported_triggers?.[0]?.id || 'Not specified'}\n`;
        resultText += `- **Status**: ${deployedAction.status || 'Unknown'}\n`;
        resultText += `- **Version**: ${deployedAction.version || 'Unknown'}\n`;
        resultText += `- **Runtime**: ${deployedAction.runtime}\n\n`;

        log(`Successfully deployed action: ${deployedAction.name} (${deployedAction.id})`);

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
