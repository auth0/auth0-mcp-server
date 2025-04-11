import type { HandlerConfig, HandlerRequest, HandlerResponse, Tool } from '../utils/types.js';
import { log } from '../utils/logger.js';
import { createErrorResponse, createSuccessResponse } from '../utils/http-utility.js';
import type { Auth0Config } from '../utils/config.js';
import { getManagementClient } from '../utils/management-client.js';

// Define all available log tools
export const LOG_TOOLS: Tool[] = [
  {
    name: 'auth0_list_logs',
    description: 'List logs from the Auth0 tenant',
    inputSchema: {
      type: 'object',
      properties: {
        from: {
          type: 'string',
          description: 'Log ID to start retrieving logs from. Optional, used for pagination.',
        },
        take: {
          type: 'number',
          description: 'Number of logs to retrieve (1-100). Optional, defaults to 50.',
        },
        q: {
          type: 'string',
          description: 'Query in Lucene query string syntax. Optional, used for filtering logs.',
        },
        sort: {
          type: 'string',
          description: 'Field to sort by. Optional, defaults to date:-1 (newest first).',
          enum: ['date:1', 'date:-1'],
        },
        include_fields: {
          type: 'boolean',
          description: 'Whether to include all fields. Optional, defaults to true.',
        },
        include_totals: {
          type: 'boolean',
          description: 'Whether to include total count. Optional, defaults to true.',
        },
      },
    },
    _meta: {
      requiredScopes: ['read:logs'],
    },
  },
  {
    name: 'auth0_get_log',
    description: 'Get a specific log entry by ID',
    inputSchema: {
      type: 'object',
      properties: {
        id: {
          type: 'string',
          description: 'ID of the log entry to retrieve. Required.',
        },
      },
      required: ['id'],
    },
    _meta: {
      requiredScopes: ['read:logs'],
    },
  },
];

// Define handlers for each log tool
export const LOG_HANDLERS: Record<
  string,
  (request: HandlerRequest, config: HandlerConfig) => Promise<HandlerResponse>
> = {
  auth0_list_logs: async (
    request: HandlerRequest,
    config: HandlerConfig
  ): Promise<HandlerResponse> => {
    try {
      // Check for token
      if (!request.token) {
        log('Warning: Token is empty or undefined');
        return createErrorResponse('Error: Missing authentication token');
      }

      // Check if domain is configured
      if (!config.domain) {
        log('Error: Auth0 domain is not configured');
        return createErrorResponse('Error: Auth0 domain is not configured');
      }

      // Build query parameters
      const options: Record<string, any> = {};

      if (request.parameters.from) {
        options.from = request.parameters.from;
      }

      if (request.parameters.take !== undefined) {
        const take = Math.min(request.parameters.take, 100); // Max 100 logs
        options.take = take;
      } else {
        // Default to 50 logs
        options.take = 50;
      }

      if (request.parameters.q) {
        options.q = request.parameters.q;
      }

      if (request.parameters.sort) {
        options.sort = request.parameters.sort;
      } else {
        // Default to newest first
        options.sort = 'date:-1';
      }

      if (request.parameters.include_fields !== undefined) {
        options.include_fields = request.parameters.include_fields;
      }

      if (request.parameters.include_totals !== undefined) {
        options.include_totals = request.parameters.include_totals;
      } else {
        // Default to include totals
        options.include_totals = true;
      }

      try {
        const managementClientConfig: Auth0Config = {
          domain: config.domain,
          token: request.token,
        };
        const managementClient = await getManagementClient(managementClientConfig);

        log(`Fetching logs with options: ${JSON.stringify(options)}`);

        // Use the Auth0 SDK to get logs
        const { data: responseData } = await managementClient.logs.getAll(options);

        // Handle different response formats

        log(`Successfully retrieved logs`);

        if (!responseData) {
          return createSuccessResponse({
            message: 'No logs found matching your criteria.',
            logs: [],
          });
        }

        return createSuccessResponse(responseData);
      } catch (sdkError: any) {
        // Handle SDK errors
        log('Auth0 SDK error:', sdkError);

        let errorMessage = `Failed to list logs: ${sdkError.message || 'Unknown error'}`;

        // Add context based on common error codes
        if (sdkError.statusCode === 401) {
          errorMessage +=
            '\nError: Unauthorized. Your token might be expired or invalid. Try running "npx @auth0/auth0-mcp-server init" to refresh your token.';
        } else if (sdkError.statusCode === 403) {
          errorMessage +=
            '\nError: Forbidden. Your token might not have the required scopes (read:logs). Try running "npx @auth0/auth0-mcp-server init" to see the proper permissions.';
        }

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
  auth0_get_log: async (
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
        return createErrorResponse('Error: Missing authentication token');
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

        log(`Fetching log entry with ID: ${id}`);

        // Use the Auth0 SDK to get a specific log entry
        const { data: responseData } = await managementClient.logs.get({ id });

        log(`Successfully retrieved log entry: ${(responseData as any)._id || id}`);

        return createSuccessResponse(responseData);
      } catch (sdkError: any) {
        // Handle SDK errors
        log('Auth0 SDK error:', sdkError);

        let errorMessage = `Failed to get log: ${sdkError.message || 'Unknown error'}`;

        // Add context based on common error codes
        if (sdkError.statusCode === 404) {
          errorMessage = `Log with id '${id}' not found.`;
        } else if (sdkError.statusCode === 401) {
          errorMessage +=
            '\nError: Unauthorized. Your token might be expired or invalid or missing read:logs scope.';
        }

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
