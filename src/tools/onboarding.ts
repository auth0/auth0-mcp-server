import * as fs from 'fs';
import * as path from 'path';
import type { HandlerConfig, HandlerRequest, HandlerResponse, Tool } from '../utils/types.js';
import { log } from '../utils/logger.js';
import { createErrorResponse, createSuccessResponse } from '../utils/http-utility.js';
import { fetchQuickstartSpec } from '../utils/quickstarts.js';
import { isFrameworkSupported, SUPPORTED_FRAMEWORKS } from '../utils/onboarding.js';
import { APPLICATION_HANDLERS } from './applications.js';

const APP_TYPE_MAP: Record<string, string> = {
  spa: 'spa',
  webapp: 'regular_web',
  native: 'native',
};

export const ONBOARDING_TOOLS: Tool[] = [
  {
    name: 'auth0_onboarding',
    description:
      'Onboard a project with Auth0. Creates an Auth0 application with the correct ' +
      'configuration for the specified framework and saves credentials to a .env file. ' +
      'Returns next_steps pointing to auth0_get_quickstart_guide tool to complete the integration. ' +
      "Only supports frameworks listed in the enum. If the user's framework is not supported, " +
      'inform them that their framework is not yet supported and do NOT proceed with onboarding.',
    inputSchema: {
      type: 'object',
      properties: {
        app_name: {
          type: 'string',
          description: 'Application name (defaults to "My App" if empty)',
        },
        framework: {
          type: 'string',
          enum: [...SUPPORTED_FRAMEWORKS],
          description: 'JavaScript framework for the quickstart',
        },
        project_path: {
          type: 'string',
          description:
            'Path to the project directory. Used for writing the .env file with Auth0 credentials.',
        },
      },
      required: ['app_name', 'framework', 'project_path'],
    },
    _meta: {
      requiredScopes: ['create:clients'],
      localOnly: true,
    },
    annotations: {
      title: 'Onboard Project',
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: false,
      openWorldHint: true,
    },
  },
];

export const ONBOARDING_HANDLERS: Record<
  string,
  (request: HandlerRequest, config: HandlerConfig) => Promise<HandlerResponse>
