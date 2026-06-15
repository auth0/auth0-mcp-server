import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mockConfig } from '../mocks/config';

vi.mock('../../src/utils/logger', () => ({
  log: vi.fn(),
}));

const mockFetchQuickstartSpec = vi.fn();
vi.mock('../../src/utils/quickstarts', () => ({
  fetchQuickstartSpec: (...args: any[]) => mockFetchQuickstartSpec(...args),
}));

const mockStatSync = vi.fn();
const mockExistsSync = vi.fn().mockReturnValue(true);
vi.mock('fs', () => ({
  statSync: (...args: any[]) => mockStatSync(...args),
  existsSync: (...args: any[]) => mockExistsSync(...args),
}));

const mockCreateApplication = vi.fn();
const mockSaveCredentials = vi.fn();
vi.mock('../../src/tools/applications', () => ({
  APPLICATION_HANDLERS: {
    auth0_create_application: (...args: any[]) => mockCreateApplication(...args),
    auth0_save_credentials_to_file: (...args: any[]) => mockSaveCredentials(...args),
  },
}));

const makeMockSpec = (overrides: Record<string, any> = {}) => ({
  appType: 'spa',
  defaultAppOrigin: { scheme: 'http', domain: 'localhost', port: 3000 },
  callbackPath: '/callback',
  logoutPath: '/',
  llmPromptPath: 'assets/llm-prompts/react-llm-prompt.md',
  llmPromptUrl:
    'https://cdn.auth0.com/manhattan/quickstarts/versions/1.0.0/assets/prompts/en/react-prompt.md',
  envSnippet: {
    type: 'env',
    language: 'shell',
    fileName: '.env',
    entries: [
      { type: 'var', name: 'VITE_AUTH0_DOMAIN', value: '{yourDomain}' },
      { type: 'var', name: 'VITE_AUTH0_CLIENT_ID', value: '{yourClientId}' },
    ],
  },
  placeholders: {},
  inputs: {},
  environment: {},
  ...overrides,
});

