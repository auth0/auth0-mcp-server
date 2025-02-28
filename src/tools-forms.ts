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
      if (!config.domain) {
        log('Error: AUTH0_DOMAIN environment variable is not set');
        return createErrorResponse('Error: AUTH0_DOMAIN environment variable is not set');
      }

      // Ensure domain is properly formatted
      const domain = formatDomain(config.domain);

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
      const apiUrl = `https://${domain}/api/v2/branding/forms?${params.toString()}`;
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
          return {
            toolResult: {
              content: [
                {
                  type: 'text',
                  text: 'No forms found matching your criteria.',
                },
              ],
              isError: false,
            },
          };
        }

        // Format forms in a readable way
        let resultText = `### Auth0 Forms (${forms.length}${total > forms.length ? ' of ' + total : ''})\n\n`;
        resultText += '| Name | Type | Status | Published |\n';
        resultText += '|------|------|--------|----------|\n';

        forms.forEach(form => {
          const name = form.name || 'Unnamed Form';
          const type = form.type || '-';
          const status = form.status || '-';
          const published = form.is_published ? '✅' : '❌';

          resultText += `| ${name} | ${type} | ${status} | ${published} |\n`;
        });

        // Add pagination info if there are more forms
        if (forms.length < total) {
          const currentPage = request.parameters.page || 0;
          const perPage = request.parameters.per_page || 10;
          const totalPages = Math.ceil(total / perPage);

          resultText += `\n*Page ${currentPage + 1} of ${totalPages} (${forms.length} of ${total} forms)*\n`;

          if (currentPage + 1 < totalPages) {
            resultText += `\nTo see more forms, use: \`auth0_list_forms(page=${currentPage + 1}`;

            if (request.parameters.type) {
              resultText += `, type="${request.parameters.type}"`;
            }

            resultText += `)\`\n`;
          }
        }

        // Add note about viewing details
        if (forms.length > 0) {
          resultText += `\nTo view details of a specific form, use: \`auth0_get_form(id="form_id")\`\n`;
        }

        // Add Form IDs for Reference
        if (forms.length > 0) {
          resultText += '\n### Form IDs for Reference\n\n';
          forms.forEach(form => {
            resultText += `- **${form.name}**: \`${form.id}\`\n`;
          });
        }

        log(`Successfully retrieved ${forms.length} forms`);

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
  auth0_get_form: async (
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

      // API URL for getting a form
      const apiUrl = `https://${domain}/api/v2/branding/forms/${id}`;
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

        // Format form details in markdown
        let resultText = `### Form: ${form.name}\n\n`;
        resultText += `- **ID**: ${form.id}\n`;
        resultText += `- **Type**: ${form.type || 'Not specified'}\n`;
        resultText += `- **Status**: ${form.status || 'Unknown'}\n`;
        resultText += `- **Published**: ${form.is_published ? 'Yes' : 'No'}\n`;

        if (form.client_id) {
          resultText += `- **Client ID**: ${form.client_id}\n`;
        }

        if (form.template_id) {
          resultText += `- **Template ID**: ${form.template_id}\n`;
        }

        resultText += '\n';

        // Add form content if available
        if (form.content) {
          resultText += `#### Form Content\n\n`;
          resultText += '```json\n';
          resultText += JSON.stringify(form.content, null, 2);
          resultText += '\n```\n\n';
        }

        // Add actions that can be performed on this form
        resultText += `#### Available Actions\n\n`;
        resultText += `- Update this form: \`auth0_update_form(id="${form.id}", ...)\`\n`;
        resultText += `- Delete this form: \`auth0_delete_form(id="${form.id}")\`\n`;

        if (!form.is_published) {
          resultText += `- Publish this form: \`auth0_publish_form(id="${form.id}")\`\n`;
        }

        log(`Successfully retrieved form: ${form.name} (${form.id})`);

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
  auth0_create_form: async (
    request: HandlerRequest,
    config: HandlerConfig
  ): Promise<HandlerResponse> => {
    try {
      if (!config.domain) {
        return createErrorResponse('Error: AUTH0_DOMAIN environment variable is not set');
      }

      const { name, type, template_id, client_id, content } = request.parameters;

      if (!name) {
        return createErrorResponse('Error: name is required');
      }

      if (!type) {
        return createErrorResponse('Error: type is required');
      }

      // Ensure domain is properly formatted
      const domain = formatDomain(config.domain);

      // API URL for creating a form
      const apiUrl = `https://${domain}/api/v2/branding/forms`;
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

        // Format form details in markdown
        let resultText = `### Form Created Successfully\n\n`;
        resultText += `- **Name**: ${newForm.name}\n`;
        resultText += `- **ID**: ${newForm.id}\n`;
        resultText += `- **Type**: ${newForm.type}\n`;
        resultText += `- **Status**: ${newForm.status || 'Draft'}\n`;

        if (newForm.client_id) {
          resultText += `- **Client ID**: ${newForm.client_id}\n`;
        }

        if (newForm.template_id) {
          resultText += `- **Template ID**: ${newForm.template_id}\n`;
        }

        resultText += '\n';

        // Add note about publishing
        resultText += `⚠️ **Note**: The form has been created but is not published yet. Use \`auth0_publish_form(id="${newForm.id}")\` to publish it.\n\n`;

        log(`Successfully created form: ${newForm.name} (${newForm.id})`);

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
  auth0_update_form: async (
    request: HandlerRequest,
    config: HandlerConfig
  ): Promise<HandlerResponse> => {
    try {
      if (!config.domain) {
        return createErrorResponse('Error: AUTH0_DOMAIN environment variable is not set');
      }

      const { id, name, content } = request.parameters;

      if (!id) {
        return createErrorResponse('Error: id is required');
      }

      // Ensure domain is properly formatted
      const domain = formatDomain(config.domain);

      // API URL for updating a form
      const apiUrl = `https://${domain}/api/v2/branding/forms/${id}`;
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

        // Format form details in markdown
        let resultText = `### Form Updated Successfully\n\n`;
        resultText += `- **Name**: ${updatedForm.name}\n`;
        resultText += `- **ID**: ${updatedForm.id}\n`;
        resultText += `- **Type**: ${updatedForm.type}\n`;
        resultText += `- **Status**: ${updatedForm.status || 'Draft'}\n`;
        resultText += `- **Published**: ${updatedForm.is_published ? 'Yes' : 'No'}\n\n`;

        // Add note about publishing if not published
        if (!updatedForm.is_published) {
          resultText += `⚠️ **Note**: The form has been updated but changes are not published. Use \`auth0_publish_form(id="${updatedForm.id}")\` to publish the changes.\n\n`;
        }

        log(`Successfully updated form: ${updatedForm.name} (${updatedForm.id})`);

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
  auth0_delete_form: async (
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

      // API URL for deleting a form
      const apiUrl = `https://${domain}/api/v2/branding/forms/${id}`;
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

        // Delete operations typically return 204 No Content
        let resultText = `### Form Deleted Successfully\n\n`;
        resultText += `Form with id '${id}' has been deleted.`;

        log(`Successfully deleted form with id: ${id}`);

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
  auth0_publish_form: async (
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

      // API URL for publishing a form
      const apiUrl = `https://${domain}/api/v2/branding/forms/${id}/publish`;
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

        // Format form details in markdown
        let resultText = `### Form Published Successfully\n\n`;
        resultText += `- **Name**: ${publishedForm.name}\n`;
        resultText += `- **ID**: ${publishedForm.id}\n`;
        resultText += `- **Type**: ${publishedForm.type}\n`;
        resultText += `- **Status**: ${publishedForm.status || 'Published'}\n`;
        resultText += `- **Published**: ${publishedForm.is_published ? 'Yes' : 'No'}\n\n`;

        log(`Successfully published form: ${publishedForm.name} (${publishedForm.id})`);

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
