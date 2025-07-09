import { ConnectionCreateStrategyEnum, type ConnectionCreate, type ConnectionUpdate } from 'auth0';
import type { HandlerConfig, HandlerRequest, HandlerResponse, Tool } from '../utils/types.js';
import { log } from '../utils/logger.js';
import { createErrorResponse, createSuccessResponse } from '../utils/http-utility.js';
import type { Auth0Config } from '../utils/config.js';
import { getManagementClient } from '../utils/management-client.js';
import { Type, type Static } from '@sinclair/typebox';

// Define TypeBox schemas for each tool's input
const ListConnectionsInputSchema = Type.Object({
  page: Type.Optional(Type.Number({ description: 'Page number (0-based)' })),
  per_page: Type.Optional(Type.Number({ description: 'Number of connections per page' })),
  include_totals: Type.Optional(Type.Boolean({ description: 'Include total count' })),
  name: Type.Optional(Type.String({ description: 'Filter by connection name' })),
});

const GetConnectionInputSchema = Type.Object({
  id: Type.String({ description: 'ID of the connection to retrieve' }),
});

const CreateConnectionInputSchema = Type.Object({
  name: Type.String({ description: 'Name of the connection. Required.' }),
  strategy: Type.Union(
    Object.values(ConnectionCreateStrategyEnum).map((v) => Type.Literal(v)),
    { description: 'Strategy of the connection. Required.' }
  ),
  options: Type.Optional(
    Type.Any({ description: 'Strategy-specific options for the connection.' })
  ),
  enabled_clients: Type.Optional(
    Type.Array(Type.String(), { description: 'A list of client IDs to enable for the connection.' })
  ),
});

const UpdateConnectionInputSchema = Type.Object({
  id: Type.String({ description: 'ID of the connection to update. Required.' }),
  options: Type.Optional(
    Type.Any({ description: 'Strategy-specific options for the connection.' })
  ),
  enabled_clients: Type.Optional(
    Type.Array(Type.String(), { description: 'A list of client IDs to enable for the connection.' })
  ),
});

const DeleteConnectionInputSchema = Type.Object({
  id: Type.String({ description: 'ID of the connection to delete' }),
});

