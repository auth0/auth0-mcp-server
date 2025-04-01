import fetch from 'node-fetch';
import { HandlerConfig, HandlerRequest, HandlerResponse, Tool } from '../utils/types.js';
import { log } from '../utils/logger.js';
import {
  createErrorResponse,
  createSuccessResponse,
  formatDomain,
  handleNetworkError,
} from '../utils/http-utility.js';

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
        from: { type: 'string', description: 'Log ID to start from' },
        take: { type: 'number', description: 'Number of logs to retrieve (max 100)' },
        q: { type: 'string', description: 'Query in Lucene query string syntax' },
        sort: {
          type: 'string',
          description: 'Field to sort by',
          enum: ['date:1', 'date:-1'],
        },
        include_fields: { type: 'boolean', description: 'Whether to include all fields' },
        include_totals: { type: 'boolean', description: 'Whether to include totals' },
      },
    },
  },
  {
    name: 'auth0_get_log',
    description: 'Get a specific log entry by ID',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'ID of the log entry to retrieve' },
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
        user_id: { type: 'string', description: 'Filter logs by user ID' },
        client_id: { type: 'string', description: 'Filter logs by client ID' },
        type: { type: 'string', description: 'Filter logs by type (e.g., "s", "f", "fp", etc.)' },
        from: { type: 'string', description: 'Start date (ISO format)' },
        to: { type: 'string', description: 'End date (ISO format)' },
        page: { type: 'number', description: 'Page number' },
        per_page: { type: 'number', description: 'Items per page (max 100)' },
        include_totals: { type: 'boolean', description: 'Whether to include totals' },
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
      // Build query parameters
      const params = new URLSearchParams();

      if (request.parameters.from) {
        params.append('from', request.parameters.from);
      }

      if (request.parameters.take !== undefined) {
        const take = Math.min(request.parameters.take, 100); // Max 100 logs
        params.append('take', take.toString());
      } else {
        // Default to 10 logs
        params.append('take', '10');
      }

      if (request.parameters.q) {
        params.append('q', request.parameters.q);
      }

      if (request.parameters.sort) {
        params.append('sort', request.parameters.sort);
      } else {
        // Default to newest first
        params.append('sort', 'date:-1');
      }

      if (request.parameters.include_fields !== undefined) {
        params.append('include_fields', request.parameters.include_fields.toString());
      }

      if (request.parameters.include_totals !== undefined) {
        params.append('include_totals', request.parameters.include_totals.toString());
      } else {
        // Default to include totals
        params.append('include_totals', 'true');
      }

      // Full URL for debugging
      const apiUrl = `https://${config.domain}/api/v2/logs?${params.toString()}`;
      log(`Making API request to ${apiUrl}`);

      try {
        // Make API request to Auth0 Management API with timeout
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 15000);

        const response = await fetch(apiUrl, {
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

          let errorMessage = `Failed to list logs: ${response.status} ${response.statusText}`;

          // Add more context based on common error codes
          if (response.status === 401) {
            errorMessage +=
              '\nError: Unauthorized. Your token might be expired or invalid. Try running "npx @auth0/auth0-mcp-server init" to refresh your token.';
          } else if (response.status === 403) {
            errorMessage +=
              '\nError: Forbidden. Your token might not have the required scopes (read:logs). Try running "npx @auth0/auth0-mcp-server init" to see the proper permissions.';
          }

          return createErrorResponse(errorMessage);
        }

        // Parse the response
        const responseData = (await response.json()) as unknown;

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
  auth0_get_log: async (
    request: HandlerRequest,
    config: HandlerConfig
  ): Promise<HandlerResponse> => {
    try {
      const id = request.parameters.id;
      if (!id) {
        return createErrorResponse('Error: id is required');
      }

      // API URL for getting a log
      const apiUrl = `https://${config.domain}/api/v2/logs/${id}`;
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

          let errorMessage = `Failed to get log: ${response.status} ${response.statusText}`;

          if (response.status === 404) {
            errorMessage = `Log with id '${id}' not found.`;
          } else if (response.status === 401) {
            errorMessage +=
              '\nError: Unauthorized. Your token might be expired or invalid or missing read:logs scope.';
          }

          return createErrorResponse(errorMessage);
        }

        // Parse the response
        const logEntry = (await response.json()) as Auth0Log;

        log(`Successfully retrieved log: ${logEntry._id}`);

        return createSuccessResponse(logEntry);
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
  auth0_search_logs: async (
    request: HandlerRequest,
    config: HandlerConfig
  ): Promise<HandlerResponse> => {
    try {
      // Build query parameters
      const params = new URLSearchParams();

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

      if (queryParts.length > 0) {
        params.append('q', queryParts.join(' AND '));
      }

      // Add pagination parameters
      if (request.parameters.page !== undefined) {
        params.append('page', request.parameters.page.toString());
      }

      if (request.parameters.per_page !== undefined) {
        const perPage = Math.min(request.parameters.per_page, 100); // Max 100 logs
        params.append('per_page', perPage.toString());
      } else {
        // Default to 10 logs per page
        params.append('per_page', '10');
      }

      // Default to include totals
      if (request.parameters.include_totals !== undefined) {
        params.append('include_totals', request.parameters.include_totals.toString());
      } else {
        params.append('include_totals', 'true');
      }

      // Sort by date descending by default
      params.append('sort', 'date:-1');

      // Full URL for debugging
      const apiUrl = `https://${config.domain}/api/v2/logs?${params.toString()}`;
      log(`Making API request to ${apiUrl}`);

      try {
        // Make API request to Auth0 Management API with timeout
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 15000);

        const response = await fetch(apiUrl, {
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

          let errorMessage = `Failed to search logs: ${response.status} ${response.statusText}`;

          if (response.status === 401) {
            errorMessage +=
              '\nError: Unauthorized. Your token might be expired or invalid or missing read:logs scope.';
          }

          return createErrorResponse(errorMessage);
        }

        // Parse the response
        const responseData = (await response.json()) as unknown;

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
