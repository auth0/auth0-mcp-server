import type { HandlerConfig, HandlerRequest, HandlerResponse, Tool } from '../utils/types.js';
import { log } from '../utils/logger.js';
import { createErrorResponse, createSuccessResponse } from '../utils/http-utility.js';
import type { Auth0Config } from '../utils/config.js';
import { getManagementClient } from '../utils/management-client.js';
import type { PostFormsRequest } from 'auth0/dist/cjs/management/index.js';

// Define all available form tools
export const FORM_TOOLS: Tool[] = [
  {
    name: 'auth0_list_forms',
    description: 'List all forms in the Auth0 tenant',
    inputSchema: {
      type: 'object',
      properties: {
        page: { type: 'number', description: 'Page number (0-based)' },
        per_page: { type: 'number', description: 'Number of forms per page default:50' },
        include_totals: { type: 'boolean', description: 'Include total count' },
      },
    },
    _meta: {
      requiredScopes: ['read:forms'],
    },
    annotations: {
      title: 'List Auth0 Forms',
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
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
    _meta: {
      requiredScopes: ['read:forms'],
    },
    annotations: {
      title: 'Get Auth0 Form Details',
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
  },
  {
    name: 'auth0_create_form',
    description: 'Create a new Auth0 form',
    inputSchema: {
      type: 'object',
      properties: {
        name: {
          type: 'string',
          description: 'Name of the form. Required.',
        },
        messages: {
          type: 'object',
          description: 'Message settings for the form',
        },
        languages: {
          type: 'object',
          description: 'Language settings for the form',
        },
        translations: {
          type: 'object',
          description: 'Translations for form content',
        },
        nodes: {
          type: 'array',
          description: 'Nodes defining form structure and behavior',
          items: {
            type: 'object',
          },
        },
        start: {
          type: 'object',
          description: 'Settings for form start configuration',
        },
        ending: {
          type: 'object',
          description: 'Settings for form completion',
        },
        style: {
          type: 'object',
          description: 'Style settings for the form',
        },
      },
      required: ['name'],
    },
    _meta: {
      requiredScopes: ['create:forms'],
    },
    annotations: {
      title: 'Create Auth0 Form',
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: false,
    },
  },
  {
    name: 'auth0_update_form',
    description: 'Update an existing Auth0 form',
    inputSchema: {
      type: 'object',
      properties: {
        id: {
          type: 'string',
          description: 'ID of the form to update. Required.',
        },
        name: {
          type: 'string',
          description: 'Name of the form',
        },
        messages: {
          type: 'object',
          description: 'Message settings for the form',
        },
        languages: {
          type: 'object',
          description: 'Language settings for the form',
        },
        translations: {
          type: 'object',
          description: 'Translations for form content',
        },
        nodes: {
          type: 'array',
          description: 'Nodes defining form structure and behavior',
          items: {
            type: 'object',
          },
        },
        start: {
          type: 'object',
          description: 'Settings for form start configuration',
        },
        ending: {
          type: 'object',
          description: 'Settings for form completion',
        },
        style: {
          type: 'object',
          description: 'Style settings for the form',
        },
      },
      required: ['id'],
    },
    _meta: {
      requiredScopes: ['update:forms'],
    },
    annotations: {
      title: 'Update Auth0 Form',
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: true,
      openWorldHint: false,
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

      if (request.parameters.page !== undefined) {
        options.page = request.parameters.page;
      }

      if (request.parameters.per_page !== undefined) {
        options.per_page = request.parameters.per_page;
      } else {
        // Default to 50 forms per page
        options.per_page = 50;
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

        log(`Fetching forms with supplied options`);

        // Use the Auth0 SDK to get all forms
        const { data: responseData } = await managementClient.forms.getAll(options);

        // Handle different response formats

        log(`Successfully retrieved forms`);

        if (!responseData) {
          return createSuccessResponse({
            message: 'No forms found matching your criteria.',
            forms: [],
          });
        }

        return createSuccessResponse(responseData);
      } catch (sdkError: any) {
        // Handle SDK errors
        log('Auth0 SDK error');

        let errorMessage = `Failed to list forms: ${sdkError.message || 'Unknown error'}`;

        // Add context based on common error codes
        if (sdkError.statusCode === 401) {
          errorMessage +=
            '\nError: Unauthorized. Your token might be expired or invalid or missing read:branding scope.';
        } else if (sdkError.statusCode === 403) {
          errorMessage +=
            '\nError: Forbidden. Your token might not have the required scopes (read:branding).';
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
  auth0_get_form: async (
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

        log(`Fetching form with ID: ${id}`);

        // Use the Auth0 SDK to get a specific form
        const { data: form } = await managementClient.forms.get({ id });

        log(`Successfully retrieved form: ${(form as any).name} (${(form as any).id})`);

        return createSuccessResponse(form as any);
      } catch (sdkError: any) {
        // Handle SDK errors
        log('Auth0 SDK error');

        let errorMessage = `Failed to get form: ${sdkError.message || 'Unknown error'}`;

        // Add context based on common error codes
        if (sdkError.statusCode === 404) {
          errorMessage = `Form with id '${id}' not found.`;
        } else if (sdkError.statusCode === 401) {
          errorMessage +=
            '\nError: Unauthorized. Your token might be expired or invalid or missing read:branding scope.';
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
  auth0_create_form: async (
    request: HandlerRequest,
    config: HandlerConfig
  ): Promise<HandlerResponse> => {
    try {
      const { name, messages, languages, translations, nodes, start, ending, style } =
        request.parameters;

      if (!name) {
        return createErrorResponse('Error: name is required');
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

      // Prepare request body with required properties according to PostFormsRequest interface
      const formData: PostFormsRequest = {
        name: name,
      };

      // Add optional properties if defined
      if (messages !== undefined) formData.messages = messages;
      if (languages !== undefined) formData.languages = languages;
      if (translations !== undefined) formData.translations = translations;
      if (nodes !== undefined) formData.nodes = nodes;
      if (start !== undefined) formData.start = start;
      if (ending !== undefined) formData.ending = ending;
      if (style !== undefined) formData.style = style;

      try {
        const managementClientConfig: Auth0Config = {
          domain: config.domain,
          token: request.token,
        };
        const managementClient = await getManagementClient(managementClientConfig);

        log(`Creating new form with name: ${name}`);

        // Use the Auth0 SDK to create a form
        const newForm = await managementClient.forms.create(formData);

        log(
          `Successfully created form: ${(newForm as any).name || name} (${(newForm as any).id || 'new form'})`
        );

        return createSuccessResponse(newForm as any);
      } catch (sdkError: any) {
        // Handle SDK errors
        log('Auth0 SDK error');

        let errorMessage = `Failed to create form: ${sdkError.message || 'Unknown error'}`;

        // Add context based on common error codes
        if (sdkError.statusCode === 401) {
          errorMessage +=
            '\nError: Unauthorized. Your token might be expired or invalid or missing create:branding scope.';
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
  auth0_update_form: async (
    request: HandlerRequest,
    config: HandlerConfig
  ): Promise<HandlerResponse> => {
    try {
      const { id, name, messages, languages, translations, nodes, start, ending, style } =
        request.parameters;

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

      // Prepare request body - partial PostFormsRequest
      const updateData: Partial<PostFormsRequest> = {};

      // Add properties if defined
      if (name !== undefined) updateData.name = name;
      if (messages !== undefined) updateData.messages = messages;
      if (languages !== undefined) updateData.languages = languages;
      if (translations !== undefined) updateData.translations = translations;
      if (nodes !== undefined) updateData.nodes = nodes;
      if (start !== undefined) updateData.start = start;
      if (ending !== undefined) updateData.ending = ending;
      if (style !== undefined) updateData.style = style;

      try {
        const managementClientConfig: Auth0Config = {
          domain: config.domain,
          token: request.token,
        };
        const managementClient = await getManagementClient(managementClientConfig);

        log(`Updating form with ID: ${id}`);

        // Use the Auth0 SDK to update a form
        const { data: updatedForm } = await managementClient.forms.update({ id }, updateData);

        log(
          `Successfully updated form: ${updatedForm.name || 'Unknown'} (${updatedForm.id || id})`
        );

        return createSuccessResponse(updatedForm);
      } catch (sdkError: any) {
        // Handle SDK errors
        log('Auth0 SDK error');

        let errorMessage = `Failed to update form: ${sdkError.message || 'Unknown error'}`;

        // Add context based on common error codes
        if (sdkError.statusCode === 404) {
          errorMessage = `Form with id '${id}' not found.`;
        } else if (sdkError.statusCode === 401) {
          errorMessage +=
            '\nError: Unauthorized. Your token might be expired or invalid or missing update:branding scope.';
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
};
