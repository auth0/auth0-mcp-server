import { HandlerConfig, HandlerRequest, HandlerResponse, Tool } from '../utils/types.js';
import { log } from '../utils/logger.js';
import { createErrorResponse, createSuccessResponse } from '../utils/http-utility.js';
import { Auth0Config } from '../utils/config.js';
import { getManagementClient } from '../utils/management-client.js';
import {
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
        name: {
          type: 'string',
          description: 'Name of the application. Required.',
        },
      },
      required: ['name'],
    },
  },
  {
    name: 'auth0_update_application',
    description: 'Update an existing Auth0 application',
    inputSchema: {
      type: 'object',
      properties: {
        id: {
          type: 'string',
          description: 'Client ID of the application to update. Required.',
        },
        name: {
          type: 'string',
          description: 'New name of the application. Optional.',
        },
      },
      required: ['id'],
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
        const responseData = await managementClient.clients.getAll(options);

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
        } else if (
          responseData &&
          typeof responseData === 'object' &&
          'clients' in responseData &&
          Array.isArray(responseData.clients)
        ) {
          // When include_totals is true, response has pagination info
          applications = responseData.clients;

          // Access pagination metadata if available
          if ('total' in responseData) {
            total = (responseData as any).total || applications.length;
          }

          if ('start' in responseData) {
            page = (responseData as any).start || 0;
          }

          if ('limit' in responseData) {
            perPage = (responseData as any).limit || applications.length;
          }

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
        log('Auth0 SDK error:', sdkError);

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
        log('Auth0 SDK error:', sdkError);

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

      if (!app_type) {
        return createErrorResponse('Error: app_type is required');
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
        app_type: app_type as ClientCreateAppTypeEnum,
      };

      // Add all optional parameters if they exist
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
        const newApplication = await managementClient.clients.create(clientData);

        // Use type assertion to access properties
        const appData = newApplication as any;
        log(
          `Successfully created application: ${appData.name || name} (${appData.client_id || 'new client'})`
        );

        return createSuccessResponse(newApplication);
      } catch (sdkError: any) {
        // Handle SDK errors
        log('Auth0 SDK error:', sdkError);

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
        log('Auth0 SDK error:', sdkError);

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

      // Add search query
      if (searchName.includes(' ') || /[^a-zA-Z0-9]/.test(searchName)) {
        // If the search name contains spaces or special characters, use exact match
        options.q = `name:"${searchName.replace(/"/g, '\\"')}"`;
      } else {
        // For simple terms, use a prefix search
        options.q = `name:${searchName}*`;
      }

      // Make sure we're using the right search engine
      options.search_engine = 'v3';

      if (request.parameters.page !== undefined) {
        options.page = request.parameters.page;
      }

      if (request.parameters.per_page !== undefined) {
        options.per_page = request.parameters.per_page;
      } else {
        // Default to 10 applications per page
        options.per_page = 10;
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

        log(`Searching for applications with query: ${options.q}`);

        // Use the Auth0 SDK to search for clients
        const responseData = await managementClient.clients.getAll(options);

        // Handle different response formats
        let applications: any[] = [];
        let total = 0;
        let page = 0;
        let perPage = options.per_page || 10;

        if (Array.isArray(responseData)) {
          // Simple array response
          applications = responseData;
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
          page = (responseData as any).start || 0;
          perPage = (responseData as any).limit || applications.length;
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
      } catch (sdkError: any) {
        // Handle SDK errors
        log('Auth0 SDK error:', sdkError);

        let errorMessage = `Failed to search applications: ${sdkError.message || 'Unknown error'}`;

        // Add context based on common error codes
        if (sdkError.statusCode === 401) {
          errorMessage +=
            '\nError: Unauthorized. Your token might be expired or invalid or missing read:clients scope.';
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
