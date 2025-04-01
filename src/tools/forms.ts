import fetch from 'node-fetch';

import { HandlerConfig, HandlerRequest, HandlerResponse, Tool } from '../utils/types.js';
import { log } from '../utils/logger.js';
import {
  createErrorResponse,
  createSuccessResponse,
  formatDomain,
  handleNetworkError,
} from '../utils/http-utility.js';

// Define Auth0 Form interfaces
interface Auth0Form {
  id: string;
  name: string;
  status: string;
  type: string;
  template_id?: string;
  client_id?: string;
  is_published?: boolean;
  content?: Record<string, any>;
  [key: string]: any;
}

interface Auth0PaginatedFormsResponse {
  forms: Auth0Form[];
  total?: number;
  page?: number;
  per_page?: number;
  [key: string]: any;
}

// Define all available form tools
export const FORM_TOOLS: Tool[] = [
  {
    name: 'auth0_list_forms',
    description: 'List all forms in the Auth0 tenant',
    inputSchema: {
      type: 'object',
      properties: {
        page: { type: 'number', description: 'Page number (0-based)' },
        per_page: { type: 'number', description: 'Number of forms per page' },
        include_totals: { type: 'boolean', description: 'Include total count' },
        type: {
          type: 'string',
          description: 'Filter by form type',
          enum: ['login', 'signup', 'reset-password', 'mfa', 'custom'],
        },
      },
    },
  },
  {
    name: 'auth0_get_form',
    description: 'Get details about a specific Auth0 form',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'ID of the form to retrieve' },
      },
      required: ['id'],
    },
  },
  {
    name: 'auth0_create_form',
    description: 'Create a new Auth0 form',
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Name of the form' },
        type: {
          type: 'string',
          description: 'Type of form',
          enum: ['login', 'signup', 'reset-password', 'mfa', 'custom'],
        },
        template_id: { type: 'string', description: 'ID of the template to use' },
        client_id: { type: 'string', description: 'Client ID to associate with the form' },
        content: {
          type: 'object',
          description: 'Form content and configuration',
        },
      },
      required: ['name', 'type'],
    },
  },
  {
    name: 'auth0_update_form',
    description: 'Update an existing Auth0 form',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'ID of the form to update' },
        name: { type: 'string', description: 'New name of the form' },
        content: {
          type: 'object',
          description: 'Updated form content and configuration',
        },
      },
      required: ['id'],
    },
  },
  {
    name: 'auth0_delete_form',
    description: 'Delete an Auth0 form',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'ID of the form to delete' },
      },
      required: ['id'],
    },
  },
  {
    name: 'auth0_publish_form',
    description: 'Publish an Auth0 form',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'ID of the form to publish' },
      },
      required: ['id'],
    },
  },
];

// Define handlers for each form tool
export const FORM_HANDLERS: Record<
  string,
  (request: HandlerRequest, config: HandlerConfig) => Promise<HandlerResponse>
