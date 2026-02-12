import type { HandlerConfig, HandlerRequest, HandlerResponse, Tool } from '../utils/types.js';
import { log } from '../utils/logger.js';
import type { Auth0Config } from '../utils/config.js';
import { createErrorResponse, createSuccessResponse } from '../utils/http-utility.js';
import { getManagementClient } from '../utils/auth0-client.js';

export const APPLICATION_GRANTS_TOOLS: Tool[] = [
  {
    name: 'auth0_create_application_grant',
    description:
      'Create a client grant that authorizes an Auth0 application to access a specific API with defined scopes. Required for machine-to-machine (M2M) communication using the client credentials flow. Use auth0_list_resource_servers to discover available APIs (audiences) and auth0_get_resource_server to look up available scopes before creating the grant.',
    inputSchema: {
      type: 'object',
      properties: {
        client_id: {
          type: 'string',
          description: 'The ID of the application to authorize.',
        },
        audience: {
          type: 'string',
          description:
            'The unique identifier (audience) of the API the application is being granted access to. Use auth0_list_resource_servers to find available APIs.',
        },
        scope: {
          type: 'array',
          items: { type: 'string' },
          description:
            'List of permissions (scopes) granted to the application for the specified API. Use auth0_get_resource_server to retrieve the available scopes for the API before selecting.',
        },
      },
      required: ['client_id', 'audience', 'scope'],
    },
    _meta: {
      requiredScopes: ['create:client_grants'],
    },
    annotations: {
      title: 'Create Application Grant',
      readOnlyHint: false,
      destructiveHint: false,
      openWorldHint: false,
    },
  },
];

export const APPLICATION_GRANT_HANDLERS: Record<
  string,
  (request: HandlerRequest, config: HandlerConfig) => Promise<HandlerResponse>
> = {
  auth0_create_application_grant: async (
    request: HandlerRequest,
    config: HandlerConfig
  ): Promise<HandlerResponse> => {
    try {
      log(`request_params: ${JSON.stringify(request.parameters)}`);
      const { audience, scope } = request.parameters;
      const clientId = request.parameters.client_id;

      if (!clientId) {
        return createErrorResponse('Error: client_id is required');
      }

      if (!audience) {
        return createErrorResponse('Error: audience is required');
      }

      if (!scope?.length) {
        return createErrorResponse('Error: scope is required');
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
        const managementClientConfig: Auth0Config = {
          domain: config.domain,
          token: request.token,
        };

        const managementClient = await getManagementClient(managementClientConfig);

        log(`Creating a new application grant for application: ${clientId} and API: ${audience}`);

        const { data: newGrant } = await managementClient.clientGrants.create({
          client_id: clientId,
          audience,
          scope: scope || [],
        });

        log(`Successfully created application grant: ${newGrant.id}`);

        return createSuccessResponse(newGrant);
      } catch (sdkError: any) {
        log('Auth0 SDK Error');

        let errorMessage = `Failed to create application grant: ${sdkError.message || 'unknown error'}`;

        if (sdkError.statusCode === 401) {
          errorMessage +=
            '\nError: Unauthorized. Your token might be expired or invalid or missing create:client_grants scope.';
        } else if (sdkError.statusCode === 422) {
          errorMessage +=
            '\nError: Validation errors in your request. Check that your parameters are valid.';
        }

        return createErrorResponse(errorMessage);
      }
    } catch (error) {
      // Handle any other errors
      log('Error processing request');

      return createErrorResponse(
        `Error: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  },
};
