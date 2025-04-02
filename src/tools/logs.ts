import { HandlerConfig, HandlerRequest, HandlerResponse, Tool } from '../utils/types.js';
import { log } from '../utils/logger.js';
import { createErrorResponse, createSuccessResponse } from '../utils/http-utility.js';
import { Auth0Config } from '../utils/config.js';
import { getManagementClient } from '../utils/management-client.js';

// Define Auth0 Log interfaces
interface Auth0Log {
  _id: string;
  date: string;
  type: string;
  description: string;
  client_id?: string;
  client_name?: string;
  ip?: string;
  user_id?: string;
  user_name?: string;
  details?: Record<string, any>;
  [key: string]: any;
}

interface Auth0PaginatedLogsResponse {
  logs: Auth0Log[];
  total?: number;
  start?: number;
  limit?: number;
  [key: string]: any;
}

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
          description: 'Number of logs to retrieve (1-100). Optional, defaults to 10.',
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
  },
  {
    name: 'auth0_search_logs',
    description: 'Search logs with specific criteria',
    inputSchema: {
      type: 'object',
      properties: {
        user_id: {
          type: 'string',
          description: 'Filter logs by user ID. Optional.',
        },
        client_id: {
          type: 'string',
          description: 'Filter logs by client ID (application). Optional.',
        },
        type: {
          type: 'string',
          description:
            'Filter logs by type (e.g., "s" for success, "f" for failure, "fp" for failed ping). Optional.',
        },
        from: {
          type: 'string',
          description:
            'Start date in ISO format (YYYY-MM-DD or YYYY-MM-DDThh:mm:ss.sssZ). Optional.',
        },
        to: {
          type: 'string',
          description: 'End date in ISO format (YYYY-MM-DD or YYYY-MM-DDThh:mm:ss.sssZ). Optional.',
        },
        page: {
          type: 'number',
          description: 'Page number. Optional, starts at 0.',
        },
        per_page: {
          type: 'number',
          description: 'Items per page (1-100). Optional, defaults to 10.',
        },
        include_totals: {
          type: 'boolean',
          description: 'Whether to include total count. Optional, defaults to true.',
        },
        fields: {
          type: 'string',
          description: 'Comma-separated list of fields to include in the result. Optional.',
        },
      },
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
        // Default to 10 logs
        options.take = 10;
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
        const responseData = await managementClient.logs.getAll(options);

        // Handle different response formats
        let logs: Auth0Log[] = [];
        let total = 0;

        if (Array.isArray(responseData)) {
          // Simple array response
          logs = responseData as Auth0Log[];
          total = logs.length;
        } else if (
          typeof responseData === 'object' &&
          responseData !== null &&
          'logs' in responseData &&
          Array.isArray((responseData as any).logs)
        ) {
          // Paginated response with totals
          logs = (responseData as any).logs;
          total = (responseData as any).total || logs.length;
        } else {
          log('Invalid response format:', responseData);
          return createErrorResponse('Error: Received invalid response format from Auth0 API.');
        }

        if (logs.length === 0) {
          return createSuccessResponse({
            message: 'No logs found matching your criteria.',
            logs: [],
          });
        }

        // Create a result object with all the necessary information
        const result = {
          logs: logs,
          count: logs.length,
          total: total,
          pagination: {
            next_from: logs.length > 0 ? logs[logs.length - 1]._id : null,
          },
        };

        log(`Successfully retrieved ${logs.length} logs`);

        return createSuccessResponse(result);
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
        const logEntry = await managementClient.logs.get({ id });

        log(`Successfully retrieved log entry: ${(logEntry as any)._id || id}`);

        return createSuccessResponse(logEntry);
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
  auth0_search_logs: async (
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

      // Build query string (q parameter) from search criteria
      const queryParts = [];

      if (request.parameters.user_id) {
        queryParts.push(`user_id:"${request.parameters.user_id}"`);
      }

      if (request.parameters.client_id) {
        queryParts.push(`client_id:"${request.parameters.client_id}"`);
      }

      if (request.parameters.type) {
        queryParts.push(`type:"${request.parameters.type}"`);
      }

      if (request.parameters.from || request.parameters.to) {
        let dateRange = 'date:[';
        dateRange += request.parameters.from ? request.parameters.from : '*';
        dateRange += ' TO ';
        dateRange += request.parameters.to ? request.parameters.to : '*';
        dateRange += ']';
        queryParts.push(dateRange);
      }

      // Build query parameters
      const options: Record<string, any> = {};

      if (queryParts.length > 0) {
        options.q = queryParts.join(' AND ');
      }

      // Add pagination parameters
      if (request.parameters.page !== undefined) {
        options.page = request.parameters.page;
      }

      if (request.parameters.per_page !== undefined) {
        const perPage = Math.min(request.parameters.per_page, 100); // Max 100 logs
        options.per_page = perPage;
      } else {
        // Default to 10 logs per page
        options.per_page = 10;
      }

      // Default to include totals
      if (request.parameters.include_totals !== undefined) {
        options.include_totals = request.parameters.include_totals;
      } else {
        options.include_totals = true;
      }

      // Sort by date descending by default
      options.sort = 'date:-1';

      try {
        const managementClientConfig: Auth0Config = {
          domain: config.domain,
          token: request.token,
        };
        const managementClient = await getManagementClient(managementClientConfig);

        log(`Searching logs with options: ${JSON.stringify(options)}`);

        // Use the Auth0 SDK to search logs
        const responseData = await managementClient.logs.getAll(options);

        // Handle different response formats
        let logs: Auth0Log[] = [];
        let total = 0;
        let page = 0;
        let perPage = 10;

        if (Array.isArray(responseData)) {
          // Simple array response
          logs = responseData as Auth0Log[];
          total = logs.length;
        } else if (
          typeof responseData === 'object' &&
          responseData !== null &&
          'logs' in responseData &&
          Array.isArray((responseData as any).logs)
        ) {
          // Paginated response with totals
          logs = (responseData as any).logs;
          total = (responseData as any).total || logs.length;
          page = (responseData as any).page || 0;
          perPage = (responseData as any).per_page || logs.length;
        } else {
          log('Invalid response format:', responseData);
          return createErrorResponse('Error: Received invalid response format from Auth0 API.');
        }

        if (logs.length === 0) {
          return createSuccessResponse({
            message: 'No logs found matching your search criteria.',
            logs: [],
            search_criteria: queryParts.join(' AND '),
          });
        }

        // Create a result object with all the necessary information
        const result = {
          logs: logs,
          count: logs.length,
          total: total,
          search_criteria: queryParts.join(' AND '),
          pagination: {
            page: page,
            per_page: perPage,
            total_pages: Math.ceil(total / perPage),
            has_next: page + 1 < Math.ceil(total / perPage),
          },
        };

        log(`Successfully retrieved ${logs.length} logs matching search criteria`);

        return createSuccessResponse(result);
      } catch (sdkError: any) {
        // Handle SDK errors
        log('Auth0 SDK error:', sdkError);

        let errorMessage = `Failed to search logs: ${sdkError.message || 'Unknown error'}`;

        // Add context based on common error codes
        if (sdkError.statusCode === 401) {
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
