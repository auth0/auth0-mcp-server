import * as fs from 'fs';
import * as path from 'path';
import type { HandlerConfig, HandlerRequest, HandlerResponse, Tool } from '../utils/types.js';
import { log } from '../utils/logger.js';
import { createErrorResponse, createSuccessResponse } from '../utils/http-utility.js';
import { fetchQuickstartSpec } from '../utils/quickstarts.js';
import {
  resolveCallbackUrls,
  isFrameworkSupported,
  SUPPORTED_FRAMEWORKS,
} from '../utils/onboarding.js';
import { fetchWithOptions } from '../utils/fetch.js';
import { calculateUrlUpdates, resolvePlaceholders } from '../utils/quickstart-guide.js';
import { detectExistingEnvFile } from '../utils/credentials-writer.js';
import { APPLICATION_HANDLERS } from './applications.js';

export const QUICKSTART_TOOLS: Tool[] = [
  {
    name: 'auth0_get_quickstart_guide',
    description:
      'Fetch and return the Auth0 quickstart implementation prompt for a specific framework. ' +
      'Resolves callback URLs from the project configuration and updates them on the Auth0 ' +
      'application. Fetches the quickstart prompt from CDN and injects runtime values. ' +
      "The returned prompt contains code that should be implemented in the user's project. " +
      'If you have file-write capabilities, implement the code directly at project_path. ' +
      'If you do not have file-write capabilities, present the code to the user with clear ' +
      'instructions for where each file should be created or modified. ' +
      'Requires client_id, framework, and project_path. If the application does not exist, call auth0_onboarding first. ' +
      'After updating, always inform the user about any automatically applied settings (such as skip_non_verifiable_callback_uri_confirmation_prompt).',
    inputSchema: {
      type: 'object',
      properties: {
        client_id: {
          type: 'string',
          description: 'Auth0 application client_id',
        },
        framework: {
          type: 'string',
          enum: SUPPORTED_FRAMEWORKS,
          description: 'Supported framework for the quickstart',
        },
        project_path: {
          type: 'string',
          description:
            'Absolute path to the project directory. Used for .env file check and project config port detection.',
        },
        base_url: {
          type: 'string',
          description:
            'Explicit base URL override for callback resolution (e.g. http://localhost:3000)',
        },
      },
      required: ['client_id', 'framework', 'project_path'],
    },
    _meta: {
      requiredScopes: ['read:clients', 'update:clients'],
      localOnly: true,
    },
    annotations: {
      title: 'Get Quickstart Guide',
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
    },
  },
];

export const QUICKSTART_HANDLERS: Record<
  string,
  (request: HandlerRequest, config: HandlerConfig) => Promise<HandlerResponse>