describe('auth0_onboarding', () => {
  let ONBOARDING_HANDLERS: typeof import('../../src/tools/onboarding').ONBOARDING_HANDLERS;
  let ONBOARDING_TOOLS: typeof import('../../src/tools/onboarding').ONBOARDING_TOOLS;

  const domain = mockConfig.domain;
  const token = mockConfig.token;
  const config = { domain };

  beforeEach(async () => {
    vi.resetAllMocks();
    mockFetchQuickstartSpec.mockResolvedValue(makeMockSpec());
    mockStatSync.mockReturnValue({ isDirectory: () => true });
    mockExistsSync.mockReturnValue(true);

    mockCreateApplication.mockResolvedValue({
      isError: false,
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            client_id: 'new-client-id',
            name: 'My App',
            app_type: 'spa',
          }),
        },
      ],
    });

    mockSaveCredentials.mockResolvedValue({
      isError: false,
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            client_id: 'new-client-id',
            credentials_saved_to: '/project/.env',
            keys_written: ['VITE_AUTH0_DOMAIN', 'VITE_AUTH0_CLIENT_ID'],
            file_created: true,
            message: 'Credentials saved',
          }),
        },
      ],
    });

    const mod = await import('../../src/tools/onboarding');
    ONBOARDING_HANDLERS = mod.ONBOARDING_HANDLERS;
    ONBOARDING_TOOLS = mod.ONBOARDING_TOOLS;
  });

  describe('tool metadata', () => {
    it('should have correct annotations', () => {
      const tool = ONBOARDING_TOOLS.find((t) => t.name === 'auth0_onboarding');
      expect(tool?.annotations?.readOnlyHint).toBe(false);
      expect(tool?.annotations?.destructiveHint).toBe(true);
      expect(tool?.annotations?.idempotentHint).toBe(false);
      expect(tool?.annotations?.openWorldHint).toBe(false);
    });

    it('should require create:clients scope and be localOnly', () => {
      const tool = ONBOARDING_TOOLS.find((t) => t.name === 'auth0_onboarding');
      expect(tool?._meta?.requiredScopes).toEqual(['create:clients']);
      expect(tool?._meta?.localOnly).toBe(true);
    });
  });

  describe('auth validation', () => {
    it('should return error when token is missing', async () => {
      const response = await ONBOARDING_HANDLERS.auth0_onboarding(
        {
          token: '',
          parameters: {
            app_name: 'My App',
            framework: 'react',
            project_path: '/tmp/project',
          },
        },
        config
      );
      expect(response.isError).toBe(true);
      expect(response.content[0].text).toContain('Missing authorization token');
    });

    it('should return error when domain is not configured', async () => {
      const response = await ONBOARDING_HANDLERS.auth0_onboarding(
        {
          token,
          parameters: {
            app_name: 'My App',
            framework: 'react',
            project_path: '/tmp/project',
          },
        },
        { domain: undefined }
      );
      expect(response.isError).toBe(true);
      expect(response.content[0].text).toContain('Auth0 domain is not configured');
    });
  });

  describe('input validation', () => {
    it('should return error when framework is missing', async () => {
      const response = await ONBOARDING_HANDLERS.auth0_onboarding(
        { token, parameters: { app_name: 'My App', project_path: '/tmp/project' } },
        config
      );
      expect(response.isError).toBe(true);
      expect(response.content[0].text).toContain('framework is required');
    });

    it('should return error when framework is unsupported', async () => {
      const response = await ONBOARDING_HANDLERS.auth0_onboarding(
        {
          token,
          parameters: {
            app_name: 'My App',
            framework: 'svelte',
            project_path: '/tmp/project',
          },
        },
        config
      );
      expect(response.isError).toBe(true);
      expect(response.content[0].text).toContain('Unsupported framework');
      expect(response.content[0].text).toContain('svelte');
    });

    it('should return error when project_path is missing', async () => {
      const response = await ONBOARDING_HANDLERS.auth0_onboarding(
        { token, parameters: { app_name: 'My App', framework: 'react' } },
        config
      );
      expect(response.isError).toBe(true);
      expect(response.content[0].text).toContain('project_path is required');
    });

    it('should return error when project_path contains path traversal', async () => {
      const response = await ONBOARDING_HANDLERS.auth0_onboarding(
        {
          token,
          parameters: {
            app_name: 'My App',
            framework: 'react',
            project_path: '/tmp/../etc/passwd',
          },
        },
        config
      );
      expect(response.isError).toBe(true);
      expect(response.content[0].text).toContain('path traversal');
    });

    it('should return error when project_path is not a directory', async () => {
      mockStatSync.mockReturnValue({ isDirectory: () => false });

      const response = await ONBOARDING_HANDLERS.auth0_onboarding(
        {
          token,
          parameters: {
            app_name: 'My App',
            framework: 'react',
            project_path: '/tmp/project',
          },
        },
        config
      );
      expect(response.isError).toBe(true);
      expect(response.content[0].text).toContain('existing directory');
    });

    it('should return error when project_path does not exist', async () => {
      mockStatSync.mockReturnValue(undefined);

      const response = await ONBOARDING_HANDLERS.auth0_onboarding(
        {
          token,
          parameters: {
            app_name: 'My App',
            framework: 'react',
            project_path: '/tmp/project',
          },
        },
        config
      );
      expect(response.isError).toBe(true);
      expect(response.content[0].text).toContain('existing directory');
    });

    it('should return error when project_path has no recognized project marker files', async () => {
      mockExistsSync.mockReturnValue(false);

      const response = await ONBOARDING_HANDLERS.auth0_onboarding(
        {
          token,
          parameters: {
            app_name: 'My App',
            framework: 'react',
            project_path: '/tmp/project',
          },
        },
        config
      );
      expect(response.isError).toBe(true);
      expect(response.content[0].text).toContain('project directory');
    });
  });

  describe('quickstart spec resolution', () => {
    it('should return error when spec is unavailable', async () => {
      mockFetchQuickstartSpec.mockResolvedValue(null);

      const response = await ONBOARDING_HANDLERS.auth0_onboarding(
        {
          token,
          parameters: {
            app_name: 'My App',
            framework: 'react',
            project_path: '/tmp/project',
          },
        },
        config
      );
      expect(response.isError).toBe(true);
      expect(response.content[0].text).toContain('definition unavailable');
      expect(response.content[0].text).toContain('react');
    });

    it('should not call create_application when spec is unavailable', async () => {
      mockFetchQuickstartSpec.mockResolvedValue(null);

      await ONBOARDING_HANDLERS.auth0_onboarding(
        {
          token,
          parameters: {
            app_name: 'My App',
            framework: 'react',
            project_path: '/tmp/project',
          },
        },
        config
      );
      expect(mockCreateApplication).not.toHaveBeenCalled();
    });

    it('should return error for unknown app type in spec', async () => {
      mockFetchQuickstartSpec.mockResolvedValue(makeMockSpec({ appType: 'unknown' }));

      const response = await ONBOARDING_HANDLERS.auth0_onboarding(
        {
          token,
          parameters: {
            app_name: 'My App',
            framework: 'react',
            project_path: '/tmp/project',
          },
        },
        config
      );
      expect(response.isError).toBe(true);
      expect(response.content[0].text).toContain('Unknown app type');
      expect(response.content[0].text).toContain('unknown');
    });
  });

  describe('app type mapping', () => {
    it('should map spa appType to spa with token_endpoint_auth_method none', async () => {
      mockFetchQuickstartSpec.mockResolvedValue(makeMockSpec({ appType: 'spa' }));

      await ONBOARDING_HANDLERS.auth0_onboarding(
        {
          token,
          parameters: {
            app_name: 'My App',
            framework: 'react',
            project_path: '/tmp/project',
          },
        },
        config
      );

      expect(mockCreateApplication).toHaveBeenCalledWith(
        expect.objectContaining({
          parameters: expect.objectContaining({
            app_type: 'spa',
            token_endpoint_auth_method: 'none',
            oidc_conformant: true,
          }),
        }),
        config
      );
    });

    it('should map webapp appType to regular_web with client_secret_post', async () => {
      mockFetchQuickstartSpec.mockResolvedValue(makeMockSpec({ appType: 'webapp' }));

      await ONBOARDING_HANDLERS.auth0_onboarding(
        {
          token,
          parameters: {
            app_name: 'My App',
            framework: 'nextjs',
            project_path: '/tmp/project',
          },
        },
        config
      );

      expect(mockCreateApplication).toHaveBeenCalledWith(
        expect.objectContaining({
          parameters: expect.objectContaining({
            app_type: 'regular_web',
            token_endpoint_auth_method: 'client_secret_post',
            oidc_conformant: true,
          }),
        }),
        config
      );
    });

    it('should map native appType to native with token_endpoint_auth_method none', async () => {
      mockFetchQuickstartSpec.mockResolvedValue(makeMockSpec({ appType: 'native' }));

      await ONBOARDING_HANDLERS.auth0_onboarding(
        {
          token,
          parameters: {
            app_name: 'My App',
            framework: 'react',
            project_path: '/tmp/project',
          },
        },
        config
      );

      expect(mockCreateApplication).toHaveBeenCalledWith(
        expect.objectContaining({
          parameters: expect.objectContaining({
            app_type: 'native',
            token_endpoint_auth_method: 'none',
            oidc_conformant: true,
          }),
        }),
        config
      );
    });
  });

  describe('handler chaining errors', () => {
    it('should propagate create_application error', async () => {
      mockCreateApplication.mockResolvedValue({
        isError: true,
        content: [{ type: 'text', text: 'Error: Unauthorized' }],
      });

      const response = await ONBOARDING_HANDLERS.auth0_onboarding(
        {
          token,
          parameters: {
            app_name: 'My App',
            framework: 'react',
            project_path: '/tmp/project',
          },
        },
        config
      );
      expect(response.isError).toBe(true);
      expect(response.content[0].text).toBe('Error: Unauthorized');
    });

    it('should return error with client_id context when save_credentials fails', async () => {
      mockSaveCredentials.mockResolvedValue({
        isError: true,
        content: [{ type: 'text', text: 'Error: Permission denied' }],
      });

      const response = await ONBOARDING_HANDLERS.auth0_onboarding(
        {
          token,
          parameters: {
            app_name: 'My App',
            framework: 'react',
            project_path: '/tmp/project',
          },
        },
        config
      );
      expect(response.isError).toBe(true);
      expect(response.content[0].text).toContain('client_id: new-client-id');
      expect(response.content[0].text).toContain('credentials could not be saved');
      expect(response.content[0].text).toContain('Permission denied');
    });

    it('should return error when create_application response is not valid JSON', async () => {
      mockCreateApplication.mockResolvedValue({
        isError: false,
        content: [{ type: 'text', text: 'not json' }],
      });

      const response = await ONBOARDING_HANDLERS.auth0_onboarding(
        {
          token,
          parameters: {
            app_name: 'My App',
            framework: 'react',
            project_path: '/tmp/project',
          },
        },
        config
      );
      expect(response.isError).toBe(true);
      expect(response.content[0].text).toContain('Failed to parse application creation response');
    });

    it('should return error when create_application response has no client_id', async () => {
      mockCreateApplication.mockResolvedValue({
        isError: false,
        content: [{ type: 'text', text: JSON.stringify({ name: 'My App' }) }],
      });

      const response = await ONBOARDING_HANDLERS.auth0_onboarding(
        {
          token,
          parameters: {
            app_name: 'My App',
            framework: 'react',
            project_path: '/tmp/project',
          },
        },
        config
      );
      expect(response.isError).toBe(true);
      expect(response.content[0].text).toContain('client_id not found');
    });

    it('should return error when save_credentials response is not valid JSON', async () => {
      mockSaveCredentials.mockResolvedValue({
        isError: false,
        content: [{ type: 'text', text: 'not json' }],
      });

      const response = await ONBOARDING_HANDLERS.auth0_onboarding(
        {
          token,
          parameters: {
            app_name: 'My App',
            framework: 'react',
            project_path: '/tmp/project',
          },
        },
        config
      );
      expect(response.isError).toBe(true);
      expect(response.content[0].text).toContain('Failed to parse credentials save response');
    });
  });

  describe('success flow', () => {
    it('should return success with all required fields', async () => {
      const response = await ONBOARDING_HANDLERS.auth0_onboarding(
        {
          token,
          parameters: {
            app_name: 'My App',
            framework: 'react',
            project_path: '/tmp/project',
          },
        },
        config
      );

      expect(response.isError).toBe(false);
      const data = JSON.parse(response.content[0].text);
      expect(data.success).toBe(true);
      expect(data.client_id).toBe('new-client-id');
      expect(data.domain).toBe(domain);
      expect(data.app_type).toBe('spa');
      expect(data.framework).toBe('react');
      expect(data.credentials_saved_to).toBe('/project/.env');
      expect(data.keys_written).toEqual(['VITE_AUTH0_DOMAIN', 'VITE_AUTH0_CLIENT_ID']);
      expect(data.next_steps).toEqual(['auth0_get_quickstart_guide']);
      expect(data.instructions).toContain('auth0_get_quickstart_guide');
      expect(data.instructions).toContain('onboarding is not yet complete');
    });

    it('should propagate _credentials_access and skip prompt flag from the create response', async () => {
      mockCreateApplication.mockResolvedValue({
        isError: false,
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              client_id: 'new-client-id',
              name: 'My App',
              app_type: 'regular_web',
              client_secret: '[REDACTED]',
              skip_non_verifiable_callback_uri_confirmation_prompt: true,
              _credentials_access: {
                note: 'Credentials are masked for security',
                how_to_access: ['View in Auth0 Dashboard: https://manage.auth0.com/...'],
              },
            }),
          },
        ],
      });

      const response = await ONBOARDING_HANDLERS.auth0_onboarding(
        {
          token,
          parameters: {
            app_name: 'My App',
            framework: 'nextjs',
            project_path: '/tmp/project',
          },
        },
        config
      );

      expect(response.isError).toBe(false);
      const data = JSON.parse(response.content[0].text);
      expect(data._credentials_access).toBeDefined();
      expect(data._credentials_access.how_to_access).toBeDefined();
      expect(data.skip_non_verifiable_callback_uri_confirmation_prompt).toBe(true);
      expect(data.instructions).toContain('client_secret is redacted');
      expect(data.instructions).toContain(
        'skip_non_verifiable_callback_uri_confirmation_prompt was automatically enabled'
      );
    });

    it('should not include credential/skip notes when the create response omits them', async () => {
      const response = await ONBOARDING_HANDLERS.auth0_onboarding(
        {
          token,
          parameters: {
            app_name: 'My App',
            framework: 'react',
            project_path: '/tmp/project',
          },
        },
        config
      );

      const data = JSON.parse(response.content[0].text);
      expect(data._credentials_access).toBeUndefined();
      expect(data.skip_non_verifiable_callback_uri_confirmation_prompt).toBeUndefined();
      expect(data.instructions).not.toContain('client_secret is redacted');
    });

    it('should default app_name to "My App" when empty', async () => {
      await ONBOARDING_HANDLERS.auth0_onboarding(
        {
          token,
          parameters: {
            app_name: '',
            framework: 'react',
            project_path: '/tmp/project',
          },
        },
        config
      );

      expect(mockCreateApplication).toHaveBeenCalledWith(
        expect.objectContaining({
          parameters: expect.objectContaining({ name: 'My App' }),
        }),
        config
      );
    });

    it('should pass correct parameters to save_credentials', async () => {
      await ONBOARDING_HANDLERS.auth0_onboarding(
        {
          token,
          parameters: {
            app_name: 'My App',
            framework: 'react',
            project_path: '/tmp/project',
          },
        },
        config
      );

      expect(mockSaveCredentials).toHaveBeenCalledWith(
        expect.objectContaining({
          token,
          parameters: expect.objectContaining({
            client_id: 'new-client-id',
            framework: 'react',
            project_path: '/tmp/project',
          }),
        }),
        config
      );
    });

    it('should pass the token to create_application', async () => {
      await ONBOARDING_HANDLERS.auth0_onboarding(
        {
          token,
          parameters: {
            app_name: 'Test',
            framework: 'vue',
            project_path: '/tmp/project',
          },
        },
        config
      );

      expect(mockCreateApplication).toHaveBeenCalledWith(
        expect.objectContaining({ token }),
        config
      );
    });

    it('should use resolved project_path when passing to save_credentials', async () => {
      await ONBOARDING_HANDLERS.auth0_onboarding(
        {
          token,
          parameters: {
            app_name: 'My App',
            framework: 'react',
            project_path: '/tmp/./project',
          },
        },
        config
      );

      expect(mockSaveCredentials).toHaveBeenCalledWith(
        expect.objectContaining({
          parameters: expect.objectContaining({ project_path: '/tmp/project' }),
        }),
        config
      );
    });

    it('should accept framework in any case', async () => {
      const response = await ONBOARDING_HANDLERS.auth0_onboarding(
        {
          token,
          parameters: {
            app_name: 'My App',
            framework: 'React',
            project_path: '/tmp/project',
          },
        },
        config
      );
      expect(response.isError).toBe(false);
    });
  });
});
