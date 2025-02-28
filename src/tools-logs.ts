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
      if (!config.domain) {
        log('Error: AUTH0_DOMAIN environment variable is not set');
        return createErrorResponse('Error: AUTH0_DOMAIN environment variable is not set');
      }

      // Ensure domain is properly formatted
      const domain = formatDomain(config.domain);

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
      const apiUrl = `https://${domain}/api/v2/logs?${params.toString()}`;
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
              '\nError: Unauthorized. Your token might be expired or invalid. Try running "auth0 login" to refresh your token.';
          } else if (response.status === 403) {
            errorMessage +=
              '\nError: Forbidden. Your token might not have the required scopes (read:logs). Try running "auth0 login --scopes read:logs" to get the proper permissions.';
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
          return {
            toolResult: {
              content: [
                {
                  type: 'text',
                  text: 'No logs found matching your criteria.',
                },
              ],
              isError: false,
            },
          };
        }

        // Format logs in a readable way
        let resultText = `### Auth0 Logs (${logs.length}${total > logs.length ? ' of ' + total : ''})\n\n`;
        resultText += '| Date | Type | Description | User |\n';
        resultText += '|------|------|-------------|------|\n';

        logs.forEach(logEntry => {
          const date = new Date(logEntry.date).toLocaleString();
          const type = logEntry.type || '-';
          const description = logEntry.description || '-';
          const user = logEntry.user_name || logEntry.user_id || '-';

          resultText += `| ${date} | ${type} | ${description} | ${user} |\n`;
        });

        // Add pagination info if there are more logs
        if (logs.length < total) {
          const lastLogId = logs[logs.length - 1]._id;
          resultText += `\n*Showing ${logs.length} of ${total} logs*\n`;
          resultText += `\nTo see more logs, use: \`auth0_list_logs(from="${lastLogId}")\`\n`;
        }

        // Add note about viewing details
        if (logs.length > 0) {
          resultText += `\nTo view details of a specific log, use: \`auth0_get_log(id="log_id")\`\n`;
        }

        // Add Log IDs for Reference
        if (logs.length > 0) {
          resultText += '\n### Log IDs for Reference\n\n';
          logs.forEach(logEntry => {
            const date = new Date(logEntry.date).toLocaleString();
            resultText += `- **${date} (${logEntry.type})**: \`${logEntry._id}\`\n`;
          });
        }

        log(`Successfully retrieved ${logs.length} logs`);

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
  auth0_get_log: async (
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

      // API URL for getting a log
      const apiUrl = `https://${domain}/api/v2/logs/${id}`;
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

        // Format log details in markdown
        let resultText = `### Log Entry: ${logEntry._id}\n\n`;
        resultText += `- **Date**: ${new Date(logEntry.date).toLocaleString()}\n`;
        resultText += `- **Type**: ${logEntry.type || 'Unknown'}\n`;
        resultText += `- **Description**: ${logEntry.description || 'No description'}\n`;

        if (logEntry.client_name || logEntry.client_id) {
          resultText += `- **Client**: ${logEntry.client_name || ''} (${logEntry.client_id || ''})\n`;
        }

        if (logEntry.ip) {
          resultText += `- **IP Address**: ${logEntry.ip}\n`;
        }

        if (logEntry.user_name || logEntry.user_id) {
          resultText += `- **User**: ${logEntry.user_name || ''} (${logEntry.user_id || ''})\n`;
        }

        resultText += '\n';

        // Add details section if available
        if (logEntry.details && Object.keys(logEntry.details).length > 0) {
          resultText += `#### Details\n\n`;
          resultText += '```json\n';
          resultText += JSON.stringify(logEntry.details, null, 2);
          resultText += '\n```\n\n';
        }

        // Add raw log data
        resultText += `#### Raw Log Data\n\n`;
        resultText += '```json\n';
        resultText += JSON.stringify(logEntry, null, 2);
        resultText += '\n```\n';

        log(`Successfully retrieved log: ${logEntry._id}`);

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
  auth0_search_logs: async (
    request: HandlerRequest,
    config: HandlerConfig
  ): Promise<HandlerResponse> => {
    try {
      if (!config.domain) {
        return createErrorResponse('Error: AUTH0_DOMAIN environment variable is not set');
      }

      // Ensure domain is properly formatted
      const domain = formatDomain(config.domain);

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
      const apiUrl = `https://${domain}/api/v2/logs?${params.toString()}`;
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
          return {
            toolResult: {
              content: [
                {
                  type: 'text',
                  text: 'No logs found matching your search criteria.',
                },
              ],
              isError: false,
            },
          };
        }

        // Format logs in a readable way
        let resultText = `### Auth0 Logs Search Results (${logs.length}${total > logs.length ? ' of ' + total : ''})\n\n`;

        // Add search criteria if any were provided
        if (queryParts.length > 0) {
          resultText += `**Search criteria**: \`${queryParts.join(' AND ')}\`\n\n`;
        }

        resultText += '| Date | Type | Description | User |\n';
        resultText += '|------|------|-------------|------|\n';

        logs.forEach(logEntry => {
          const date = new Date(logEntry.date).toLocaleString();
          const type = logEntry.type || '-';
          const description = logEntry.description || '-';
          const user = logEntry.user_name || logEntry.user_id || '-';

          resultText += `| ${date} | ${type} | ${description} | ${user} |\n`;
        });

        // Add pagination info if there are more logs
        if (logs.length < total) {
          const totalPages = Math.ceil(total / perPage);
          const nextPage = page + 1 < totalPages ? page + 1 : 0;

          resultText += `\n*Page ${page + 1} of ${totalPages} (${perPage} items per page, ${total} total)*\n`;

          if (nextPage > 0) {
            resultText += `\nTo see more results, use: \`auth0_search_logs(`;

            // Add existing parameters
            if (request.parameters.user_id) {
              resultText += `user_id="${request.parameters.user_id}", `;
            }
            if (request.parameters.client_id) {
              resultText += `client_id="${request.parameters.client_id}", `;
            }
            if (request.parameters.type) {
              resultText += `type="${request.parameters.type}", `;
            }
            if (request.parameters.from) {
              resultText += `from="${request.parameters.from}", `;
            }
            if (request.parameters.to) {
              resultText += `to="${request.parameters.to}", `;
            }

            resultText += `page=${nextPage})\`\n`;
          }
        }

        // Add note about viewing details
        if (logs.length > 0) {
          resultText += `\nTo view details of a specific log, use: \`auth0_get_log(id="log_id")\`\n`;
        }

        log(`Successfully retrieved ${logs.length} logs matching search criteria`);

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