> = {
  auth0_get_quickstart_guide: async (
    request: HandlerRequest,
    config: HandlerConfig
  ): Promise<HandlerResponse> => {
    const {
      client_id: clientId,
      framework,
      project_path: projectPath,
      base_url: baseUrl,
    } = request.parameters;

    if (!clientId) {
      return createErrorResponse('Error: client_id is required');
    }
    if (!framework) {
      return createErrorResponse('Error: framework is required');
    }
    if (!isFrameworkSupported(framework)) {
      return createErrorResponse(
        `Error: Unsupported framework "${framework}". Must be one of: ${SUPPORTED_FRAMEWORKS.join(', ')}`
      );
    }

    if (!projectPath) {
      return createErrorResponse('Error: project_path is required');
    }
    if (!path.isAbsolute(projectPath)) {
      return createErrorResponse('Error: project_path must be an absolute path');
    }
    const resolvedProjectPath = path.resolve(projectPath);
    if (!fs.statSync(resolvedProjectPath, { throwIfNoEntry: false })?.isDirectory()) {
      return createErrorResponse('Error: project_path must be an existing directory');
    }

    if (!request.token) {
      log('Warning: Token is empty or undefined');
      return createErrorResponse('Error: Missing authorization token');
    }
    if (!config.domain) {
      log('Error: Auth0 domain is not configured');
      return createErrorResponse('Error: Auth0 domain is not configured');
    }

    // Step 1: Resolve quickstart spec
    const spec = await fetchQuickstartSpec(framework);
    if (!spec) {
      return createErrorResponse(
        `Error: Quickstart definition unavailable for framework "${framework}". ` +
          'The framework may not be supported or the CDN may be temporarily unavailable.'
      );
    }

    if (!spec.llmPromptUrl) {
      return createErrorResponse(
        `Error: Quickstart definition for "${framework}" does not include an LLM prompt URL.`
      );
    }

    // Step 2: Validate application exists
    const getResponse = await APPLICATION_HANDLERS['auth0_get_application'](
      { token: request.token, parameters: { client_id: clientId } },
      config
    );
    if (getResponse.isError) {
      return getResponse;
    }

    let appData: Record<string, any>;
    try {
      appData = JSON.parse(getResponse.content[0]?.text ?? '');
    } catch {
      return createErrorResponse('Error: Failed to parse application data');
    }

    // Step 3: Check .env file exists (only when spec has envSnippet).
    // Credentials may have been saved to any pre-existing env file (e.g. .env.development),
    // so detect an existing file before falling back to the spec's preferred filename.
    let envFilePath: string | null = null;
    if (spec.envSnippet) {
      const snippetFileName = spec.envSnippet.fileName;
      if (snippetFileName !== path.basename(snippetFileName)) {
        return createErrorResponse(
          `Error: Quickstart spec for "${framework}" has an invalid env file name "${snippetFileName}". ` +
            'The file name must not contain a path.'
        );
      }
      envFilePath =
        detectExistingEnvFile(resolvedProjectPath) ??
        (fs.existsSync(path.join(resolvedProjectPath, snippetFileName))
          ? path.join(resolvedProjectPath, snippetFileName)
          : null);
      if (!envFilePath) {
        return createErrorResponse(
          `Error: No environment file found in "${resolvedProjectPath}". ` +
            `Expected one of: .env.local, .env, .env.development.local, .env.development, or ${snippetFileName}. ` +
            'Please call auth0_save_credentials_to_file first to set up your environment file.'
        );
      }
    }

    // Step 4: Resolve callback URLs
    const resolvedUrls = resolveCallbackUrls(spec, baseUrl);

    // Step 5: Fetch LLM prompt
    let promptText: string;
    try {
      const promptResponse = await fetchWithOptions(spec.llmPromptUrl, { retries: 1 });
      if (!promptResponse.ok) {
        log(`Failed to fetch LLM prompt from ${spec.llmPromptUrl}: ${promptResponse.status}`);
        return createErrorResponse(
          `Error: Quickstart guide unavailable for "${framework}". ` +
            `Failed to fetch LLM prompt from CDN (status: ${promptResponse.status}).`
        );
      }
      promptText = await promptResponse.text();
    } catch (error) {
      log(`Error fetching LLM prompt: ${error}`);
      return createErrorResponse(
        `Error: Quickstart guide unavailable for "${framework}". ` +
          'Failed to fetch LLM prompt from CDN due to a network error.'
      );
    }

    // Step 6: Inject runtime values
    let baseUrlParsed: URL;
    try {
      baseUrlParsed = new URL(resolvedUrls.base_url);
    } catch {
      return createErrorResponse(`Error: Invalid resolved base URL: ${resolvedUrls.base_url}`);
    }

    const specDefaultPort = spec.defaultAppOrigin?.port;
    const port =
      baseUrlParsed.port ||
      (specDefaultPort !== undefined ? String(specDefaultPort) : null) ||
      (baseUrlParsed.protocol === 'https:' ? '443' : '80');

    const inputValues: Record<string, string> = {
      auth0Domain: config.domain,
      auth0ClientId: clientId,
      port,
      appDomain: baseUrlParsed.hostname,
      appScheme: baseUrlParsed.protocol.replace(':', ''),
      auth0ClientSecret: '*******MASKED*********',
      sessionCookieSecret: '*******MASKED*********',
    };

    for (const [key, def] of Object.entries(spec.inputs)) {
      if (inputValues[key] === undefined && def && typeof def === 'object' && 'default' in def) {
        inputValues[key] = String((def as Record<string, unknown>).default);
      }
    }

    const resolvedPrompt = resolvePlaceholders(
      promptText,
      spec.placeholders,
      inputValues,
      spec.environment
    );

    // Step 7: Update application after all failure-prone non-mutating work succeeds
    const { updatePayload, finalUrls } = calculateUrlUpdates(resolvedUrls, appData);

    if (updatePayload) {
      const updateResponse = await APPLICATION_HANDLERS['auth0_update_application'](
        { token: request.token, parameters: { client_id: clientId, ...updatePayload } },
        config
      );
      if (updateResponse.isError) {
        const errorDetail = updateResponse.content?.[0]?.text || 'Unknown error';
        return createErrorResponse(
          `Error: Failed to update application callback URLs. ${errorDetail}`
        );
      }
    }

    // Step 8: Return response
    const configuredUrls: Record<string, any> = {
      callbacks: finalUrls.callbacks,
      allowed_logout_urls: finalUrls.allowed_logout_urls,
    };
    if (finalUrls.web_origins) {
      configuredUrls.web_origins = finalUrls.web_origins;
    }
    if (finalUrls.skip_non_verifiable_callback_uri_confirmation_prompt) {
      configuredUrls.skip_non_verifiable_callback_uri_confirmation_prompt = true;
    }

    const actionsTaken: string[] = [];
    if (updatePayload !== null) {
      if (finalUrls.callbacks?.length) {
        actionsTaken.push(`Set callback URL(s): ${finalUrls.callbacks.join(', ')}`);
      }
      if (finalUrls.allowed_logout_urls?.length) {
        actionsTaken.push(`Set logout URL(s): ${finalUrls.allowed_logout_urls.join(', ')}`);
      }
      if (finalUrls.web_origins?.length) {
        actionsTaken.push(`Set allowed web origin(s): ${finalUrls.web_origins.join(', ')}`);
      }
      if (finalUrls.skip_non_verifiable_callback_uri_confirmation_prompt) {
        actionsTaken.push(
          'Enabled skip_non_verifiable_callback_uri_confirmation_prompt because a non-verifiable (custom scheme or localhost) callback URL was configured'
        );
      }
    }
    actionsTaken.push(`Fetched quickstart guide for ${framework}`);

    const credentialsNote = envFilePath
      ? `An existing environment file was detected at "${envFilePath}"; use it as-is and skip ` +
        `any environment-variable or .env setup steps in the quickstart_prompt; do not create or copy a new .env file.`
      : '';

    return createSuccessResponse({
      success: true,
      client_id: clientId,
      framework,
      project_path: resolvedProjectPath,
      app_type: spec.appType,
      quickstart_prompt: resolvedPrompt,
      configured_urls: configuredUrls,
      urls_updated: updatePayload !== null,
      url_source: resolvedUrls.url_source,
      actions_taken: actionsTaken,
      credentials_file: envFilePath,
      instructions:
        `First, summarize actions_taken to the user so they know what was configured on their Auth0 application. ` +
        `Then implement the code from quickstart_prompt in the user's project at project_path. ` +
        `If you have file-write capabilities, create and modify files directly. ` +
        `If you do not have file-write capabilities, present each code block to the user ` +
        `with the file path where it should be created or modified.${credentialsNote} ` +
        `Once the integration code is in place, the onboarding is complete — let the user know.`,
    });
  },
};