// Define all available connection tools
export const CONNECTION_TOOLS: Tool[] = [
  {
    name: 'auth0_list_connections',
    description: 'List all connections in the Auth0 tenant',
    inputSchema: ListConnectionsInputSchema,
    _meta: { requiredScopes: ['read:connections'], readOnly: true },
    annotations: {
      title: 'List Auth0 Connections',
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
  },
  {
    name: 'auth0_get_connection',
    description: 'Get details about a specific Auth0 connection',
    inputSchema: GetConnectionInputSchema,
    _meta: { requiredScopes: ['read:connections'], readOnly: true },
    annotations: {
      title: 'Get Auth0 Connection Details',
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
  },
  {
    name: 'auth0_create_connection',
    description: 'Create a new Auth0 connection',
    inputSchema: CreateConnectionInputSchema,
    _meta: { requiredScopes: ['create:connections'] },
    annotations: {
      title: 'Create Auth0 Connection',
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: false,
    },
  },
  {
    name: 'auth0_update_connection',
    description: 'Update an existing Auth0 connection',
    inputSchema: UpdateConnectionInputSchema,
    _meta: { requiredScopes: ['update:connections'] },
    annotations: {
      title: 'Update Auth0 Connection',
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: true,
      openWorldHint: false,
    },
  },
  {
    name: 'auth0_delete_connection',
    description: 'Delete an Auth0 connection',
    inputSchema: DeleteConnectionInputSchema,
    _meta: { requiredScopes: ['delete:connections'] },
    annotations: {
      title: 'Delete Auth0 Connection',
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: false,
      openWorldHint: false,
    },
  },
];

export const CONNECTION_HANDLERS: Record<
  string,
  (request: HandlerRequest<any>, config: HandlerConfig) => Promise<HandlerResponse>
> = {
  auth0_list_connections: async (
    request: HandlerRequest<Static<typeof ListConnectionsInputSchema>>,
    config: HandlerConfig
  ): Promise<HandlerResponse> => {
    try {
      if (!request.token) {
        log('Warning: Token is missing');
        return createErrorResponse('Error: Missing authorization token');
      }
      if (!config.domain) {
        log('Error: Auth0 domain is not configured');
        return createErrorResponse('Error: Auth0 domain is not configured');
      }
      const options: Record<string, any> = {};
      if (request.parameters.page !== undefined) {
        options.page = request.parameters.page;
      }
      if (request.parameters.per_page !== undefined) {
        options.per_page = request.parameters.per_page;
      }
      if (request.parameters.include_totals !== undefined) {
        options.include_totals = request.parameters.include_totals;
      }
      if (request.parameters.name !== undefined) {
        options.name = request.parameters.name;
      }
      try {
        const managementClientConfig: Auth0Config = { domain: config.domain, token: request.token };
        const managementClient = await getManagementClient(managementClientConfig);
        const { data: responseData } = await managementClient.connections.getAll(options);
        return createSuccessResponse(responseData);
      } catch (sdkError: any) {
        let errorMessage = `Failed to list connections: ${sdkError.message || 'Unknown error'}`;
        if (sdkError.statusCode === 401) {
          errorMessage +=
            '\nError: Unauthorized. Your token might be expired or invalid or missing read:connections scope.';
        } else if (sdkError.statusCode === 403) {
          errorMessage +=
            '\nError: Forbidden. Your token might not have the required scopes (read:connections).';
        }
        return createErrorResponse(errorMessage);
      }
    } catch (error: any) {
      return createErrorResponse(
        `Error: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  },
  auth0_get_connection: async (
    request: HandlerRequest<Static<typeof GetConnectionInputSchema>>,
    config: HandlerConfig
  ): Promise<HandlerResponse> => {
    try {
      const id = request.parameters.id;
      if (!id) {
        return createErrorResponse('Error: id is required');
      }
      if (!request.token) {
        log('Warning: Token is missing');
        return createErrorResponse('Error: Missing authorization token');
      }
      if (!config.domain) {
        log('Error: Auth0 domain is not configured');
        return createErrorResponse('Error: Auth0 domain is not configured');
      }
      try {
        const managementClientConfig: Auth0Config = { domain: config.domain, token: request.token };
        const managementClient = await getManagementClient(managementClientConfig);
        const { data: connection } = await managementClient.connections.get({ id });
        return createSuccessResponse(connection);
      } catch (sdkError: any) {
        let errorMessage = `Failed to get connection: ${sdkError.message || 'Unknown error'}`;
        if (sdkError.statusCode === 404) {
          errorMessage = `Connection with id '${id}' not found.`;
        } else if (sdkError.statusCode === 401) {
          errorMessage +=
            '\nError: Unauthorized. Your token might be expired or invalid or missing read:connections scope.';
        }
        return createErrorResponse(errorMessage);
      }
    } catch (error: any) {
      return createErrorResponse(
        `Error: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  },
  auth0_create_connection: async (
    request: HandlerRequest<Static<typeof CreateConnectionInputSchema>>,
    config: HandlerConfig
  ): Promise<HandlerResponse> => {
    try {
      const { name, strategy, options, enabled_clients } = request.parameters;
      if (!name) {
        return createErrorResponse('Error: name is required');
      }
      if (!strategy) {
        return createErrorResponse('Error: strategy is required');
      }
      if (!request.token) {
        log('Warning: Token is missing');
        return createErrorResponse('Error: Missing authorization token');
      }
      if (!config.domain) {
        log('Error: Auth0 domain is not configured');
        return createErrorResponse('Error: Auth0 domain is not configured');
      }
      const connectionData: ConnectionCreate = { name, strategy };
      if (options) {
        connectionData.options = options;
      }
      if (enabled_clients) {
        connectionData.enabled_clients = enabled_clients;
      }
      try {
        const managementClientConfig: Auth0Config = { domain: config.domain, token: request.token };
        const managementClient = await getManagementClient(managementClientConfig);
        const { data: newConnection } = await managementClient.connections.create(connectionData);
        return createSuccessResponse(newConnection);
      } catch (sdkError: any) {
        let errorMessage = `Failed to create connection: ${sdkError.message || 'Unknown error'}`;
        if (sdkError.statusCode === 401) {
          errorMessage +=
            '\nError: Unauthorized. Your token might be expired or invalid or missing create:connections scope.';
        }
        return createErrorResponse(errorMessage);
      }
    } catch (error: any) {
      return createErrorResponse(
        `Error: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  },
  auth0_update_connection: async (
    request: HandlerRequest<Static<typeof UpdateConnectionInputSchema>>,
    config: HandlerConfig
  ): Promise<HandlerResponse> => {
    try {
      const { id, options, enabled_clients } = request.parameters;
      if (!id) {
        return createErrorResponse('Error: id is required');
      }
      if (!request.token) {
        log('Warning: Token is missing');
        return createErrorResponse('Error: Missing authorization token');
      }
      if (!config.domain) {
        log('Error: Auth0 domain is not configured');
        return createErrorResponse('Error: Auth0 domain is not configured');
      }
      const updateData: ConnectionUpdate = {};
      if (options) {
        updateData.options = options;
      }
      if (enabled_clients) {
        updateData.enabled_clients = enabled_clients;
      }
      try {
        const managementClientConfig: Auth0Config = { domain: config.domain, token: request.token };
        const managementClient = await getManagementClient(managementClientConfig);
        const { data: updatedConnection } = await managementClient.connections.update(
          { id },
          updateData
        );
        return createSuccessResponse(updatedConnection);
      } catch (sdkError: any) {
        let errorMessage = `Failed to update connection: ${sdkError.message || 'Unknown error'}`;
        if (sdkError.statusCode === 404) {
          errorMessage = `Connection with id '${id}' not found.`;
        } else if (sdkError.statusCode === 401) {
          errorMessage +=
            '\nError: Unauthorized. Your token might be expired or invalid or missing update:connections scope.';
        }
        return createErrorResponse(errorMessage);
      }
    } catch (error: any) {
      return createErrorResponse(
        `Error: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  },
  auth0_delete_connection: async (
    request: HandlerRequest<Static<typeof DeleteConnectionInputSchema>>,
    config: HandlerConfig
  ): Promise<HandlerResponse> => {
    try {
      const id = request.parameters.id;
      if (!id) {
        return createErrorResponse('Error: id is required');
      }
      if (!request.token) {
        log('Warning: Token is missing');
        return createErrorResponse('Error: Missing authorization token');
      }
      if (!config.domain) {
        log('Error: Auth0 domain is not configured');
        return createErrorResponse('Error: Auth0 domain is not configured');
      }
      try {
        const managementClientConfig: Auth0Config = { domain: config.domain, token: request.token };
        const managementClient = await getManagementClient(managementClientConfig);
        await managementClient.connections.delete({ id });
        return createSuccessResponse({
          message: `Connection with id '${id}' successfully deleted.`,
        });
      } catch (sdkError: any) {
        let errorMessage = `Failed to delete connection: ${sdkError.message || 'Unknown error'}`;
        if (sdkError.statusCode === 404) {
          errorMessage = `Connection with id '${id}' not found.`;
        } else if (sdkError.statusCode === 401) {
          errorMessage +=
            '\nError: Unauthorized. Your token might be expired or invalid or missing delete:connections scope.';
        }
        return createErrorResponse(errorMessage);
      }
    } catch (error: any) {
      return createErrorResponse(
        `Error: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  },
};
