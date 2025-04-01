import fetch from 'node-fetch';
import {
  Auth0Application,
  Auth0PaginatedResponse,
  HandlerConfig,
  HandlerRequest,
  HandlerResponse,
  Tool,
} from '../utils/types.js';
import { log } from '../utils/logger.js';
import {
  createErrorResponse,
  createSuccessResponse,
  formatDomain,
  handleNetworkError,
} from '../utils/http-utility.js';

// Define all available application tools
export const APPLICATION_TOOLS: Tool[] = [
  {
    name: 'auth0_list_applications',
    description: 'List all applications in the Auth0 tenant',
    inputSchema: {
      type: 'object',
      properties: {
        page: { type: 'number', description: 'Page number (0-based)' },
        per_page: { type: 'number', description: 'Number of applications per page' },
        include_totals: { type: 'boolean', description: 'Include total count' },
      },
    },
  },
  {
    name: 'auth0_get_application',
    description: 'Get details about a specific Auth0 application',
    inputSchema: {
      type: 'object',
      properties: {
        client_id: { type: 'string', description: 'Client ID of the application to retrieve' },
      },
      required: ['client_id'],
    },
  },
  {
    name: 'auth0_create_application',
    description: 'Create a new Auth0 application',
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Name of the application' },
        app_type: {
          type: 'string',
          description: 'Type of application (native, spa, regular_web, non_interactive)',
          enum: ['native', 'spa', 'regular_web', 'non_interactive'],
        },
        description: { type: 'string', description: 'Description of the application' },
        callbacks: {
          type: 'array',
          items: { type: 'string' },
          description: 'Allowed callback URLs',
        },
        allowed_origins: {
          type: 'array',
          items: { type: 'string' },
          description: 'Allowed origins for CORS',
        },
      },
      required: ['name', 'app_type'],
    },
  },
  {
    name: 'auth0_update_application',
    description: 'Update an existing Auth0 application',
    inputSchema: {
      type: 'object',
      properties: {
        client_id: { type: 'string', description: 'Client ID of the application to update' },
        name: { type: 'string', description: 'New name of the application' },
        description: { type: 'string', description: 'New description of the application' },
        callbacks: {
          type: 'array',
          items: { type: 'string' },
          description: 'New allowed callback URLs',
        },
        allowed_origins: {
          type: 'array',
          items: { type: 'string' },
          description: 'New allowed origins for CORS',
        },
      },
      required: ['client_id'],
    },
  },
  {
    name: 'auth0_delete_application',
    description: 'Delete an Auth0 application',
    inputSchema: {
      type: 'object',
      properties: {
        client_id: { type: 'string', description: 'Client ID of the application to delete' },
      },
      required: ['client_id'],
    },
  },
  {
    name: 'auth0_search_applications',
    description: 'Search for Auth0 applications by name',
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Name or partial name to search for' },
        page: { type: 'number', description: 'Page number (0-based)' },
        per_page: { type: 'number', description: 'Number of applications per page' },
        include_totals: { type: 'boolean', description: 'Include total count' },
      },
      required: ['name'],
    },
  },
];

// Define handlers for each application tool
export const APPLICATION_HANDLERS: Record<
  string,
  (request: HandlerRequest, config: HandlerConfig) => Promise<HandlerResponse>
