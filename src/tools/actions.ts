import type { HandlerConfig, HandlerRequest, HandlerResponse, Tool } from '../utils/types.js';
import { log } from '../utils/logger.js';
import { createErrorResponse, createSuccessResponse } from '../utils/http-utility.js';
import type { Auth0Config } from '../utils/config.js';
import { getManagementClient } from '../utils/auth0-client.js';
import type { PatchActionRequest, PostActionRequest } from 'auth0/dist/cjs/management/index.js';

interface Auth0Action {
  id: string;
  name: string;
  supported_triggers: Auth0ActionTrigger[];
  code: string;
  dependencies: Auth0ActionDependency[];
  runtime: string;
  status: string;
  secrets: Auth0ActionSecret[];
}

interface Auth0ActionTrigger {
  id: string;
  version: string;
}

interface Auth0ActionDependency {
  name: string;
  version: string;
}

interface Auth0ActionSecret {
  name: string;
  value?: string;
  updated_at?: string;
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
    _meta: {
      requiredScopes: ['read:actions'],
      readOnly: true,
    },
    annotations: {
      title: 'List Auth0 Actions',
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
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
    _meta: {
      requiredScopes: ['read:actions'],
      readOnly: true,
    },
    annotations: {
      title: 'Get Auth0 Action Details',
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
  },
  {
    name: 'auth0_create_action',
    description: 'Create a new Auth0 action',
    inputSchema: {
      type: 'object',
      properties: {
        name: {
          type: 'string',
          description: 'Name of the action. Required.',
        },
        supported_triggers: {
          type: 'array',
          description: 'The list of triggers that this action supports. Required.',
          items: {
            type: 'object',
            properties: {
              id: { type: 'string', description: 'ID of the trigger' },
              version: { type: 'string', description: 'Version of the trigger (e.g., "v2")' },
            },
            required: ['id', 'version'],
          },
        },
        code: {
          type: 'string',
          description: 'The source code of the action. Required.',
        },
        runtime: {
          type: 'string',
          description: 'The Node runtime. For example: "node18" or "node16". Defaults to "node18".',
        },
        dependencies: {
          type: 'array',
          description: 'List of third party npm modules that this action depends on.',
          items: {
            type: 'object',
            properties: {
              name: { type: 'string', description: 'Name of the NPM package' },
              version: { type: 'string', description: 'Version of the NPM package' },
            },
            required: ['name', 'version'],
          },
        },
        secrets: {
          type: 'array',
          description: 'List of secrets that are included in the action.',
          items: {
            type: 'object',
            properties: {
              name: { type: 'string', description: 'Name of the secret' },
              value: { type: 'string', description: 'Value of the secret' },
            },
            required: ['name', 'value'],
          },
        },
      },
      required: ['name', 'supported_triggers'],
    },
    _meta: {
      requiredScopes: ['create:actions'],
    },
    annotations: {
      title: 'Create Auth0 Action',
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: false,
    },
  },
  {
    name: 'auth0_update_action',
    description: 'Update an existing Auth0 action',
    inputSchema: {
      type: 'object',
      properties: {
        id: {
          type: 'string',
          description: 'ID of the action to update. Required.',
        },
        name: {
          type: 'string',
          description: 'New name of the action. Optional.',
        },
        supported_triggers: {
          type: 'array',
          description: 'The list of triggers that this action supports. Optional.',
          items: {
            type: 'object',
            properties: {
              id: { type: 'string', description: 'ID of the trigger' },
              version: { type: 'string', description: 'Version of the trigger (e.g., "v2")' },
            },
            required: ['id', 'version'],
          },
        },
        code: {
          type: 'string',
          description: 'New JavaScript code for the action. Optional.',
        },
        runtime: {
          type: 'string',
          description: 'The Node runtime. For example: "node18" or "node16".',
        },
        dependencies: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              name: {
                type: 'string',
                description: 'Name of the NPM dependency',
              },
              version: {
                type: 'string',
                description: 'Version of the NPM dependency',
              },
            },
            required: ['name', 'version'],
          },
          description: 'Updated NPM dependencies for the action. Optional.',
        },
        secrets: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              name: {
                type: 'string',
                description: 'Name of the secret variable',
              },
              value: {
                type: 'string',
                description: 'Value of the secret. If omitted, the existing value is retained.',
              },
            },
            required: ['name'],
          },
          description: 'Secrets to update for the action. Optional.',
        },
      },
      required: ['id'],
    },
    _meta: {
      requiredScopes: ['update:actions'],
    },
    annotations: {
      title: 'Update Auth0 Action',
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: true,
      openWorldHint: false,
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
    _meta: {
      requiredScopes: ['update:actions'],
    },
    annotations: {
      title: 'Deploy Auth0 Action',
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: false,
      openWorldHint: false,
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
      // Check for token
      if (!request.token) {
        log('Warning: Token is empty or undefined');
        return createErrorResponse('Error: Missing authorization token');
      }

      // Check if domain is configured
      if (!config.domain) {
        log('Error: Auth0 domain is not configured');
        return createErrorResponse('Error: Auth0 domain is not configured');
      }

      // Build query parameters
      const options: Record<string, any> = {};

      if (request.parameters.page !== undefined) {
        options.page = request.parameters.page;
      }

      if (request.parameters.per_page !== undefined) {
        options.per_page = request.parameters.per_page;
      } else {
        // Default to 5 items per page
        options.per_page = 5;
      }

      if (request.parameters.include_totals !== undefined) {
        options.include_totals = request.parameters.include_totals;
      } else {
        // Default to include totals
        options.include_totals = true;
      }

      if (request.parameters.trigger_id) {
        options.triggerId = request.parameters.trigger_id;
      }

      try {
        const managementClientConfig: Auth0Config = {
          domain: config.domain,
          token: request.token,
        };
        const managementClient = await getManagementClient(managementClientConfig);

        // Use the Auth0 SDK to get all actions
        const { data: responseData } = await managementClient.actions.getAll(options);

        // Handle different response formats
        let actions: Auth0Action[] = [];
        let total = 0;
        let page = 0;
        let perPage = options.per_page || 5;

        if (Array.isArray(responseData)) {
          // Simple array response
          actions = responseData as Auth0Action[];
          total = actions.length;
        } else if (
          typeof responseData === 'object' &&
          responseData !== null &&
          'actions' in responseData &&
          Array.isArray((responseData as any).actions)
        ) {
          // Paginated response with totals
          actions = (responseData as any).actions;
          total = (responseData as any).total || actions.length;
          page = (responseData as any).page || 0;
          perPage = (responseData as any).per_page || actions.length;
        } else {
          log('Invalid response format');
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

        log(`Successfully retrieved actions`);

        return createSuccessResponse(result);
      } catch (sdkError: any) {
        // Handle SDK errors
        log('Auth0 SDK error');

        let errorMessage = `Failed to list actions: ${sdkError.message || 'Unknown error'}`;

        // Add context based on common error codes
        if (sdkError.statusCode === 401) {
          errorMessage +=
            '\nError: Unauthorized. Your token might be expired or invalid or missing read:actions scope.';
        } else if (sdkError.statusCode === 403) {
          errorMessage +=
            '\nError: Forbidden. Your token might not have the required scopes (read:actions).';
        } else if (sdkError.statusCode === 429) {
          errorMessage +=
            '\nError: Rate limited. You have made too many requests to the Auth0 API. Please try again later.';
        } else if (sdkError.statusCode >= 500) {
          errorMessage +=
            '\nError: Auth0 server error. The Auth0 API might be experiencing issues. Please try again later.';
        }

        return createErrorResponse(errorMessage);
      }
    } catch (error: any) {
      // Handle any other errors
      log('Error processing request');

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

      // Check for token
      if (!request.token) {
        log('Warning: Token is empty or undefined');
        return createErrorResponse('Error: Missing authorization token');
      }

      // Check if domain is configured
      if (!config.domain) {
        log('Error: Auth0 domain is not configured');
        return createErrorResponse('Error: Auth0 domain is not configured');
      }

      try {
        const managementClientConfig: Auth0Config = {
          domain: config.domain,
          token: request.token,
        };
        const managementClient = await getManagementClient(managementClientConfig);

        log(`Fetching action with ID: ${id}`);

        // Use the Auth0 SDK to get a specific action
        const action = await managementClient.actions.get({ id });

        log(
          `Successfully retrieved action: ${(action as any).name || 'Unknown'} (${(action as any).id || id})`
        );

        return createSuccessResponse(action);
      } catch (sdkError: any) {
        // Handle SDK errors
        log('Auth0 SDK error');

        let errorMessage = `Failed to get action: ${sdkError.message || 'Unknown error'}`;

        // Add context based on common error codes
        if (sdkError.statusCode === 404) {
          errorMessage = `Action with id '${id}' not found.`;
        } else if (sdkError.statusCode === 401) {
          errorMessage +=
            '\nError: Unauthorized. Your token might be expired or invalid or missing read:actions scope.';
        }

        return createErrorResponse(errorMessage);
      }
    } catch (error: any) {
      // Handle any other errors
      log('Error processing request');

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
        supported_triggers,
        code,
        runtime = 'node18',
        dependencies = [],
        secrets = [],
      } = request.parameters;

      if (!name) {
        return createErrorResponse('Error: name is required');
      }

      if (
        !supported_triggers ||
        !Array.isArray(supported_triggers) ||
        supported_triggers.length === 0
      ) {
        return createErrorResponse(
          'Error: supported_triggers is required and must be a non-empty array'
        );
      }

      if (!code) {
        return createErrorResponse('Error: code is required');
      }

      // Check for token
      if (!request.token) {
        log('Warning: Token is empty or undefined');
        return createErrorResponse('Error: Missing authorization token');
      }

      // Check if domain is configured
      if (!config.domain) {
        log('Error: Auth0 domain is not configured');
        return createErrorResponse('Error: Auth0 domain is not configured');
      }

      // Prepare request body
      const actionData: PostActionRequest = {
        name,
        supported_triggers,
        code,
        runtime,
        dependencies,
        secrets,
      };

      try {
        const managementClientConfig: Auth0Config = {
          domain: config.domain,
          token: request.token,
        };
        const managementClient = await getManagementClient(managementClientConfig);

        log(`Creating new action with name: ${name}`);

        // Use the Auth0 SDK to create an action
        const newAction = await managementClient.actions.create(actionData);

        log(
          `Successfully created action: ${(newAction as any).name || name} (${(newAction as any).id || 'new action'})`
        );

        return createSuccessResponse(newAction);
      } catch (sdkError: any) {
        // Handle SDK errors
        log('Auth0 SDK error');

        let errorMessage = `Failed to create action: ${sdkError.message || 'Unknown error'}`;

        // Add context based on common error codes
        if (sdkError.statusCode === 401) {
          errorMessage +=
            '\nError: Unauthorized. Your token might be expired or invalid or missing create:actions scope.';
        } else if (sdkError.statusCode === 422) {
          errorMessage +=
            '\nError: Validation errors in your request. Check that your parameters are valid.';
        }

        return createErrorResponse(errorMessage);
      }
    } catch (error: any) {
      // Handle any other errors
      log('Error processing request');

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
      const { name, supported_triggers, code, runtime, dependencies, secrets } = request.parameters;

      // Prepare update body, only including fields that are present
      const updateData: Partial<PatchActionRequest> = {};
      if (name !== undefined) updateData.name = name;
      if (supported_triggers !== undefined) updateData.supported_triggers = supported_triggers;
      if (code !== undefined) updateData.code = code;
      if (runtime !== undefined) updateData.runtime = runtime;
      if (dependencies !== undefined) updateData.dependencies = dependencies;
      if (secrets !== undefined) updateData.secrets = secrets;

      // Check for token
      if (!request.token) {
        log('Warning: Token is empty or undefined');
        return createErrorResponse('Error: Missing authorization token');
      }

      // Check if domain is configured
      if (!config.domain) {
        log('Error: Auth0 domain is not configured');
        return createErrorResponse('Error: Auth0 domain is not configured');
      }

      try {
        const managementClientConfig: Auth0Config = {
          domain: config.domain,
          token: request.token,
        };
        const managementClient = await getManagementClient(managementClientConfig);

        log(`Updating action with ID: ${id}`);

        // Use the Auth0 SDK to update the action
        const updatedAction = await managementClient.actions.update({ id }, updateData);

        // Add information about secrets update to the result
        const result = {
          ...updatedAction,
        };

        log(
          `Successfully updated action: ${(result as any).name || 'Unknown'} (${(result as any).id || id})`
        );

        return createSuccessResponse(result);
      } catch (sdkError: any) {
        // Handle SDK errors
        log('Auth0 SDK error');

        let errorMessage = `Failed to update action: ${sdkError.message || 'Unknown error'}`;

        // Add context based on common error codes
        if (sdkError.statusCode === 404) {
          errorMessage = `Action with id '${id}' not found.`;
        } else if (sdkError.statusCode === 401) {
          errorMessage +=
            '\nError: Unauthorized. Your token might be expired or invalid or missing update:actions scope.';
        } else if (sdkError.statusCode === 422) {
          errorMessage +=
            '\nError: Validation errors in your request. Check that your parameters are valid.';
        }

        return createErrorResponse(errorMessage);
      }
    } catch (error: any) {
      // Handle any other errors
      log('Error processing request');

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

      // Check for token
      if (!request.token) {
        log('Warning: Token is empty or undefined');
        return createErrorResponse('Error: Missing authorization token');
      }

      // Check if domain is configured
      if (!config.domain) {
        log('Error: Auth0 domain is not configured');
        return createErrorResponse('Error: Auth0 domain is not configured');
      }

      try {
        const managementClientConfig: Auth0Config = {
          domain: config.domain,
          token: request.token,
        };
        const managementClient = await getManagementClient(managementClientConfig);

        log(`Deploying action with ID: ${id}`);

        // Use the Auth0 SDK to deploy the action
        const deployedAction = await managementClient.actions.deploy({ id });

        log(
          `Successfully deployed action: ${(deployedAction as any).name || 'Unknown'} (${(deployedAction as any).id || id})`
        );

        return createSuccessResponse(deployedAction);
      } catch (error: any) {
        // Handle SDK errors
        log('Error deploying action:', error);

        const errorMessage = `Failed to deploy action: ${error.message || 'Unknown error'}`;

        return createErrorResponse(errorMessage);
      }
    } catch (error: any) {
      // Handle any other errors
      log('Error processing request');

      return createErrorResponse(
        `Error: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  },
};
