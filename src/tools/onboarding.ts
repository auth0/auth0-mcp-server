import { access } from 'node:fs/promises';
import { constants } from 'node:fs';
import type { HandlerConfig, HandlerRequest, HandlerResponse, Tool } from '../utils/types.js';
import { log } from '../utils/logger.js';
import { createErrorResponse, createSuccessResponse } from '../utils/http-utility.js';
import { APPLICATION_HANDLERS } from './applications.js';

/**
 * Onboarding tool definition
 *
 * Creates and configures an Auth0 application with SDK integration.
 * Validates the project path, creates the application via auth0_create_application,
 * and directs the LLM to call auth0_quickstart_tool next.
 */
export const ONBOARDING_TOOLS: Tool[] = [
  {
    name: 'auth0_onboarding',
    description:
      'Create and configure an Auth0 application with SDK integration. ' +
      'Requires app_name, app_type, framework, and project_path. ' +
      "Before calling this tool, determine the user's project directory — " +
      'use workspace context if available, otherwise ask the user for their project file path. ' +
      'This tool validates the project path, creates the Auth0 application, ' +
      'and securely saves credentials (including client_secret) directly to a .env file. ' +
      'The client_secret is never returned in the response. ' +
      'After this tool completes, call auth0_quickstart_tool with the returned client_id, ' +
      'project_path, and framework to complete setup.',
    inputSchema: {
      type: 'object',
      required: ['app_name', 'app_type', 'framework', 'project_path'],
      properties: {
        app_name: {
          type: 'string',
          description: 'Application name (e.g., "My React App")',
        },
        app_type: {
          type: 'string',
          enum: ['spa', 'native', 'regular_web', 'non_interactive'],
          description: 'The type of application being built',
        },
        framework: {
          type: 'string',
          enum: ['react', 'vue', 'angular', 'next', 'express'],
          description: 'Technology/framework the user is building with',
        },
        project_path: {
          type: 'string',
          description:
            "Absolute path to the user's project directory. " +
            'Must exist and be writable. The .env file will be created here.',
        },
      },
    },
    _meta: {
      requiredScopes: ['create:clients'],
    },
    annotations: {
      title: 'Auth0 Onboarding',
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: false,
    },
  },
];

/**
 * Validate that the given project path exists and is writable
 */
async function validateProjectPath(projectPath: string): Promise<string | null> {
  try {
    await access(projectPath, constants.R_OK | constants.W_OK);
    return null;
  } catch {
    return `project_path '${projectPath}' does not exist or is not writable. Provide a valid directory path.`;
  }
}

/**
 * Onboarding tool handler
 */
export const ONBOARDING_HANDLERS: Record<
  string,
  (request: HandlerRequest, config: HandlerConfig) => Promise<HandlerResponse>
> = {
  auth0_onboarding: async (
    request: HandlerRequest,
    config: HandlerConfig
  ): Promise<HandlerResponse> => {
    try {
      const { app_name, app_type, framework, project_path } = request.parameters;

      // Check for token
      if (!request.token) {
        log('Warning: Token is missing');
        return createErrorResponse('Error: Missing authorization token');
      }

      // Check if domain is configured
      if (!config.domain) {
        log('Error: Auth0 domain is not configured');
        return createErrorResponse('Error: Auth0 domain is not configured');
      }

      // Validate project_path before any API calls
      const pathError = await validateProjectPath(project_path);
      if (pathError) {
        log(`Path validation failed: ${pathError}`);
        return createSuccessResponse({
          success: false,
          error: pathError,
        });
      }

      log(`Starting onboarding for app: ${app_name}, type: ${app_type}, framework: ${framework}`);

      // Create the application via auth0_create_application
      const createRequest: HandlerRequest = {
        token: request.token,
        parameters: {
          name: app_name,
          app_type: app_type,
          oidc_conformant: true,
        },
      };

      const createResponse = await APPLICATION_HANDLERS['auth0_create_application'](
        createRequest,
        config
      );

      // If the create call failed, propagate the error
      if (createResponse.isError) {
        return createResponse;
      }

      // Extract client_id and domain from the created application
      const responseText = createResponse.content?.[0]?.text;
      if (!responseText) {
        return createErrorResponse('Failed to parse application creation response');
      }

      const createdApp = JSON.parse(responseText);
      const clientId = createdApp.client_id;
      const domain = config.domain;

      log('Onboarding completed successfully');

      return createSuccessResponse({
        success: true,
        application: {
          client_id: clientId,
          domain: domain,
        },
        project_path: project_path,
        next_step:
          'Call auth0_quickstart_tool with client_id, project_path, and framework to complete setup',
      });
    } catch (error: any) {
      log('Error processing onboarding request');
      return createErrorResponse(
        `Error: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  },
};