> = {
  auth0_list_applications: async (
    request: HandlerRequest,
    config: HandlerConfig
  ): Promise<HandlerResponse> => {
    try {
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
        // Default to 5 items per page if not specified (reduced from 10 to make output more manageable)
        params.append('per_page', '5');
      }
      if (request.parameters.include_totals !== undefined) {
        params.append('include_totals', request.parameters.include_totals.toString());
      } else {
        // Default to include totals
        params.append('include_totals', 'true');
      }

      // Full URL for debugging
      const apiUrl = `https://${config.domain}/api/v2/clients?${params.toString()}`;
      log(`Making API request to ${apiUrl}`);

      try {
        // Make API request to Auth0 Management API with timeout
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 15000); // Increased to 15 second timeout

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

        clearTimeout(timeoutId);

        if (!response.ok) {
          const errorText = await response.text();
          log(`API request failed with status ${response.status}: ${errorText}`);

          let errorMessage = `Failed to list applications: ${response.status} ${response.statusText}`;

          // Add more context based on common error codes
          if (response.status === 401) {
            errorMessage +=
              '\nError: Unauthorized. Your token might be expired or invalid. Try running "npx @auth0/auth0-mcp-server init" to refresh your token.';
          } else if (response.status === 403) {
            errorMessage +=
              '\nError: Forbidden. Your token might not have the required scopes (read:clients). Try running "npx @auth0/auth0-mcp-server init" to check the proper permissions.';
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
        const parseStartTime = Date.now();
        const responseData = (await response.json()) as Auth0PaginatedResponse;
        const parseElapsed = Date.now() - parseStartTime;

        if (!responseData.clients || !Array.isArray(responseData.clients)) {
          log('Invalid response format - missing clients array');
          log('Response data:', responseData);

          return createErrorResponse(
            'Error: Received invalid response format from Auth0 API. The "clients" array is missing or invalid.'
          );
        }

        // Format applications list
        const applications = responseData.clients.map((app) => ({
          id: app.client_id,
          name: app.name,
          type: app.app_type || 'Unknown',
          description: app.description || '-',
          domain: app.callbacks?.length ? app.callbacks[0].split('/')[2] : '-',
        }));

        // Get pagination info
        const total = responseData.total || applications.length;
        const page = responseData.page !== undefined ? responseData.page : 0;
        const perPage = responseData.per_page || applications.length;
        const totalPages = Math.ceil(total / perPage);

        log(
          `Successfully retrieved ${applications.length} applications (page ${page + 1} of ${totalPages}, total: ${total})`
        );

        return createSuccessResponse(applications);
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
  auth0_get_application: async (
    request: HandlerRequest,
    config: HandlerConfig
  ): Promise<HandlerResponse> => {
    try {
      const clientId = request.parameters.client_id;
      if (!clientId) {
        return createErrorResponse('Error: client_id is required');
      }

      // API URL for getting an application
      const apiUrl = `https://${config.domain}/api/v2/clients/${clientId}`;
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

          let errorMessage = `Failed to get application: ${response.status} ${response.statusText}`;

          if (response.status === 404) {
            errorMessage = `Application with client_id '${clientId}' not found.`;
          } else if (response.status === 401) {
            errorMessage +=
              '\nError: Unauthorized. Your token might be expired or invalid or missing read:clients scope.';
          }

          return createErrorResponse(errorMessage);
        }

        // Parse the response
        const application = (await response.json()) as Auth0Application;

        log(`Successfully retrieved application: ${application.name} (${application.client_id})`);

        return createSuccessResponse(application);
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
  auth0_create_application: async (
    request: HandlerRequest,
    config: HandlerConfig
  ): Promise<HandlerResponse> => {
    try {
      const { name, app_type, description, callbacks, allowed_origins } = request.parameters;

      if (!name) {
        return createErrorResponse('Error: name is required');
      }

      if (!app_type) {
        return createErrorResponse('Error: app_type is required');
      }

      // API URL for creating an application
      const apiUrl = `https://${config.domain}/api/v2/clients`;
      log(`Making API request to ${apiUrl}`);

      // Prepare request body
      const requestBody = {
        name,
        app_type,
        description,
        callbacks,
        allowed_origins,
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

          let errorMessage = `Failed to create application: ${response.status} ${response.statusText}`;

          if (response.status === 401) {
            errorMessage +=
              '\nError: Unauthorized. Your token might be expired or invalid or missing create:clients scope.';
          } else if (response.status === 422) {
            errorMessage +=
              '\nError: Validation errors in your request. Check that your parameters are valid.';
          }

          return createErrorResponse(errorMessage);
        }

        // Parse the response
        const newApplication = (await response.json()) as Auth0Application;

        log(
          `Successfully created application: ${newApplication.name} (${newApplication.client_id})`
        );

        return createSuccessResponse(newApplication);
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
  auth0_update_application: async (
    request: HandlerRequest,
    config: HandlerConfig
  ): Promise<HandlerResponse> => {
    try {
      const clientId = request.parameters.client_id;
      if (!clientId) {
        return createErrorResponse('Error: client_id is required');
      }

      // Extract other parameters to update
      const { name, description, callbacks, allowed_origins } = request.parameters;

      // Prepare update body, only including fields that are present
      const updateBody: Record<string, any> = {};
      if (name !== undefined) updateBody.name = name;
      if (description !== undefined) updateBody.description = description;
      if (callbacks !== undefined) updateBody.callbacks = callbacks;
      if (allowed_origins !== undefined) updateBody.allowed_origins = allowed_origins;

      // API URL for updating an application
      const apiUrl = `https://${config.domain}/api/v2/clients/${clientId}`;
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

          let errorMessage = `Failed to update application: ${response.status} ${response.statusText}`;

          if (response.status === 404) {
            errorMessage = `Application with client_id '${clientId}' not found.`;
          } else if (response.status === 401) {
            errorMessage +=
              '\nError: Unauthorized. Your token might be expired or invalid or missing update:clients scope.';
          }

          return createErrorResponse(errorMessage);
        }

        // Parse the response
        const updatedApplication = (await response.json()) as Auth0Application;

        log(
          `Successfully updated application: ${updatedApplication.name} (${updatedApplication.client_id})`
        );

        return createSuccessResponse(updatedApplication);
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
  auth0_delete_application: async (
    request: HandlerRequest,
    config: HandlerConfig
  ): Promise<HandlerResponse> => {
    try {
      const clientId = request.parameters.client_id;
      if (!clientId) {
        return createErrorResponse('Error: client_id is required');
      }

      // API URL for deleting an application
      const apiUrl = `https://${config.domain}/api/v2/clients/${clientId}`;
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

          let errorMessage = `Failed to delete application: ${response.status} ${response.statusText}`;

          if (response.status === 404) {
            errorMessage = `Application with client_id '${clientId}' not found.`;
          } else if (response.status === 401) {
            errorMessage +=
              '\nError: Unauthorized. Your token might be expired or invalid or missing delete:clients scope.';
          }

          return createErrorResponse(errorMessage);
        }

        // Delete operations typically return 204 No Content
        log(`Successfully deleted application with client_id: ${clientId}`);

        return createSuccessResponse({
          message: `Application with client_id '${clientId}' has been deleted.`,
          client_id: clientId,
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
  auth0_search_applications: async (
    request: HandlerRequest,
    config: HandlerConfig
  ): Promise<HandlerResponse> => {
    try {
      const searchName = request.parameters.name;
      if (!searchName) {
        return createErrorResponse('Error: name parameter is required');
      }

      // Build query parameters
      const params = new URLSearchParams();

      // Add search query with a more compatible format
      if (searchName.includes(' ') || /[^a-zA-Z0-9]/.test(searchName)) {
        // If the search name contains spaces or special characters, use exact match
        params.append('q', `name:"${searchName.replace(/"/g, '\\"')}"`);
      } else {
        // For simple terms, use a prefix search
        params.append('q', `name:${searchName}*`);
      }

      // Make sure we're using the right search engine
      params.append('search_engine', 'v3');

      if (request.parameters.page !== undefined) {
        params.append('page', request.parameters.page.toString());
      }

      if (request.parameters.per_page !== undefined) {
        params.append('per_page', request.parameters.per_page.toString());
      } else {
        // Default to 10 applications per page
        params.append('per_page', '10');
      }

      if (request.parameters.include_totals !== undefined) {
        params.append('include_totals', request.parameters.include_totals.toString());
      } else {
        // Default to include totals
        params.append('include_totals', 'true');
      }

      // Full URL for debugging
      const apiUrl = `https://${config.domain}/api/v2/clients?${params.toString()}`;
      log(`Making API request to ${apiUrl}`);

      try {
        // Make API request to Auth0 Management API with timeout
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

          let errorMessage = `Failed to search applications: ${response.status} ${response.statusText}`;

          if (response.status === 401) {
            errorMessage +=
              '\nError: Unauthorized. Your token might be expired or invalid or missing read:clients scope.';
          }

          return createErrorResponse(errorMessage);
        }

        // Parse the response
        const responseData = (await response.json()) as unknown;

        // Handle different response formats
        let applications: Auth0Application[] = [];
        let total = 0;
        let page = 0;
        let perPage = 10;

        if (Array.isArray(responseData)) {
          // Simple array response
          applications = responseData as Auth0Application[];
          total = applications.length;
        } else if (
          typeof responseData === 'object' &&
          responseData !== null &&
          'clients' in responseData &&
          Array.isArray((responseData as any).clients)
        ) {
          // Paginated response with totals
          applications = (responseData as any).clients;
          total = (responseData as any).total || applications.length;
          page = (responseData as any).page || 0;
          perPage = (responseData as any).per_page || applications.length;
        } else {
          log('Invalid response format:', responseData);
          return createErrorResponse('Error: Received invalid response format from Auth0 API.');
        }

        if (applications.length === 0) {
          return createSuccessResponse({
            message: `No applications found matching the name "${searchName}".`,
            applications: [],
          });
        }

        // Create a result object with all the necessary information
        const result = {
          applications: applications,
          query: searchName,
          count: applications.length,
          total: total,
          page: page,
          per_page: perPage,
          pagination: {
            total_pages: Math.ceil(total / perPage),
            current_page: page + 1,
            has_next: page + 1 < Math.ceil(total / perPage),
          },
        };

        log(`Successfully found ${applications.length} applications matching "${searchName}"`);

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
