import type { ResourceServerCreate, ResourceServerUpdate } from 'auth0';
import type {
  Auth0PaginatedResponse,
  HandlerConfig,
  HandlerRequest,
  HandlerResponse,
  Tool,
} from '../utils/types.js';
import { log } from '../utils/logger.js';
import { createErrorResponse, createSuccessResponse } from '../utils/http-utility.js';
import type { Auth0Config } from '../utils/config.js';
import { getManagementClient } from '../utils/management-client.js';

// Define all available resource server tools
export const RESOURCE_SERVER_TOOLS: Tool[] = [
  {
    name: 'auth0_list_resource_servers',
    description: 'List all resource servers (APIs) in the Auth0 tenant',
    inputSchema: {
      type: 'object',
      properties: {
        page: { type: 'number', description: 'Page number (0-based)' },
        per_page: { type: 'number', description: 'Number of resource servers per page' },
        include_totals: { type: 'boolean', description: 'Include total count' },
        identifiers: {
          type: 'array',
          items: { type: 'string' },
          description:
            'A list of URI encoded identifiers to filter the results by. Consider URL limits when using this parameter.',
        },
        include_fields: {
          type: 'boolean',
          description: 'Whether specified fields are to be included (true) or excluded (false)',
        },
      },
    },
  },
  {
    name: 'auth0_get_resource_server',
    description: 'Get details about a specific Auth0 resource server',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'ID of the resource server to retrieve' },
      },
      required: ['id'],
    },
  },
  {
    name: 'auth0_create_resource_server',
    description: 'Create a new Auth0 resource server (API)',
    inputSchema: {
      type: 'object',
      properties: {
        name: {
          type: 'string',
          description: 'Friendly name for the resource server. Required.',
        },
        identifier: {
          type: 'string',
          description: 'Unique identifier for the API (e.g., https://api.example.com). Required.',
        },
        scopes: {
          type: 'array',
          description: 'List of permissions (scopes) that this API uses.',
          items: {
            type: 'object',
            properties: {
              value: { type: 'string' },
              description: { type: 'string' },
            },
          },
        },
        signing_alg: {
          type: 'string',
          description: 'Algorithm used to sign JWTs. Can be HS256 or RS256.',
          enum: ['HS256', 'RS256', 'PS256'],
        },
        signing_secret: {
          type: 'string',
          description: 'Secret used to sign tokens when using symmetric algorithms (HS256).',
        },
        allow_offline_access: {
          type: 'boolean',
          description: 'Whether refresh tokens can be issued for this API.',
        },
        token_lifetime: {
          type: 'number',
          description: 'Expiration value (in seconds) for access tokens.',
        },
        token_dialect: {
          type: 'string',
          description: 'Dialect of issued access token.',
        },
        skip_consent_for_verifiable_first_party_clients: {
          type: 'boolean',
          description: 'Whether to skip user consent for applications flagged as first party.',
        },
        enforce_policies: {
          type: 'boolean',
          description: 'Whether to enforce authorization policies.',
        },
        token_encryption: {
          type: 'object',
          description: 'Token encryption configuration.',
        },
        consent_policy: {
          type: 'string',
          description: 'Policy for obtaining consent.',
        },
        authorization_details: {
          type: 'array',
          description: 'Authorization details for the resource server.',
        },
        proof_of_possession: {
          type: 'object',
          description: 'Proof of possession configuration.',
        },
      },
      required: ['name', 'identifier'],
    },
  },
  {
    name: 'auth0_update_resource_server',
    description: 'Update an existing Auth0 resource server',
    inputSchema: {
      type: 'object',
      properties: {
        id: {
          type: 'string',
          description: 'ID of the resource server to update. Required.',
        },
        name: {
          type: 'string',
          description: 'New friendly name for the resource server.',
        },
        scopes: {
          type: 'array',
          description: 'List of permissions (scopes) that this API uses.',
          items: {
            type: 'object',
            properties: {
              value: { type: 'string' },
              description: { type: 'string' },
            },
          },
        },
        signing_alg: {
          type: 'string',
          description: 'Algorithm used to sign JWTs. Can be HS256 or RS256.',
          enum: ['HS256', 'RS256', 'PS256'],
        },
        signing_secret: {
          type: 'string',
          description: 'Secret used to sign tokens when using symmetric algorithms (HS256).',
        },
        allow_offline_access: {
          type: 'boolean',
          description: 'Whether refresh tokens can be issued for this API.',
        },
        token_lifetime: {
          type: 'number',
          description: 'Expiration value (in seconds) for access tokens.',
        },
        token_dialect: {
          type: 'string',
          description: 'Dialect of issued access token.',
        },
        skip_consent_for_verifiable_first_party_clients: {
          type: 'boolean',
          description: 'Whether to skip user consent for applications flagged as first party.',
        },
        enforce_policies: {
          type: 'boolean',
          description: 'Whether to enforce authorization policies.',
        },
        token_encryption: {
          type: 'object',
          description: 'Token encryption configuration.',
        },
        consent_policy: {
          type: 'string',
          description: 'Policy for obtaining consent.',
        },
        authorization_details: {
          type: 'array',
          description: 'Authorization details for the resource server.',
        },
        proof_of_possession: {
          type: 'object',
          description: 'Proof of possession configuration.',
        },
      },
      required: ['id'],
    },
  },
];