> = {
  auth0_list_forms: async (
    request: HandlerRequest,
    config: HandlerConfig
  ): Promise<HandlerResponse> => {
    try {
      // Build query parameters
      const params = new URLSearchParams();

      if (request.parameters.page !== undefined) {
        params.append('page', request.parameters.page.toString());
      }

      if (request.parameters.per_page !== undefined) {
        params.append('per_page', request.parameters.per_page.toString());
      } else {
        // Default to 10 forms per page
        params.append('per_page', '10');
      }

      if (request.parameters.include_totals !== undefined) {
        params.append('include_totals', request.parameters.include_totals.toString());
      } else {
        // Default to include totals
        params.append('include_totals', 'true');
      }

      if (request.parameters.type) {
        params.append('type', request.parameters.type);
      }

      // Full URL for debugging
      const apiUrl = `https://${config.domain}/api/v2/branding/forms?${params.toString()}`;
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

          let errorMessage = `Failed to list forms: ${response.status} ${response.statusText}`;

          if (response.status === 401) {
            errorMessage +=
              '\nError: Unauthorized. Your token might be expired or invalid or missing read:branding scope.';
          }

          return createErrorResponse(errorMessage);
        }

        // Parse the response
        const responseData = (await response.json()) as unknown;

        // Handle different response formats
        let forms: Auth0Form[] = [];
        let total = 0;

        if (Array.isArray(responseData)) {
          // Simple array response
          forms = responseData as Auth0Form[];
          total = forms.length;
        } else if (
          typeof responseData === 'object' &&
          responseData !== null &&
          'forms' in responseData &&
          Array.isArray((responseData as any).forms)
        ) {
          // Paginated response with totals
          forms = (responseData as any).forms;
          total = (responseData as any).total || forms.length;
        } else {
          log('Invalid response format:', responseData);
          return createErrorResponse('Error: Received invalid response format from Auth0 API.');
        }

        if (forms.length === 0) {
          return createSuccessResponse({
            message: 'No forms found matching your criteria.',
            forms: [],
          });
        }

        // Create a result object with all the necessary information
        const result = {
          forms: forms,
          count: forms.length,
          total: total,
          pagination: {
            current_page: request.parameters.page || 0,
            per_page: request.parameters.per_page || 10,
            total_pages: Math.ceil(total / (request.parameters.per_page || 10)),
          },
        };

        log(`Successfully retrieved ${forms.length} forms`);

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
  auth0_get_form: async (
    request: HandlerRequest,
    config: HandlerConfig
  ): Promise<HandlerResponse> => {
    try {
      const id = request.parameters.id;
      if (!id) {
        return createErrorResponse('Error: id is required');
      }

      // API URL for getting a form
      const apiUrl = `https://${config.domain}/api/v2/branding/forms/${id}`;
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

          let errorMessage = `Failed to get form: ${response.status} ${response.statusText}`;

          if (response.status === 404) {
            errorMessage = `Form with id '${id}' not found.`;
          } else if (response.status === 401) {
            errorMessage +=
              '\nError: Unauthorized. Your token might be expired or invalid or missing read:branding scope.';
          }

          return createErrorResponse(errorMessage);
        }

        // Parse the response
        const form = (await response.json()) as Auth0Form;

        log(`Successfully retrieved form: ${form.name} (${form.id})`);

        return createSuccessResponse(form);
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
  auth0_create_form: async (
    request: HandlerRequest,
    config: HandlerConfig
  ): Promise<HandlerResponse> => {
    try {
      const { name, type, template_id, client_id, content } = request.parameters;

      if (!name) {
        return createErrorResponse('Error: name is required');
      }

      if (!type) {
        return createErrorResponse('Error: type is required');
      }

      // API URL for creating a form
      const apiUrl = `https://${config.domain}/api/v2/branding/forms`;
      log(`Making API request to ${apiUrl}`);

      // Prepare request body
      const requestBody: Record<string, any> = {
        name,
        type,
      };

      if (template_id) {
        requestBody.template_id = template_id;
      }

      if (client_id) {
        requestBody.client_id = client_id;
      }

      if (content) {
        requestBody.content = content;
      }

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

          let errorMessage = `Failed to create form: ${response.status} ${response.statusText}`;

          if (response.status === 401) {
            errorMessage +=
              '\nError: Unauthorized. Your token might be expired or invalid or missing create:branding scope.';
          } else if (response.status === 422) {
            errorMessage +=
              '\nError: Validation errors in your request. Check that your parameters are valid.';
          }

          return createErrorResponse(errorMessage);
        }

        // Parse the response
        const newForm = (await response.json()) as Auth0Form;

        log(`Successfully created form: ${newForm.name} (${newForm.id})`);

        return createSuccessResponse(newForm);
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
  auth0_update_form: async (
    request: HandlerRequest,
    config: HandlerConfig
  ): Promise<HandlerResponse> => {
    try {
      const { id, name, content } = request.parameters;

      if (!id) {
        return createErrorResponse('Error: id is required');
      }

      // API URL for updating a form
      const apiUrl = `https://${config.domain}/api/v2/branding/forms/${id}`;
      log(`Making API request to ${apiUrl}`);

      // Prepare request body
      const requestBody: Record<string, any> = {};

      if (name) {
        requestBody.name = name;
      }

      if (content) {
        requestBody.content = content;
      }

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
          body: JSON.stringify(requestBody),
          signal: controller.signal,
        });

        clearTimeout(timeoutId);

        if (!response.ok) {
          const errorText = await response.text();
          log(`API request failed with status ${response.status}: ${errorText}`);

          let errorMessage = `Failed to update form: ${response.status} ${response.statusText}`;

          if (response.status === 404) {
            errorMessage = `Form with id '${id}' not found.`;
          } else if (response.status === 401) {
            errorMessage +=
              '\nError: Unauthorized. Your token might be expired or invalid or missing update:branding scope.';
          } else if (response.status === 422) {
            errorMessage +=
              '\nError: Validation errors in your request. Check that your parameters are valid.';
          }

          return createErrorResponse(errorMessage);
        }

        // Parse the response
        const updatedForm = (await response.json()) as Auth0Form;

        log(`Successfully updated form: ${updatedForm.name} (${updatedForm.id})`);

        return createSuccessResponse(updatedForm);
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
  auth0_delete_form: async (
    request: HandlerRequest,
    config: HandlerConfig
  ): Promise<HandlerResponse> => {
    try {
      const id = request.parameters.id;
      if (!id) {
        return createErrorResponse('Error: id is required');
      }

      // API URL for deleting a form
      const apiUrl = `https://${config.domain}/api/v2/branding/forms/${id}`;
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

          let errorMessage = `Failed to delete form: ${response.status} ${response.statusText}`;

          if (response.status === 404) {
            errorMessage = `Form with id '${id}' not found.`;
          } else if (response.status === 401) {
            errorMessage +=
              '\nError: Unauthorized. Your token might be expired or invalid or missing delete:branding scope.';
          }

          return createErrorResponse(errorMessage);
        }

        log(`Successfully deleted form with id: ${id}`);

        return createSuccessResponse({
          message: `Form with id '${id}' has been deleted.`,
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
  auth0_publish_form: async (
    request: HandlerRequest,
    config: HandlerConfig
  ): Promise<HandlerResponse> => {
    try {
      const id = request.parameters.id;
      if (!id) {
        return createErrorResponse('Error: id is required');
      }

      // API URL for publishing a form
      const apiUrl = `https://${config.domain}/api/v2/branding/forms/${id}/publish`;
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

          let errorMessage = `Failed to publish form: ${response.status} ${response.statusText}`;

          if (response.status === 404) {
            errorMessage = `Form with id '${id}' not found.`;
          } else if (response.status === 401) {
            errorMessage +=
              '\nError: Unauthorized. Your token might be expired or invalid or missing update:branding scope.';
          } else if (response.status === 422) {
            errorMessage += '\nError: The form has validation errors and cannot be published.';
          }

          return createErrorResponse(errorMessage);
        }

        // Parse the response (publish returns the updated form)
        const publishedForm = (await response.json()) as Auth0Form;

        log(`Successfully published form: ${publishedForm.name} (${publishedForm.id})`);

        return createSuccessResponse(publishedForm);
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
