import type { HandlerConfig, HandlerRequest, HandlerResponse, Tool } from '../utils/types.js';
import { log } from '../utils/logger.js';
import { createErrorResponse, createSuccessResponse } from '../utils/http-utility.js';
import type { Auth0Config } from '../utils/config.js';
import { getManagementClient } from '../utils/management-client.js';
import type {
  ClientCreateTokenEndpointAuthMethodEnum,
  ClientCreateAppTypeEnum,
  ClientCreateOrganizationUsageEnum,
  ClientCreateOrganizationRequireBehaviorEnum,
  ClientCreateComplianceLevelEnum,
  ClientCreate,
  ClientUpdate,
} from 'auth0';

// Define all available application tools
export const APPLICATION_TOOLS: Tool[] = [
  {
    name: 'auth0_list_applications',
    description: 'List all applications in the Auth0 tenant or search by name',
    inputSchema: {
      type: 'object',
      properties: {
        page: { type: 'number', description: 'Page number (0-based)' },
        per_page: { type: 'number', description: 'Number of applications per page' },
        include_totals: { type: 'boolean', description: 'Include total count' },
      },
    },
    _meta: {
      requiredScopes: ['read:clients'],
      readOnly: true,
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
    _meta: {
      requiredScopes: ['read:clients'],
      readOnly: true,
    },
  },
  {
    name: 'auth0_create_application',
    description: 'Create a new Auth0 application',
    inputSchema: {
      type: 'object',
      properties: {
        name: {
          type: 'string',
          description:
            'Name of the application (min length: 1 character, does not allow < or >). Required.',
        },
        app_type: {
          type: 'string',
          enum: ['spa', 'native', 'non_interactive', 'regular_web'],
          description: 'Type of client used to determine which settings are applicable.',
        },
        description: {
          type: 'string',
          description: 'Free text description of this client (max length: 140 characters).',
        },
        callbacks: {
          type: 'array',
          items: { type: 'string' },
          description: 'URLs whitelisted for Auth0 to use as callback after authentication.',
        },
        allowed_origins: {
          type: 'array',
          items: { type: 'string' },
          description:
            'URLs allowed to make requests from JavaScript to Auth0 API (typically used with CORS).',
        },
        allowed_clients: {
          type: 'array',
          items: { type: 'string' },
          description: 'List of allowed clients and API ids for delegation requests.',
        },
        allowed_logout_urls: {
          type: 'array',
          items: { type: 'string' },
          description: 'URLs valid to redirect to after logout from Auth0.',
        },
        is_first_party: {
          type: 'boolean',
          description: 'Whether this client is a first party client.',
        },
        oidc_conformant: {
          type: 'boolean',
          description: 'Whether this client conforms to strict OIDC specifications.',
        },
        sso_disabled: {
          type: 'boolean',
          description: 'Disable Single Sign On.',
        },
        cross_origin_authentication: {
          type: 'boolean',
          description: 'Whether this client can make cross-origin authentication requests.',
        },
        logo_uri: {
          type: 'string',
          description: 'URL of the logo to display (recommended size: 150x150 pixels).',
        },
        organization_usage: {
          type: 'string',
          enum: ['deny', 'allow', 'require'],
          description: 'How to proceed during authentication with regards to organization.',
        },
        organization_require_behavior: {
          type: 'string',
          enum: ['no_prompt', 'pre_login_prompt', 'post_login_prompt'],
          description: 'How to proceed during authentication when organization_usage is require.',
        },
      },
      required: ['name'],
    },
    _meta: {
      requiredScopes: ['create:clients'],
    },
  },
  {
    name: 'auth0_update_application',
    description: 'Update an existing Auth0 application',
    inputSchema: {
      type: 'object',
      properties: {
        client_id: {
          type: 'string',
          description: 'Client ID of the application to update. Required.',
        },
        name: {
          type: 'string',
          description: 'Name of the application (min length: 1 character, does not allow < or >)',
        },
        app_type: {
          type: 'string',
          enum: ['spa', 'native', 'non_interactive', 'regular_web'],
          description: 'Type of client used to determine which settings are applicable',
        },
        description: {
          type: 'string',
          description: 'Free text description of this client (max length: 140 characters)',
        },
        callbacks: {
          type: 'array',
          items: { type: 'string' },
          description: 'URLs whitelisted for Auth0 to use as callback after authentication',
        },
        allowed_origins: {
          type: 'array',
          items: { type: 'string' },
          description:
            'URLs allowed to make requests from JavaScript to Auth0 API (typically used with CORS)',
        },
        allowed_clients: {
          type: 'array',
          items: { type: 'string' },
          description: 'List of allowed clients and API ids for delegation requests',
        },
        allowed_logout_urls: {
          type: 'array',
          items: { type: 'string' },
          description: 'URLs valid to redirect to after logout from Auth0',
        },
        grant_types: {
          type: 'array',
          items: { type: 'string' },
          description: 'List of grant types for this client',
        },
        token_endpoint_auth_method: {
          type: 'string',
          enum: ['none', 'client_secret_post', 'client_secret_basic'],
          description: 'Client authentication method for the token endpoint',
        },
        is_first_party: {
          type: 'boolean',
          description: 'Whether this client is a first party client',
        },
        oidc_conformant: {
          type: 'boolean',
          description: 'Whether this client conforms to strict OIDC specifications',
        },
        sso_disabled: {
          type: 'boolean',
          description: 'Disable Single Sign On',
        },
        cross_origin_authentication: {
          type: 'boolean',
          description: 'Whether this client can make cross-origin authentication requests',
        },
        logo_uri: {
          type: 'string',
          description: 'URL of the logo to display (recommended size: 150x150 pixels)',
        },
        organization_usage: {
          type: 'string',
          enum: ['deny', 'allow', 'require'],
          description: 'How to proceed during authentication with regards to organization',
        },
        organization_require_behavior: {
          type: 'string',
          enum: ['no_prompt', 'pre_login_prompt', 'post_login_prompt'],
          description: 'How to proceed during authentication when organization_usage is require',
        },
        jwt_configuration: {
          type: 'object',
          description: 'JWT configuration settings',
        },
        refresh_token: {
          type: 'object',
          description: 'Refresh token configuration',
        },
        mobile: {
          type: 'object',
          description: 'Mobile app configuration settings',
        },
      },
      required: ['client_id'],
    },
    _meta: {
      requiredScopes: ['update:clients'],
    },
  },
];

interface Auth0Response {
  clients?: {
    client_id: string;
    name: string;
    app_type?: string;
    description?: string;
    callbacks?: string[];
  }[];
  total?: number;
  limit?: number;
  start?: number;
}

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
      if (!request.token) {
        log('Warning: Token is missing');
        return createErrorResponse('Error: Missing authentication token');
      }

      // Check if domain is configured
      if (!config.domain) {
        log('Error: Auth0 domain is not configured');
        return createErrorResponse('Error: Auth0 domain is not configured');
      }

      // Initialize the Auth0 Management API client

      // Build query parameters
      const options: Record<string, any> = {};
      if (request.parameters.page !== undefined) {
        options.page = request.parameters.page;
      }
      if (request.parameters.per_page !== undefined) {
        options.per_page = request.parameters.per_page;
      } else {
        // Default to 5 items per page if not specified
        options.per_page = 5;
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
        // Use the Auth0 SDK to get all clients
        const { data: responseData } = await managementClient.clients.getAll(options);

        let applications = [];
        let total = 0;
        let page = 0;
        let perPage = options.per_page || 5;
        let totalPages = 1;

        // Handle different response formats based on include_totals option
        if (responseData && Array.isArray(responseData)) {
          // When include_totals is false, response is an array of clients
          applications = responseData;
          total = applications.length;
        } else if (responseData && typeof responseData === 'object' && 'clients' in responseData) {
          // When include_totals is true, response has pagination info
          const typedResponse = responseData as Auth0Response;
          applications = typedResponse.clients || [];

          // Access pagination metadata if available
          total = typedResponse.total || applications.length;
          page = typedResponse.start || 0;
          perPage = typedResponse.limit || applications.length;

          totalPages = Math.ceil(total / perPage);
        } else {
          log('Invalid response format from Auth0 SDK');
          return createErrorResponse('Error: Received invalid response format from Auth0 API.');
        }

        // Format applications list
        const formattedApplications = applications.map((app) => ({
          id: app.client_id,
          name: app.name,
          type: app.app_type || 'Unknown',
          description: app.description || '-',
          domain: app.callbacks?.length ? app.callbacks[0].split('/')[2] : '-',
        }));

        log(
          `Successfully retrieved ${formattedApplications.length} applications (page ${page + 1} of ${totalPages}, total: ${total})`
        );

        return createSuccessResponse(formattedApplications);
      } catch (sdkError: any) {
        // Handle SDK errors
        log('Auth0 SDK error');

        let errorMessage = `Failed to list applications: ${sdkError.message || 'Unknown error'}`;

        // Add context based on common error scenarios
        if (sdkError.statusCode === 401) {
          errorMessage +=
            '\nError: Unauthorized. Your token might be expired or invalid. Try running "npx @auth0/auth0-mcp-server init" to refresh your token.';
        } else if (sdkError.statusCode === 403) {
          errorMessage +=
            '\nError: Forbidden. Your token might not have the required scopes (read:clients). Try running "npx @auth0/auth0-mcp-server init" to check the proper permissions.';
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
  auth0_get_application: async (
    request: HandlerRequest,
    config: HandlerConfig
  ): Promise<HandlerResponse> => {
    try {
      const clientId = request.parameters.client_id;
      if (!clientId) {
        return createErrorResponse('Error: client_id is required');
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

        log(`Fetching client with ID: ${clientId}`);

        // Use the Auth0 SDK to get a specific client
        const application = await managementClient.clients.get({ client_id: clientId });

        // Ensure we have the required properties
        if (!application || typeof application !== 'object') {
          log('Invalid response from Auth0 SDK');
          return createErrorResponse('Error: Received invalid response from Auth0 API');
        }

        // Use type assertion to access properties
        const appData = application as any;
        log(
          `Successfully retrieved application: ${appData.name || 'Unknown'} (${appData.client_id || clientId})`
        );

        return createSuccessResponse(application);
      } catch (sdkError: any) {
        // Handle SDK errors
        log('Auth0 SDK error');

        let errorMessage = `Failed to get application: ${sdkError.message || 'Unknown error'}`;

        // Add context based on common error codes
        if (sdkError.statusCode === 404) {
          errorMessage = `Application with client_id '${clientId}' not found.`;
        } else if (sdkError.statusCode === 401) {
          errorMessage +=
            '\nError: Unauthorized. Your token might be expired or invalid or missing read:clients scope.';
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
  auth0_create_application: async (
    request: HandlerRequest,
    config: HandlerConfig
  ): Promise<HandlerResponse> => {
    try {
      const {
        name,
        description,
        logo_uri,
        callbacks,
        oidc_logout,
        allowed_origins,
        web_origins,
        client_aliases,
        allowed_clients,
        allowed_logout_urls,
        grant_types,
        token_endpoint_auth_method,
        app_type,
        is_first_party,
        oidc_conformant,
        jwt_configuration,
        encryption_key,
        sso,
        cross_origin_authentication,
        cross_origin_loc,
        sso_disabled,
        custom_login_page_on,
        custom_login_page,
        custom_login_page_preview,
        form_template,
        addons,
        client_metadata,
        mobile,
        initiate_login_uri,
        native_social_login,
        refresh_token,
        organization_usage,
        organization_require_behavior,
        client_authentication_methods,
        require_pushed_authorization_requests,
        signed_request_object,
        require_proof_of_possession,
        compliance_level,
      } = request.parameters;

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

      // Prepare request body with all available parameters
      const clientData: ClientCreate = {
        name,
      };

      // Add all optional parameters if they exist
      if (app_type !== undefined) clientData.app_type = app_type as ClientCreateAppTypeEnum;
      if (description !== undefined) clientData.description = description;
      if (logo_uri !== undefined) clientData.logo_uri = logo_uri;
      if (callbacks !== undefined) clientData.callbacks = callbacks;
      if (oidc_logout !== undefined) clientData.oidc_logout = oidc_logout;
      if (allowed_origins !== undefined) clientData.allowed_origins = allowed_origins;
      if (web_origins !== undefined) clientData.web_origins = web_origins;
      if (client_aliases !== undefined) clientData.client_aliases = client_aliases;
      if (allowed_clients !== undefined) clientData.allowed_clients = allowed_clients;
      if (allowed_logout_urls !== undefined) clientData.allowed_logout_urls = allowed_logout_urls;
      if (grant_types !== undefined) clientData.grant_types = grant_types;
      if (token_endpoint_auth_method !== undefined)
        clientData.token_endpoint_auth_method =
          token_endpoint_auth_method as ClientCreateTokenEndpointAuthMethodEnum;
      if (is_first_party !== undefined) clientData.is_first_party = is_first_party;
      if (oidc_conformant !== undefined) clientData.oidc_conformant = oidc_conformant;
      if (jwt_configuration !== undefined) clientData.jwt_configuration = jwt_configuration;
      if (encryption_key !== undefined) clientData.encryption_key = encryption_key;
      if (sso !== undefined) clientData.sso = sso;
      if (cross_origin_authentication !== undefined)
        clientData.cross_origin_authentication = cross_origin_authentication;
      if (cross_origin_loc !== undefined) clientData.cross_origin_loc = cross_origin_loc;
      if (sso_disabled !== undefined) clientData.sso_disabled = sso_disabled;
      if (custom_login_page_on !== undefined)
        clientData.custom_login_page_on = custom_login_page_on;
      if (custom_login_page !== undefined) clientData.custom_login_page = custom_login_page;
      if (custom_login_page_preview !== undefined)
        clientData.custom_login_page_preview = custom_login_page_preview;
      if (form_template !== undefined) clientData.form_template = form_template;
      if (addons !== undefined) clientData.addons = addons;
      if (client_metadata !== undefined) clientData.client_metadata = client_metadata;
      if (mobile !== undefined) clientData.mobile = mobile;
      if (initiate_login_uri !== undefined) clientData.initiate_login_uri = initiate_login_uri;
      if (native_social_login !== undefined) clientData.native_social_login = native_social_login;
      if (refresh_token !== undefined) clientData.refresh_token = refresh_token;
      if (organization_usage !== undefined)
        clientData.organization_usage = organization_usage as ClientCreateOrganizationUsageEnum;
      if (organization_require_behavior !== undefined)
        clientData.organization_require_behavior =
          organization_require_behavior as ClientCreateOrganizationRequireBehaviorEnum;
      if (client_authentication_methods !== undefined)
        clientData.client_authentication_methods = client_authentication_methods;
      if (require_pushed_authorization_requests !== undefined)
        clientData.require_pushed_authorization_requests = require_pushed_authorization_requests;
      if (signed_request_object !== undefined)
        clientData.signed_request_object = signed_request_object;
      if (require_proof_of_possession !== undefined)
        clientData.require_proof_of_possession = require_proof_of_possession;
      if (compliance_level !== undefined)
        clientData.compliance_level = compliance_level as ClientCreateComplianceLevelEnum;

      try {
        const managementClientConfig: Auth0Config = {
          domain: config.domain,
          token: request.token,
        };
        const managementClient = await getManagementClient(managementClientConfig);

        log(`Creating new application with name: ${name}, type: ${app_type}`);

        // Use the Auth0 SDK to create a client
        const { data: newApplication } = await managementClient.clients.create(clientData);

        // Use type assertion to access properties
        const appData = newApplication as any;
        log(
          `Successfully created application: ${appData.name || name} (${appData.client_id || 'new client'})`
        );

        return createSuccessResponse(newApplication);
      } catch (sdkError: any) {
        // Handle SDK errors
        log('Auth0 SDK error');

        let errorMessage = `Failed to create application: ${sdkError.message || 'Unknown error'}`;

        // Add context based on common error codes
        if (sdkError.statusCode === 401) {
          errorMessage +=
            '\nError: Unauthorized. Your token might be expired or invalid or missing create:clients scope.';
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
  auth0_update_application: async (
    request: HandlerRequest,
    config: HandlerConfig
  ): Promise<HandlerResponse> => {
    try {
      const clientId = request.parameters.client_id;
      if (!clientId) {
        return createErrorResponse('Error: client_id is required');
      }

      // Extract all possible parameters to update
      const {
        name,
        description,
        logo_uri,
        callbacks,
        oidc_logout,
        allowed_origins,
        web_origins,
        client_aliases,
        allowed_clients,
        allowed_logout_urls,
        grant_types,
        token_endpoint_auth_method,
        app_type,
        is_first_party,
        oidc_conformant,
        jwt_configuration,
        encryption_key,
        sso,
        cross_origin_authentication,
        cross_origin_loc,
        sso_disabled,
        custom_login_page_on,
        custom_login_page,
        custom_login_page_preview,
        form_template,
        addons,
        client_metadata,
        mobile,
        initiate_login_uri,
        native_social_login,
        refresh_token,
        organization_usage,
        organization_require_behavior,
        client_authentication_methods,
        require_pushed_authorization_requests,
        signed_request_object,
        require_proof_of_possession,
        compliance_level,
      } = request.parameters;

      // Prepare update body, only including fields that are present
      const updateData: ClientUpdate = {};
      if (name !== undefined) updateData.name = name;
      if (description !== undefined) updateData.description = description;
      if (logo_uri !== undefined) updateData.logo_uri = logo_uri;
      if (callbacks !== undefined) updateData.callbacks = callbacks;
      if (oidc_logout !== undefined) updateData.oidc_logout = oidc_logout;
      if (allowed_origins !== undefined) updateData.allowed_origins = allowed_origins;
      if (web_origins !== undefined) updateData.web_origins = web_origins;
      if (client_aliases !== undefined) updateData.client_aliases = client_aliases;
      if (allowed_clients !== undefined) updateData.allowed_clients = allowed_clients;
      if (allowed_logout_urls !== undefined) updateData.allowed_logout_urls = allowed_logout_urls;
      if (grant_types !== undefined) updateData.grant_types = grant_types;
      if (token_endpoint_auth_method !== undefined)
        updateData.token_endpoint_auth_method =
          token_endpoint_auth_method as ClientCreateTokenEndpointAuthMethodEnum;
      if (app_type !== undefined) updateData.app_type = app_type as ClientCreateAppTypeEnum;
      if (is_first_party !== undefined) updateData.is_first_party = is_first_party;
      if (oidc_conformant !== undefined) updateData.oidc_conformant = oidc_conformant;
      if (jwt_configuration !== undefined) updateData.jwt_configuration = jwt_configuration;
      if (encryption_key !== undefined) updateData.encryption_key = encryption_key;
      if (sso !== undefined) updateData.sso = sso;
      if (cross_origin_authentication !== undefined)
        updateData.cross_origin_authentication = cross_origin_authentication;
      if (cross_origin_loc !== undefined) updateData.cross_origin_loc = cross_origin_loc;
      if (sso_disabled !== undefined) updateData.sso_disabled = sso_disabled;
      if (custom_login_page_on !== undefined)
        updateData.custom_login_page_on = custom_login_page_on;
      if (custom_login_page !== undefined) updateData.custom_login_page = custom_login_page;
      if (custom_login_page_preview !== undefined)
        updateData.custom_login_page_preview = custom_login_page_preview;
      if (form_template !== undefined) updateData.form_template = form_template;
      if (addons !== undefined) updateData.addons = addons;
      if (client_metadata !== undefined) updateData.client_metadata = client_metadata;
      if (mobile !== undefined) updateData.mobile = mobile;
      if (initiate_login_uri !== undefined) updateData.initiate_login_uri = initiate_login_uri;
      if (native_social_login !== undefined) updateData.native_social_login = native_social_login;
      if (refresh_token !== undefined) updateData.refresh_token = refresh_token;
      if (organization_usage !== undefined)
        updateData.organization_usage = organization_usage as ClientCreateOrganizationUsageEnum;
      if (organization_require_behavior !== undefined)
        updateData.organization_require_behavior =
          organization_require_behavior as ClientCreateOrganizationRequireBehaviorEnum;
      if (client_authentication_methods !== undefined)
        updateData.client_authentication_methods = client_authentication_methods;
      if (require_pushed_authorization_requests !== undefined)
        updateData.require_pushed_authorization_requests = require_pushed_authorization_requests;
      if (signed_request_object !== undefined)
        updateData.signed_request_object = signed_request_object;
      if (require_proof_of_possession !== undefined)
        updateData.require_proof_of_possession = require_proof_of_possession;
      if (compliance_level !== undefined)
        updateData.compliance_level = compliance_level as ClientCreateComplianceLevelEnum;

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

        log(`Updating application with client_id: ${clientId}`);

        // Use the Auth0 SDK to update a client
        const updatedApplication = await managementClient.clients.update(
          { client_id: clientId },
          updateData
        );

        // Use type assertion to access properties
        const appData = updatedApplication as any;
        log(
          `Successfully updated application: ${appData.name || 'Unknown'} (${appData.client_id || clientId})`
        );

        return createSuccessResponse(updatedApplication);
      } catch (sdkError: any) {
        // Handle SDK errors
        log('Auth0 SDK error');

        let errorMessage = `Failed to update application: ${sdkError.message || 'Unknown error'}`;

        // Add context based on common error codes
        if (sdkError.statusCode === 404) {
          errorMessage = `Application with client_id '${clientId}' not found.`;
        } else if (sdkError.statusCode === 401) {
          errorMessage +=
            '\nError: Unauthorized. Your token might be expired or invalid or missing update:clients scope.';
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
