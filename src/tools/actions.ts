import fetch from 'node-fetch';

import { HandlerConfig, HandlerRequest, HandlerResponse, Tool } from '../utils/types.js';
import { log } from '../utils/logger.js';
import {
  createErrorResponse,
  createSuccessResponse,
  formatDomain,
  handleNetworkError,
} from '../utils/http-utility.js';

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
      const apiUrl = `https://${config.domain}/api/v2/actions/actions?${params.toString()}`;
      log(`Making API request to ${apiUrl}`);

      // Try a simpler request first to debug
      const simpleApiUrl = `https://${config.domain}/api/v2/actions/actions`;
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
          return createSuccessResponse({
            message: 'No actions found in your Auth0 tenant.',
            actions: [],
          });
        }

        // Create a result object with all the necessary information
        const result = {
          actions: actions,
          count: actions.length,
          total: total,
          pagination: {
            page: page,
            per_page: perPage,
            total_pages: Math.ceil(total / perPage),
            has_next: page + 1 < Math.ceil(total / perPage),
          },
        };

        log(`Successfully retrieved ${actions.length} actions`);

        return createSuccessResponse(result);
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
      const id = request.parameters.id;
      if (!id) {
        return createErrorResponse('Error: id is required');
      }

      // API URL for getting an action
      const apiUrl = `https://${config.domain}/api/v2/actions/actions/${id}`;
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

        log(`Successfully retrieved action: ${action.name} (${action.id})`);

        return createSuccessResponse(action);
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

      // API URL for creating an action
      const apiUrl = `https://${config.domain}/api/v2/actions/actions`;
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

        log(`Successfully created action: ${newAction.name} (${newAction.id})`);

        return createSuccessResponse(newAction);
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

      // API URL for updating an action
      const apiUrl = `https://${config.domain}/api/v2/actions/actions/${id}`;
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
            const secretUrl = `https://${config.domain}/api/v2/actions/actions/${id}/secrets`;

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

        // Add information about secrets update to the result
        const result = {
          ...updatedAction,
          secrets_updated: secretsUpdated,
        };

        log(`Successfully updated action: ${updatedAction.name} (${updatedAction.id})`);

        return createSuccessResponse(result);
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
      const id = request.parameters.id;
      if (!id) {
        return createErrorResponse('Error: id is required');
      }

      // API URL for deleting an action
      const apiUrl = `https://${config.domain}/api/v2/actions/actions/${id}`;
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

        log(`Successfully deleted action with id: ${id}`);

        return createSuccessResponse({
          message: `Action with id '${id}' has been deleted.`,
          id: id,
        });
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
      const id = request.parameters.id;
      if (!id) {
        return createErrorResponse('Error: id is required');
      }

      // API URL for deploying an action
      const apiUrl = `https://${config.domain}/api/v2/actions/actions/${id}/deploy`;
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

        log(`Successfully deployed action: ${deployedAction.name} (${deployedAction.id})`);

        return createSuccessResponse(deployedAction);
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