> = {
  auth0_onboarding: async (
    request: HandlerRequest,
    config: HandlerConfig
  ): Promise<HandlerResponse> => {
    const { app_name: appName, framework, project_path: projectPath } = request.parameters;

    // Validate framework
    if (!framework) {
      return createErrorResponse(
        `Error: framework is required. Must be one of: ${SUPPORTED_FRAMEWORKS.join(', ')}`
      );
    }
    if (!isFrameworkSupported(framework)) {
      return createErrorResponse(
        `Error: Unsupported framework "${framework}". Must be one of: ${SUPPORTED_FRAMEWORKS.join(', ')}`
      );
    }

    // Validate project_path
    if (!projectPath) {
      return createErrorResponse('Error: project_path is required');
    }
    const resolvedProjectPath = path.resolve(projectPath);
    if (resolvedProjectPath !== projectPath && projectPath.includes('..')) {
      return createErrorResponse('Error: project_path must not contain path traversal sequences');
    }
    if (!fs.statSync(resolvedProjectPath, { throwIfNoEntry: false })?.isDirectory()) {
      return createErrorResponse('Error: project_path must be an existing directory');
    }

    // Validate auth
    if (!request.token) {
      log('Warning: Token is empty or undefined');
      return createErrorResponse('Error: Missing authorization token');
    }
    if (!config.domain) {
      log('Error: Auth0 domain is not configured');
      return createErrorResponse('Error: Auth0 domain is not configured');
    }

    // Fetch quickstart spec (fail before creating app)
    const spec = await fetchQuickstartSpec(framework);
    if (!spec) {
      return createErrorResponse(
        `Error: Quickstart definition unavailable for framework "${framework}". ` +
          'The framework may not be supported or the CDN may be temporarily unavailable.'
      );
    }

    // Map app_type from spec
    const mappedAppType = APP_TYPE_MAP[spec.appType];
    if (!mappedAppType) {
      return createErrorResponse(
        `Error: Unknown app type "${spec.appType}" in quickstart spec for framework "${framework}"`
      );
    }

    // Derive token_endpoint_auth_method
    const tokenEndpointAuthMethod =
      mappedAppType === 'spa' || mappedAppType === 'native' ? 'none' : 'client_secret_post';

    // Create application
    const resolvedAppName = appName || 'My App';
    const createResponse = await APPLICATION_HANDLERS['auth0_create_application'](
      {
        token: request.token,
        parameters: {
          name: resolvedAppName,
          app_type: mappedAppType,
          token_endpoint_auth_method: tokenEndpointAuthMethod,
          oidc_conformant: true,
        },
      },
      config
    );

    if (createResponse.isError) {
      return createResponse;
    }

    // Parse create response to extract client_id
    let appData: Record<string, any>;
    try {
      appData = JSON.parse(createResponse.content[0]?.text ?? '');
    } catch {
      return createErrorResponse('Error: Failed to parse application creation response');
    }

    const clientId = appData.client_id;
    if (!clientId) {
      return createErrorResponse('Error: Application created but client_id not found in response');
    }

    // Save credentials
    const saveResponse = await APPLICATION_HANDLERS['auth0_save_credentials_to_file'](
      {
        token: request.token,
        parameters: {
          client_id: clientId,
          framework,
          project_path: resolvedProjectPath,
        },
      },
      config
    );

    if (saveResponse.isError) {
      const saveError = saveResponse.content[0]?.text ?? 'Unknown error';
      return createErrorResponse(
        `Error: Application "${resolvedAppName}" was created (client_id: ${clientId}) but credentials could not be saved. ${saveError}`
      );
    }

    // Parse save response
    let saveData: Record<string, any>;
    try {
      saveData = JSON.parse(saveResponse.content[0]?.text ?? '');
    } catch {
      return createErrorResponse('Error: Failed to parse credentials save response');
    }

    const credentialsAccessNote = appData._credentials_access
      ? `Tell the user the client_secret is redacted in this response for security, and share the ` +
        `dashboard and API URLs from _credentials_access so they know where to view the full secret. `
      : '';
    const skipPromptNote = appData.skip_non_verifiable_callback_uri_confirmation_prompt
      ? `Also inform the user that skip_non_verifiable_callback_uri_confirmation_prompt was automatically enabled. `
      : '';

    return createSuccessResponse({
      success: true,
      client_id: clientId,
      domain: config.domain,
      app_type: mappedAppType,
      framework,
      credentials_saved_to: saveData.credentials_saved_to ?? null,
      keys_written: saveData.keys_written ?? [],
      ...(appData._credentials_access ? { _credentials_access: appData._credentials_access } : {}),
      ...(appData.skip_non_verifiable_callback_uri_confirmation_prompt
        ? { skip_non_verifiable_callback_uri_confirmation_prompt: true }
        : {}),
      next_steps: ['auth0_get_quickstart_guide'],
      instructions:
        `The Auth0 application has been created, but onboarding is not yet complete. ` +
        `This is the first of two steps. ${credentialsAccessNote}${skipPromptNote}` +
        `Immediately call the auth0_get_quickstart_guide tool with ` +
        `client_id "${clientId}", framework "${framework}", and project_path "${resolvedProjectPath}" ` +
        `to perform the SDK integration. Do not wait for the user to ask, and do not tell the user ` +
        `onboarding is complete until after auth0_get_quickstart_guide has finished. ` +
        `Do NOT read, open, or echo any .env file (.env, .env.local, etc.) — it may hold unrelated ` +
        `secrets, and the write already succeeded (see credentials_saved_to).`,
    });
  },
};