// Define handlers for each resource server tool
export const RESOURCE_SERVER_HANDLERS: Record<
  string,
  (request: HandlerRequest, config: HandlerConfig) => Promise<HandlerResponse>
> = {
  auth0_list_resource_servers: async (
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

      // Build query parameters
      const options: Record<string, any> = {};
      if (request.parameters.page !== undefined) {
        options.page = request.parameters.page;
      }
      if (request.parameters.per_page !== undefined) {
        options.per_page = request.parameters.per_page;
      } else {
        options.per_page = 5;
      }
      if (request.parameters.include_totals !== undefined) {
        options.include_totals = request.parameters.include_totals;
      } else {
        options.include_totals = true;
      }
      // Add new parameters
      if (request.parameters.identifiers !== undefined) {
        options.identifiers = request.parameters.identifiers;
      }
      if (request.parameters.include_fields !== undefined) {
        options.include_fields = request.parameters.include_fields;
      }

      try {
        const managementClientConfig: Auth0Config = {
          domain: config.domain,
          token: request.token,
        };
        const managementClient = await getManagementClient(managementClientConfig);

        log(`Fetching resource servers with options: ${JSON.stringify(options)}`);

        // Use the Auth0 SDK to get all resource servers
        const { data: responseData } = await managementClient.resourceServers.getAll(options);

        if (
          !responseData ||
          (typeof responseData === 'object' &&
            !('resource_servers' in responseData) &&
            !Array.isArray(responseData))
        ) {
          log('Invalid response format - missing resource_servers array');
          log('Response data:', responseData);

          return createErrorResponse(
            'Error: Received invalid response format from Auth0 API. The "resource_servers" array is missing or invalid.'
          );
        }

        // Format resource servers list
        const resourceServers = Array.isArray(responseData)
          ? responseData.map(formatResourceServer)
          : ((responseData as Auth0PaginatedResponse)?.resource_servers || []).map(
              formatResourceServer
            );

        // Get pagination info
        const total = Array.isArray(responseData)
          ? resourceServers.length
          : (responseData as Auth0PaginatedResponse)?.total || resourceServers.length;

        const page = Array.isArray(responseData)
          ? 0
          : (responseData as Auth0PaginatedResponse)?.page !== undefined
            ? (responseData as Auth0PaginatedResponse).page
            : 0;

        const perPage = Array.isArray(responseData)
          ? resourceServers.length
          : (responseData as Auth0PaginatedResponse)?.per_page || resourceServers.length;

        const totalPages = Math.ceil(total / perPage);

        log(
          `Successfully retrieved ${resourceServers.length} resource servers (page ${(page || 0) + 1} of ${totalPages}, total: ${total})`
        );

        // Create a result object with all the necessary information
        const result = {
          resource_servers: resourceServers,
          count: resourceServers.length,
          total: total,
          pagination: {
            page: page || 0,
            per_page: perPage,
            total_pages: totalPages,
            has_next: (page || 0) + 1 < totalPages,
          },
        };

        return createSuccessResponse(result);
      } catch (sdkError: any) {
        // Handle SDK errors
        log('Auth0 SDK error:', sdkError);

        let errorMessage = `Failed to list resource servers: ${sdkError.message || 'Unknown error'}`;

        // Add context based on common error scenarios
        if (sdkError.statusCode === 401) {
          errorMessage +=
            '\nError: Unauthorized. Your token might be expired or invalid. Try running "npx @auth0/auth0-mcp-server init" to refresh your token.';
        } else if (sdkError.statusCode === 403) {
          errorMessage +=
            '\nError: Forbidden. Your token might not have the required scopes (read:resource_servers). Try running "npx @auth0/auth0-mcp-server init" to check the proper permissions.';
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
  auth0_get_resource_server: async (
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

        log(`Fetching resource server with ID: ${id}`);

        // Use the Auth0 SDK to get a specific resource server
        const resourceServer = await managementClient.resourceServers.get({ id });

        log(
          `Successfully retrieved resource server: ${(resourceServer as any).name || 'Unknown'} (${(resourceServer as any).id || id})`
        );

        return createSuccessResponse(resourceServer);
      } catch (sdkError: any) {
        // Handle SDK errors
        log('Auth0 SDK error:', sdkError);

        let errorMessage = `Failed to get resource server: ${sdkError.message || 'Unknown error'}`;

        // Add context based on common error codes
        if (sdkError.statusCode === 404) {
          errorMessage = `Resource server with id '${id}' not found.`;
        } else if (sdkError.statusCode === 401) {
          errorMessage +=
            '\nError: Unauthorized. Your token might be expired or invalid or missing read:resource_servers scope.';
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
  auth0_create_resource_server: async (
    request: HandlerRequest,
    config: HandlerConfig
  ): Promise<HandlerResponse> => {
    try {
      // Get request parameters
      const {
        name,
        identifier,
        scopes,
        signing_alg,
        signing_secret,
        token_lifetime,
        allow_offline_access,
        token_dialect,
        skip_consent_for_verifiable_first_party_clients,
        enforce_policies,
        client,
        token_encryption,
        consent_policy,
        authorization_details,
        proof_of_possession,
      } = request.parameters;

      // Validate required fields
      if (!identifier) {
        return createErrorResponse('Error: identifier is required');
      }

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

      try {
        const managementClientConfig: Auth0Config = {
          domain: config.domain,
          token: request.token,
        };
        const managementClient = await getManagementClient(managementClientConfig);

        log(`Creating resource server with identifier: ${identifier}`);

        // Prepare the resource server data
        const resourceServerData: ResourceServerCreate = {
          name,
          identifier,
        };

        // Add optional fields if provided
        if (scopes !== undefined) resourceServerData.scopes = scopes;
        if (signing_alg !== undefined) resourceServerData.signing_alg = signing_alg;
        if (signing_secret !== undefined) resourceServerData.signing_secret = signing_secret;
        if (token_lifetime !== undefined) resourceServerData.token_lifetime = token_lifetime;
        if (allow_offline_access !== undefined)
          resourceServerData.allow_offline_access = allow_offline_access;
        if (token_dialect !== undefined) resourceServerData.token_dialect = token_dialect;
        if (skip_consent_for_verifiable_first_party_clients !== undefined)
          resourceServerData.skip_consent_for_verifiable_first_party_clients =
            skip_consent_for_verifiable_first_party_clients;
        if (enforce_policies !== undefined) resourceServerData.enforce_policies = enforce_policies;
        if (client !== undefined) resourceServerData.client = client;
        if (token_encryption !== undefined) resourceServerData.token_encryption = token_encryption;
        if (consent_policy !== undefined) resourceServerData.consent_policy = consent_policy;
        if (authorization_details !== undefined)
          resourceServerData.authorization_details = authorization_details;
        if (proof_of_possession !== undefined)
          resourceServerData.proof_of_possession = proof_of_possession;

        // Use the Auth0 SDK to create a resource server
        const resourceServer = await managementClient.resourceServers.create(resourceServerData);

        log(
          `Successfully created resource server: ${(resourceServer as any).name || 'Unknown'} (${(resourceServer as any).id || 'Unknown ID'})`
        );

        return createSuccessResponse(resourceServer);
      } catch (sdkError: any) {
        // Handle SDK errors
        log('Auth0 SDK error:', sdkError);

        let errorMessage = `Failed to create resource server: ${sdkError.message || 'Unknown error'}`;

        // Add context based on common error codes
        if (sdkError.statusCode === 409) {
          errorMessage = `Resource server with identifier '${identifier}' already exists.`;
        } else if (sdkError.statusCode === 401) {
          errorMessage +=
            '\nError: Unauthorized. Your token might be expired or invalid or missing create:resource_servers scope.';
        } else if (sdkError.statusCode === 403) {
          errorMessage +=
            '\nError: Forbidden. You do not have permission to create resource servers.';
        } else if (sdkError.statusCode === 429) {
          errorMessage += '\nError: Too many requests. Rate limit exceeded.';
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
  auth0_update_resource_server: async (
    request: HandlerRequest,
    config: HandlerConfig
  ): Promise<HandlerResponse> => {
    try {
      const id = request.parameters.id;
      if (!id) {
        return createErrorResponse('Error: id is required');
      }

      // Extract other parameters to update
      const {
        name,
        scopes,
        signing_alg,
        signing_secret,
        token_lifetime,
        allow_offline_access,
        token_dialect,
        skip_consent_for_verifiable_first_party_clients,
        enforce_policies,
        client,
        token_encryption,
        consent_policy,
        authorization_details,
        proof_of_possession,
      } = request.parameters;

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

        log(`Updating resource server with ID: ${id}`);

        // Prepare update body, only including fields that are present
        const updateData: Partial<ResourceServerUpdate> = {};
        if (name !== undefined) updateData.name = name;
        if (scopes !== undefined) updateData.scopes = scopes;
        if (signing_alg !== undefined) updateData.signing_alg = signing_alg;
        if (signing_secret !== undefined) updateData.signing_secret = signing_secret;
        if (token_lifetime !== undefined) updateData.token_lifetime = token_lifetime;
        if (allow_offline_access !== undefined)
          updateData.allow_offline_access = allow_offline_access;
        if (token_dialect !== undefined) updateData.token_dialect = token_dialect;
        if (skip_consent_for_verifiable_first_party_clients !== undefined)
          updateData.skip_consent_for_verifiable_first_party_clients =
            skip_consent_for_verifiable_first_party_clients;
        if (enforce_policies !== undefined) updateData.enforce_policies = enforce_policies;
        if (client !== undefined) updateData.client = client;
        if (token_encryption !== undefined) updateData.token_encryption = token_encryption;
        if (consent_policy !== undefined) updateData.consent_policy = consent_policy;
        if (authorization_details !== undefined)
          updateData.authorization_details = authorization_details;
        if (proof_of_possession !== undefined) updateData.proof_of_possession = proof_of_possession;

        // Use the Auth0 SDK to update the resource server
        const resourceServer = await managementClient.resourceServers.update({ id }, updateData);

        log(
          `Successfully updated resource server: ${(resourceServer as any).name || 'Unknown'} (${(resourceServer as any).id || id})`
        );

        return createSuccessResponse(resourceServer);
      } catch (sdkError: any) {
        // Handle SDK errors
        log('Auth0 SDK error:', sdkError);

        let errorMessage = `Failed to update resource server: ${sdkError.message || 'Unknown error'}`;

        // Add context based on common error codes
        if (sdkError.statusCode === 404) {
          errorMessage = `Resource server with id '${id}' not found.`;
        } else if (sdkError.statusCode === 401) {
          errorMessage +=
            '\nError: Unauthorized. Your token might be expired or invalid or missing update:resource_servers scope.';
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
};

// Helper function to format a resource server
function formatResourceServer(server: any) {
  return {
    id: server.id,
    name: server.name,
    identifier: server.identifier,
    scopes: server.scopes?.length || 0,
  };
}
