import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { http, HttpResponse } from 'msw';
import { server } from '../setup';
import { mockConfig } from '../mocks/config';

vi.mock('../../src/utils/logger', () => ({
  log: vi.fn(),
}));

const mockFetchQuickstartSpec = vi.fn();
vi.mock('../../src/utils/quickstarts', () => ({
  fetchQuickstartSpec: (...args: any[]) => mockFetchQuickstartSpec(...args),
}));

const mockExistsSync = vi.fn();
const mockStatSync = vi.fn();
vi.mock('fs', () => ({
  existsSync: (...args: any[]) => mockExistsSync(...args),
  statSync: (...args: any[]) => mockStatSync(...args),
}));

const MOCK_LLM_PROMPT_URL =
  'https://cdn.auth0.com/manhattan/quickstarts/versions/1.0.0/assets/prompts/en/react-prompt.md';
const MOCK_LLM_PROMPT =
  'Install the SDK.\nDomain: %AUTH0_DOMAIN%\nClient ID: %AUTH0_CLIENT_ID%\nPort: %PORT%';

const makeMockSpec = (overrides: Record<string, any> = {}) => ({
  appType: 'spa',
  defaultAppOrigin: { scheme: 'http', domain: 'localhost', port: 3000 },
  callbackPath: '/callback',
  logoutPath: '/',
  llmPromptPath: 'assets/llm-prompts/react-llm-prompt.md',
  llmPromptUrl: MOCK_LLM_PROMPT_URL,
  envSnippet: {
    type: 'env',
    language: 'shell',
    fileName: '.env',
    entries: [
      { type: 'var', name: 'VITE_AUTH0_DOMAIN', value: '{yourDomain}' },
      { type: 'var', name: 'VITE_AUTH0_CLIENT_ID', value: '{yourClientId}' },
    ],
  },
  placeholders: {
    '%AUTH0_DOMAIN%': { inputKey: 'auth0Domain' },
    '%AUTH0_CLIENT_ID%': { inputKey: 'auth0ClientId' },
    '%PORT%': { inputKey: 'port' },
    '%APP_DOMAIN%': { inputKey: 'appDomain' },
    '%APP_SCHEME%': { inputKey: 'appScheme' },
    '%SDK_VERSION%': '2.x',
  },
  inputs: {
    auth0Domain: null,
    auth0ClientId: null,
    port: { default: 3000 },
    appDomain: { default: 'localhost' },
    appScheme: { default: 'http' },
  },
  environment: {
    gitBranch: 'quickstart/login',
    gitRemote: 'https://github.com/auth0-samples/auth0-react-samples',
  },
  ...overrides,
});

const mockAppData = {
  client_id: 'test-client-id',
  name: 'Test App',
  app_type: 'spa',
  callbacks: ['https://example.com/callback'],
  allowed_logout_urls: ['https://example.com'],
  web_origins: ['https://example.com'],
};

describe('auth0_get_quickstart_guide', () => {
  let QUICKSTART_HANDLERS: typeof import('../../src/tools/quickstarts').QUICKSTART_HANDLERS;
  let QUICKSTART_TOOLS: typeof import('../../src/tools/quickstarts').QUICKSTART_TOOLS;

  const domain = mockConfig.domain;
  const token = mockConfig.token;
  const config = { domain };

  beforeEach(async () => {
    vi.resetAllMocks();
    mockFetchQuickstartSpec.mockResolvedValue(makeMockSpec());
    mockExistsSync.mockReturnValue(true);
    mockStatSync.mockReturnValue({ isDirectory: () => true });

    // MSW handler for the LLM prompt CDN
    server.use(
      http.get(MOCK_LLM_PROMPT_URL, () => {
        return new HttpResponse(MOCK_LLM_PROMPT, { status: 200 });
      })
    );

    // MSW handler for the application GET (returns full app data)
    server.use(
      http.get('https://*/api/v2/clients/:clientId', ({ params }) => {
        if (params.clientId === 'test-client-id') {
          return HttpResponse.json(mockAppData);
        }
        return new HttpResponse(null, { status: 404 });
      })
    );

    // MSW handler for the application PATCH
    server.use(
      http.patch('https://*/api/v2/clients/:clientId', async ({ params, request }) => {
        const updates = (await request.json()) as Record<string, any>;
        return HttpResponse.json({ ...mockAppData, ...updates });
      })
    );

    const mod = await import('../../src/tools/quickstarts');
    QUICKSTART_HANDLERS = mod.QUICKSTART_HANDLERS;
    QUICKSTART_TOOLS = mod.QUICKSTART_TOOLS;
  });

  afterEach(() => {
    server.resetHandlers();
  });

  describe('tool metadata', () => {
    it('should mark the tool as destructive because it updates application URLs', () => {
      const tool = QUICKSTART_TOOLS.find((t) => t.name === 'auth0_get_quickstart_guide');
      expect(tool?.annotations?.readOnlyHint).toBe(false);
      expect(tool?.annotations?.destructiveHint).toBe(true);
    });
  });

  describe('parameter validation', () => {
    it('should return error when client_id is missing', async () => {
      const response = await QUICKSTART_HANDLERS.auth0_get_quickstart_guide(
        { token, parameters: { framework: 'react', project_path: '/tmp/project' } },
        config
      );
      expect(response.isError).toBe(true);
      expect(response.content[0].text).toContain('client_id is required');
    });

    it('should return error when framework is missing', async () => {
      const response = await QUICKSTART_HANDLERS.auth0_get_quickstart_guide(
        { token, parameters: { client_id: 'test-client-id', project_path: '/tmp/project' } },
        config
      );
      expect(response.isError).toBe(true);
      expect(response.content[0].text).toContain('framework is required');
    });

    it('should return error when project_path is missing', async () => {
      const response = await QUICKSTART_HANDLERS.auth0_get_quickstart_guide(
        { token, parameters: { client_id: 'test-client-id', framework: 'react' } },
        config
      );
      expect(response.isError).toBe(true);
      expect(response.content[0].text).toContain('project_path is required');
    });

    it('should return error when token is missing', async () => {
      const response = await QUICKSTART_HANDLERS.auth0_get_quickstart_guide(
        {
          token: '',
          parameters: {
            client_id: 'test-client-id',
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
      const response = await QUICKSTART_HANDLERS.auth0_get_quickstart_guide(
        {
          token,
          parameters: {
            client_id: 'test-client-id',
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

  describe('quickstart spec resolution', () => {
    it('should return error when spec is unavailable', async () => {
      mockFetchQuickstartSpec.mockResolvedValue(null);

      const response = await QUICKSTART_HANDLERS.auth0_get_quickstart_guide(
        {
          token,
          parameters: {
            client_id: 'test-client-id',
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

    it('should return error when spec has no llmPromptUrl', async () => {
      mockFetchQuickstartSpec.mockResolvedValue(
        makeMockSpec({ llmPromptPath: undefined, llmPromptUrl: undefined })
      );

      const response = await QUICKSTART_HANDLERS.auth0_get_quickstart_guide(
        {
          token,
          parameters: {
            client_id: 'test-client-id',
            framework: 'react',
            project_path: '/tmp/project',
          },
        },
        config
      );
      expect(response.isError).toBe(true);
      expect(response.content[0].text).toContain('does not include an LLM prompt URL');
    });
  });

  describe('application validation', () => {
    it('should return error when application is not found', async () => {
      const response = await QUICKSTART_HANDLERS.auth0_get_quickstart_guide(
        {
          token,
          parameters: {
            client_id: 'nonexistent-id',
            framework: 'react',
            project_path: '/tmp/project',
          },
        },
        config
      );
      expect(response.isError).toBe(true);
      expect(response.content[0].text).toContain('not found');
    });

    it('should return error when application data cannot be parsed as JSON', async () => {
      server.use(
        http.get('https://*/api/v2/clients/:clientId', () => {
          return new HttpResponse('this is not json', {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          });
        })
      );

      const response = await QUICKSTART_HANDLERS.auth0_get_quickstart_guide(
        {
          token,
          parameters: {
            client_id: 'test-client-id',
            framework: 'react',
            project_path: '/tmp/project',
          },
        },
        config
      );
      expect(response.isError).toBe(true);
      expect(response.content[0].text).toContain('is not valid JSON');
    });
  });

  describe('environment file check', () => {
    it('should return error when .env file is missing', async () => {
      mockExistsSync.mockReturnValue(false);

      const response = await QUICKSTART_HANDLERS.auth0_get_quickstart_guide(
        {
          token,
          parameters: {
            client_id: 'test-client-id',
            framework: 'react',
            project_path: '/tmp/project',
          },
        },
        config
      );
      expect(response.isError).toBe(true);
      expect(response.content[0].text).toContain('No environment file found');
      expect(response.content[0].text).toContain('auth0_save_credentials_to_file');
    });

    it('should reject a spec whose envSnippet.fileName contains a path', async () => {
      mockFetchQuickstartSpec.mockResolvedValue(
        makeMockSpec({
          envSnippet: { ...makeMockSpec().envSnippet, fileName: '../../escape.env' },
        })
      );

      const response = await QUICKSTART_HANDLERS.auth0_get_quickstart_guide(
        {
          token,
          parameters: {
            client_id: 'test-client-id',
            framework: 'react',
            project_path: '/tmp/project',
          },
        },
        config
      );
      expect(response.isError).toBe(true);
      expect(response.content[0].text).toContain('invalid env file name');
    });

    it('should skip .env check when spec has no envSnippet', async () => {
      mockFetchQuickstartSpec.mockResolvedValue(makeMockSpec({ envSnippet: undefined }));
      mockExistsSync.mockReturnValue(false);

      const response = await QUICKSTART_HANDLERS.auth0_get_quickstart_guide(
        {
          token,
          parameters: {
            client_id: 'test-client-id',
            framework: 'react',
            project_path: '/tmp/project',
          },
        },
        config
      );
      expect(response.isError).toBe(false);
    });
  });

  describe('callback URL resolution and update', () => {
    it('should append missing callback URLs to the application', async () => {
      server.use(
        http.get('https://*/api/v2/clients/:clientId', () => {
          return HttpResponse.json({
            ...mockAppData,
            callbacks: [],
            allowed_logout_urls: [],
            web_origins: [],
          });
        }),
        http.patch('https://*/api/v2/clients/:clientId', async ({ request }) => {
          const body = (await request.json()) as Record<string, any>;
          const allowedFields = [
            'callbacks',
            'allowed_logout_urls',
            'web_origins',
            'skip_non_verifiable_callback_uri_confirmation_prompt',
          ];
          for (const key of Object.keys(body)) {
            expect(allowedFields).toContain(key);
          }
          expect(body.callbacks).toContain('http://localhost:3000/callback');
          expect(body.allowed_logout_urls).toContain('http://localhost:3000/');
          expect(body.web_origins).toContain('http://localhost:3000');
          return HttpResponse.json({ ...mockAppData, ...body });
        })
      );

      const response = await QUICKSTART_HANDLERS.auth0_get_quickstart_guide(
        {
          token,
          parameters: {
            client_id: 'test-client-id',
            framework: 'react',
            project_path: '/tmp/project',
          },
        },
        config
      );
      expect(response.isError).toBe(false);
    });

    it('should not update when all URLs are already configured', async () => {
      server.use(
        http.get('https://*/api/v2/clients/:clientId', () => {
          return HttpResponse.json({
            ...mockAppData,
            callbacks: ['http://localhost:3000/callback'],
            allowed_logout_urls: ['http://localhost:3000/'],
            web_origins: ['http://localhost:3000'],
          });
        }),
        http.patch('https://*/api/v2/clients/:clientId', () => {
          throw new Error('Should not call update when no URLs to add');
        })
      );

      const response = await QUICKSTART_HANDLERS.auth0_get_quickstart_guide(
        {
          token,
          parameters: {
            client_id: 'test-client-id',
            framework: 'react',
            project_path: '/tmp/project',
          },
        },
        config
      );
      expect(response.isError).toBe(false);
      const result = JSON.parse(response.content[0].text);
      expect(result.urls_updated).toBe(false);
      expect(result.actions_taken).toEqual(['Fetched quickstart guide for react']);
    });

    it('should include specific URL values in actions_taken messages', async () => {
      server.use(
        http.get('https://*/api/v2/clients/:clientId', () => {
          return HttpResponse.json({
            ...mockAppData,
            callbacks: [],
            allowed_logout_urls: [],
            web_origins: [],
          });
        })
      );

      const response = await QUICKSTART_HANDLERS.auth0_get_quickstart_guide(
        {
          token,
          parameters: {
            client_id: 'test-client-id',
            framework: 'react',
            project_path: '/tmp/project',
          },
        },
        config
      );
      const result = JSON.parse(response.content[0].text);
      expect(result.actions_taken).toContainEqual(
        expect.stringContaining('Set callback URL(s): http://localhost:3000/callback')
      );
      expect(result.actions_taken).toContainEqual(
        expect.stringContaining('Set logout URL(s): http://localhost:3000/')
      );
      expect(result.actions_taken).toContainEqual(
        expect.stringContaining('Set allowed web origin(s): http://localhost:3000')
      );
      expect(result.actions_taken).toContain('Fetched quickstart guide for react');
    });

    it('should omit web_origins from actions_taken for webapp apps', async () => {
      mockFetchQuickstartSpec.mockResolvedValue(makeMockSpec({ appType: 'webapp' }));

      server.use(
        http.get('https://*/api/v2/clients/:clientId', () => {
          return HttpResponse.json({ ...mockAppData, callbacks: [], allowed_logout_urls: [] });
        })
      );

      const response = await QUICKSTART_HANDLERS.auth0_get_quickstart_guide(
        {
          token,
          parameters: {
            client_id: 'test-client-id',
            framework: 'react',
            project_path: '/tmp/project',
          },
        },
        config
      );
      const result = JSON.parse(response.content[0].text);
      expect(result.urls_updated).toBe(true);
      expect(result.actions_taken).toContainEqual(expect.stringContaining('Set callback URL(s)'));
      expect(result.actions_taken).toContainEqual(expect.stringContaining('Set logout URL(s)'));
      expect(result.actions_taken).not.toContainEqual(expect.stringContaining('web origin'));
    });

    it('should report all non-empty finalUrls fields when any update is needed', async () => {
      server.use(
        http.get('https://*/api/v2/clients/:clientId', () => {
          return HttpResponse.json({
            ...mockAppData,
            callbacks: ['http://localhost:3000/callback'],
            allowed_logout_urls: [],
            web_origins: ['http://localhost:3000'],
          });
        })
      );

      const response = await QUICKSTART_HANDLERS.auth0_get_quickstart_guide(
        {
          token,
          parameters: {
            client_id: 'test-client-id',
            framework: 'react',
            project_path: '/tmp/project',
          },
        },
        config
      );
      const result = JSON.parse(response.content[0].text);
      expect(result.urls_updated).toBe(true);
      expect(result.actions_taken).toContainEqual(expect.stringContaining('Set callback URL(s)'));
      expect(result.actions_taken).toContainEqual(expect.stringContaining('Set logout URL(s)'));
      expect(result.actions_taken).toContainEqual(
        expect.stringContaining('Set allowed web origin(s)')
      );
    });

    it('should use base_url when provided', async () => {
      server.use(
        http.get('https://*/api/v2/clients/:clientId', () => {
          return HttpResponse.json({
            ...mockAppData,
            callbacks: [],
            allowed_logout_urls: [],
            web_origins: [],
          });
        }),
        http.patch('https://*/api/v2/clients/:clientId', async ({ request }) => {
          const body = (await request.json()) as Record<string, any>;
          expect(body.callbacks).toContain('http://localhost:4200/callback');
          return HttpResponse.json({ ...mockAppData, ...body });
        })
      );

      const response = await QUICKSTART_HANDLERS.auth0_get_quickstart_guide(
        {
          token,
          parameters: {
            client_id: 'test-client-id',
            framework: 'react',
            project_path: '/tmp/project',
            base_url: 'http://localhost:4200',
          },
        },
        config
      );
      expect(response.isError).toBe(false);
      const result = JSON.parse(response.content[0].text);
      expect(result.url_source).toBe('detected');
    });

    it('should preserve existing URLs when appending new ones', async () => {
      server.use(
        http.get('https://*/api/v2/clients/:clientId', () => {
          return HttpResponse.json({
            ...mockAppData,
            callbacks: ['https://prod.example.com/callback'],
            allowed_logout_urls: ['https://prod.example.com'],
            web_origins: ['https://prod.example.com'],
          });
        }),
        http.patch('https://*/api/v2/clients/:clientId', async ({ request }) => {
          const body = (await request.json()) as Record<string, any>;
          expect(body.callbacks).toContain('https://prod.example.com/callback');
          expect(body.callbacks).toContain('http://localhost:3000/callback');
          return HttpResponse.json({ ...mockAppData, ...body });
        })
      );

      const response = await QUICKSTART_HANDLERS.auth0_get_quickstart_guide(
        {
          token,
          parameters: {
            client_id: 'test-client-id',
            framework: 'react',
            project_path: '/tmp/project',
          },
        },
        config
      );
      expect(response.isError).toBe(false);
    });

    it('should not update when base_url is invalid', async () => {
      let patchCalled = false;
      server.use(
        http.get('https://*/api/v2/clients/:clientId', () => {
          return HttpResponse.json({
            ...mockAppData,
            callbacks: [],
            allowed_logout_urls: [],
            web_origins: [],
          });
        }),
        http.patch('https://*/api/v2/clients/:clientId', () => {
          patchCalled = true;
          return HttpResponse.json(mockAppData);
        })
      );

      const response = await QUICKSTART_HANDLERS.auth0_get_quickstart_guide(
        {
          token,
          parameters: {
            client_id: 'test-client-id',
            framework: 'react',
            project_path: '/tmp/project',
            base_url: 'not-a-url',
          },
        },
        config
      );
      expect(response.isError).toBe(true);
      expect(response.content[0].text).toContain('Invalid resolved base URL');
      expect(patchCalled).toBe(false);
    });

    it('should not call PATCH when calculateUrlUpdates finds no changes needed', async () => {
      let patchCalled = false;
      server.use(
        http.get('https://*/api/v2/clients/:clientId', () => {
          return HttpResponse.json({
            ...mockAppData,
            callbacks: ['http://localhost:3000/callback'],
            allowed_logout_urls: ['http://localhost:3000/'],
            web_origins: ['http://localhost:3000'],
          });
        }),
        http.patch('https://*/api/v2/clients/:clientId', () => {
          patchCalled = true;
          return HttpResponse.json(mockAppData);
        })
      );

      const response = await QUICKSTART_HANDLERS.auth0_get_quickstart_guide(
        {
          token,
          parameters: {
            client_id: 'test-client-id',
            framework: 'react',
            project_path: '/tmp/project',
          },
        },
        config
      );
      expect(response.isError).toBe(false);
      const result = JSON.parse(response.content[0].text);
      expect(result.urls_updated).toBe(false);
      expect(patchCalled).toBe(false);
    });

    it('should use the provided client_id in both GET and PATCH API calls', async () => {
      let getCalled = false;
      let patchCalledWithCorrectId = false;

      server.use(
        http.get('https://*/api/v2/clients/:clientId', ({ params }) => {
          if (params.clientId === 'specific-client-123') {
            getCalled = true;
            return HttpResponse.json({
              ...mockAppData,
              client_id: 'specific-client-123',
              callbacks: [],
              allowed_logout_urls: [],
              web_origins: [],
            });
          }
          return new HttpResponse(null, { status: 404 });
        }),
        http.patch('https://*/api/v2/clients/:clientId', async ({ params, request }) => {
          if (params.clientId === 'specific-client-123') {
            patchCalledWithCorrectId = true;
          }
          const updates = (await request.json()) as Record<string, any>;
          return HttpResponse.json({ ...mockAppData, ...updates });
        })
      );

      const response = await QUICKSTART_HANDLERS.auth0_get_quickstart_guide(
        {
          token,
          parameters: {
            client_id: 'specific-client-123',
            framework: 'react',
            project_path: '/tmp/project',
          },
        },
        config
      );
      expect(response.isError).toBe(false);
      expect(getCalled).toBe(true);
      expect(patchCalledWithCorrectId).toBe(true);
    });

    it('should only send allowed URL fields in PATCH payload', async () => {
      let patchBody: Record<string, any> = {};
      server.use(
        http.get('https://*/api/v2/clients/:clientId', () => {
          return HttpResponse.json({
            ...mockAppData,
            callbacks: [],
            allowed_logout_urls: [],
            web_origins: [],
          });
        }),
        http.patch('https://*/api/v2/clients/:clientId', async ({ request }) => {
          patchBody = (await request.json()) as Record<string, any>;
          return HttpResponse.json({ ...mockAppData, ...patchBody });
        })
      );

      const response = await QUICKSTART_HANDLERS.auth0_get_quickstart_guide(
        {
          token,
          parameters: {
            client_id: 'test-client-id',
            framework: 'react',
            project_path: '/tmp/project',
          },
        },
        config
      );
      expect(response.isError).toBe(false);
      expect(patchBody.callbacks).toBeDefined();
      expect(patchBody.allowed_logout_urls).toBeDefined();
      expect(patchBody.web_origins).toBeDefined();
    });
  });

  describe('LLM prompt fetching', () => {
    it('should return error when prompt fetch fails with 404', async () => {
      let patchCalled = false;
      server.use(
        http.patch('https://*/api/v2/clients/:clientId', () => {
          patchCalled = true;
          return HttpResponse.json(mockAppData);
        }),
        http.get(MOCK_LLM_PROMPT_URL, () => {
          return new HttpResponse(null, { status: 404 });
        })
      );

      const response = await QUICKSTART_HANDLERS.auth0_get_quickstart_guide(
        {
          token,
          parameters: {
            client_id: 'test-client-id',
            framework: 'react',
            project_path: '/tmp/project',
          },
        },
        config
      );
      expect(response.isError).toBe(true);
      expect(response.content[0].text).toContain('Quickstart guide unavailable');
      expect(patchCalled).toBe(false);
    });

    it('should return error when prompt fetch fails with 500', async () => {
      let patchCalled = false;
      server.use(
        http.patch('https://*/api/v2/clients/:clientId', () => {
          patchCalled = true;
          return HttpResponse.json(mockAppData);
        }),
        http.get(MOCK_LLM_PROMPT_URL, () => {
          return new HttpResponse(null, { status: 500 });
        })
      );

      const response = await QUICKSTART_HANDLERS.auth0_get_quickstart_guide(
        {
          token,
          parameters: {
            client_id: 'test-client-id',
            framework: 'react',
            project_path: '/tmp/project',
          },
        },
        config
      );
      expect(response.isError).toBe(true);
      expect(response.content[0].text).toContain('Quickstart guide unavailable');
      expect(patchCalled).toBe(false);
    });

    it('should return error on network failure', async () => {
      let patchCalled = false;
      server.use(
        http.patch('https://*/api/v2/clients/:clientId', () => {
          patchCalled = true;
          return HttpResponse.json(mockAppData);
        }),
        http.get(MOCK_LLM_PROMPT_URL, () => {
          return HttpResponse.error();
        })
      );

      const response = await QUICKSTART_HANDLERS.auth0_get_quickstart_guide(
        {
          token,
          parameters: {
            client_id: 'test-client-id',
            framework: 'react',
            project_path: '/tmp/project',
          },
        },
        config
      );
      expect(response.isError).toBe(true);
      expect(response.content[0].text).toContain('Quickstart guide unavailable');
      expect(patchCalled).toBe(false);
    });
  });

  describe('placeholder injection', () => {
    it('should inject domain and client_id placeholders', async () => {
      const response = await QUICKSTART_HANDLERS.auth0_get_quickstart_guide(
        {
          token,
          parameters: {
            client_id: 'test-client-id',
            framework: 'react',
            project_path: '/tmp/project',
          },
        },
        config
      );
      expect(response.isError).toBe(false);
      const result = JSON.parse(response.content[0].text);
      expect(result.quickstart_prompt).toContain('test-tenant.auth0.com');
      expect(result.quickstart_prompt).toContain('test-client-id');
      expect(result.quickstart_prompt).toContain('3000');
      expect(result.quickstart_prompt).not.toContain('%AUTH0_DOMAIN%');
      expect(result.quickstart_prompt).not.toContain('%AUTH0_CLIENT_ID%');
      expect(result.quickstart_prompt).not.toContain('%PORT%');
    });

    it('should leave unresolvable placeholders unchanged', async () => {
      mockFetchQuickstartSpec.mockResolvedValue(
        makeMockSpec({
          placeholders: {
            '%AUTH0_DOMAIN%': { inputKey: 'auth0Domain' },
            '%MISSING%': { inputKey: 'nonexistent' },
          },
        })
      );

      server.use(
        http.get(MOCK_LLM_PROMPT_URL, () => {
          return new HttpResponse('Domain: %AUTH0_DOMAIN% and %MISSING% here', { status: 200 });
        })
      );

      const response = await QUICKSTART_HANDLERS.auth0_get_quickstart_guide(
        {
          token,
          parameters: {
            client_id: 'test-client-id',
            framework: 'react',
            project_path: '/tmp/project',
          },
        },
        config
      );
      expect(response.isError).toBe(false);
      const result = JSON.parse(response.content[0].text);
      expect(result.quickstart_prompt).toContain('%MISSING%');
      expect(result.quickstart_prompt).not.toContain('%AUTH0_DOMAIN%');
    });
  });

  describe('success response', () => {
    it('should return complete success response with all fields', async () => {
      const response = await QUICKSTART_HANDLERS.auth0_get_quickstart_guide(
        {
          token,
          parameters: {
            client_id: 'test-client-id',
            framework: 'react',
            project_path: '/tmp/project',
          },
        },
        config
      );
      expect(response.isError).toBe(false);
      const result = JSON.parse(response.content[0].text);

      expect(result.success).toBe(true);
      expect(result.client_id).toBe('test-client-id');
      expect(result.framework).toBe('react');
      expect(result.project_path).toBe('/tmp/project');
      expect(result.app_type).toBe('spa');
      expect(result.quickstart_prompt).toBeDefined();
      expect(result.configured_urls).toBeDefined();
      expect(result.configured_urls.callbacks).toBeDefined();
      expect(result.configured_urls.allowed_logout_urls).toBeDefined();
      expect(result.url_source).toBeDefined();
      expect(result.urls_updated).toBe(true);
      expect(result.actions_taken).toBeInstanceOf(Array);
      expect(result.actions_taken).toContain('Fetched quickstart guide for react');
      expect(result.instructions).toContain('summarize actions_taken');
    });

    it('should include web_origins for SPA apps', async () => {
      const response = await QUICKSTART_HANDLERS.auth0_get_quickstart_guide(
        {
          token,
          parameters: {
            client_id: 'test-client-id',
            framework: 'react',
            project_path: '/tmp/project',
          },
        },
        config
      );
      const result = JSON.parse(response.content[0].text);
      expect(result.configured_urls.web_origins).toBeDefined();
    });

    it('should omit web_origins for webapp apps', async () => {
      mockFetchQuickstartSpec.mockResolvedValue(makeMockSpec({ appType: 'webapp' }));

      const response = await QUICKSTART_HANDLERS.auth0_get_quickstart_guide(
        {
          token,
          parameters: {
            client_id: 'test-client-id',
            framework: 'react',
            project_path: '/tmp/project',
          },
        },
        config
      );
      const result = JSON.parse(response.content[0].text);
      expect(result.configured_urls.web_origins).toBeUndefined();
    });

    it('should set url_source to framework_default when no base_url provided', async () => {
      const response = await QUICKSTART_HANDLERS.auth0_get_quickstart_guide(
        {
          token,
          parameters: {
            client_id: 'test-client-id',
            framework: 'react',
            project_path: '/tmp/project',
          },
        },
        config
      );
      const result = JSON.parse(response.content[0].text);
      expect(result.url_source).toBe('framework_default');
    });

    it('should set url_source to detected when base_url is provided', async () => {
      server.use(
        http.get('https://*/api/v2/clients/:clientId', () => {
          return HttpResponse.json({
            ...mockAppData,
            callbacks: [],
            allowed_logout_urls: [],
            web_origins: [],
          });
        })
      );

      const response = await QUICKSTART_HANDLERS.auth0_get_quickstart_guide(
        {
          token,
          parameters: {
            client_id: 'test-client-id',
            framework: 'react',
            project_path: '/tmp/project',
            base_url: 'http://localhost:4200',
          },
        },
        config
      );
      const result = JSON.parse(response.content[0].text);
      expect(result.url_source).toBe('detected');
    });
  });

  describe('non-verifiable callback detection', () => {
    it('should include skip flag when localhost callbacks are configured', async () => {
      server.use(
        http.get('https://*/api/v2/clients/:clientId', () => {
          return HttpResponse.json({
            ...mockAppData,
            callbacks: [],
            allowed_logout_urls: [],
            web_origins: [],
          });
        })
      );

      const response = await QUICKSTART_HANDLERS.auth0_get_quickstart_guide(
        {
          token,
          parameters: {
            client_id: 'test-client-id',
            framework: 'react',
            project_path: '/tmp/project',
          },
        },
        config
      );
      const result = JSON.parse(response.content[0].text);
      expect(result.configured_urls.skip_non_verifiable_callback_uri_confirmation_prompt).toBe(
        true
      );
    });

    it('should not include skip flag when only HTTPS production URLs exist', async () => {
      mockFetchQuickstartSpec.mockResolvedValue(
        makeMockSpec({
          defaultAppOrigin: { scheme: 'https', domain: 'myapp.com' },
        })
      );

      server.use(
        http.get('https://*/api/v2/clients/:clientId', () => {
          return HttpResponse.json({
            ...mockAppData,
            callbacks: ['https://myapp.com/callback'],
            allowed_logout_urls: ['https://myapp.com/'],
            web_origins: ['https://myapp.com'],
          });
        })
      );

      const response = await QUICKSTART_HANDLERS.auth0_get_quickstart_guide(
        {
          token,
          parameters: {
            client_id: 'test-client-id',
            framework: 'react',
            project_path: '/tmp/project',
          },
        },
        config
      );
      const result = JSON.parse(response.content[0].text);
      expect(
        result.configured_urls.skip_non_verifiable_callback_uri_confirmation_prompt
      ).toBeUndefined();
    });
  });

  describe('defensive error handling', () => {
    it('should handle application GET returning an error gracefully', async () => {
      server.use(
        http.get('https://*/api/v2/clients/:clientId', () => {
          return new HttpResponse(
            JSON.stringify({ statusCode: 500, message: 'Internal Server Error' }),
            {
              status: 500,
            }
          );
        })
      );

      const response = await QUICKSTART_HANDLERS.auth0_get_quickstart_guide(
        {
          token,
          parameters: {
            client_id: 'test-client-id',
            framework: 'react',
            project_path: '/tmp/project',
          },
        },
        config
      );
      expect(response.isError).toBe(true);
      expect(response.content[0].text).toBeDefined();
    });

    it('should handle update error with malformed response gracefully', async () => {
      server.use(
        http.get('https://*/api/v2/clients/:clientId', () => {
          return HttpResponse.json({
            ...mockAppData,
            callbacks: [],
            allowed_logout_urls: [],
            web_origins: [],
          });
        }),
        http.patch('https://*/api/v2/clients/:clientId', () => {
          return new HttpResponse(JSON.stringify({ error: 'forbidden' }), { status: 403 });
        })
      );

      const response = await QUICKSTART_HANDLERS.auth0_get_quickstart_guide(
        {
          token,
          parameters: {
            client_id: 'test-client-id',
            framework: 'react',
            project_path: '/tmp/project',
          },
        },
        config
      );
      expect(response.isError).toBe(true);
      expect(response.content[0].text).toContain('Failed to update application callback URLs');
    });
  });

  describe('path traversal protection', () => {
    it('should reject project_path containing traversal sequences', async () => {
      const response = await QUICKSTART_HANDLERS.auth0_get_quickstart_guide(
        {
          token,
          parameters: {
            client_id: 'test-client-id',
            framework: 'react',
            project_path: '../../etc',
          },
        },
        config
      );
      expect(response.isError).toBe(true);
      expect(response.content[0].text).toContain('path traversal');
    });

    it('should reject deeply nested traversal', async () => {
      const response = await QUICKSTART_HANDLERS.auth0_get_quickstart_guide(
        {
          token,
          parameters: {
            client_id: 'test-client-id',
            framework: 'react',
            project_path: '/tmp/project/../../../etc/passwd',
          },
        },
        config
      );
      expect(response.isError).toBe(true);
      expect(response.content[0].text).toContain('path traversal');
    });
  });

  describe('project_path directory validation', () => {
    it('should reject project_path that is not an existing directory', async () => {
      mockStatSync.mockReturnValue(null);

      const response = await QUICKSTART_HANDLERS.auth0_get_quickstart_guide(
        {
          token,
          parameters: {
            client_id: 'test-client-id',
            framework: 'react',
            project_path: '/tmp/project',
          },
        },
        config
      );
      expect(response.isError).toBe(true);
      expect(response.content[0].text).toContain('must be an existing directory');
    });

    it('should reject project_path that is a file', async () => {
      mockStatSync.mockReturnValue({ isDirectory: () => false });

      const response = await QUICKSTART_HANDLERS.auth0_get_quickstart_guide(
        {
          token,
          parameters: {
            client_id: 'test-client-id',
            framework: 'react',
            project_path: '/tmp/project',
          },
        },
        config
      );
      expect(response.isError).toBe(true);
      expect(response.content[0].text).toContain('must be an existing directory');
    });

    it('should reject project_path when statSync returns undefined (throwIfNoEntry: false)', async () => {
      mockStatSync.mockReturnValue(undefined);

      const response = await QUICKSTART_HANDLERS.auth0_get_quickstart_guide(
        {
          token,
          parameters: {
            client_id: 'test-client-id',
            framework: 'react',
            project_path: '/tmp/nonexistent',
          },
        },
        config
      );
      expect(response.isError).toBe(true);
      expect(response.content[0].text).toContain('must be an existing directory');
    });
  });

  describe('framework validation', () => {
    it('should reject unsupported framework values', async () => {
      const response = await QUICKSTART_HANDLERS.auth0_get_quickstart_guide(
        {
          token,
          parameters: {
            client_id: 'test-client-id',
            framework: 'svelte',
            project_path: '/tmp/project',
          },
        },
        config
      );
      expect(response.isError).toBe(true);
      expect(response.content[0].text).toContain('Unsupported framework');
      expect(response.content[0].text).toContain('react, vue, angular, nextjs');
    });

    it('should accept mixed-case framework values', async () => {
      const response = await QUICKSTART_HANDLERS.auth0_get_quickstart_guide(
        {
          token,
          parameters: {
            client_id: 'test-client-id',
            framework: 'React',
            project_path: '/tmp/project',
          },
        },
        config
      );
      expect(response.isError).toBeFalsy();
    });
  });

  describe('port injection logic', () => {
    it('should use spec default port when base_url has no explicit port', async () => {
      mockFetchQuickstartSpec.mockResolvedValue(
        makeMockSpec({ defaultAppOrigin: { scheme: 'http', domain: 'localhost', port: 3000 } })
      );

      server.use(
        http.get('https://*/api/v2/clients/:clientId', () => {
          return HttpResponse.json({
            ...mockAppData,
            callbacks: [],
            allowed_logout_urls: [],
            web_origins: [],
          });
        })
      );

      const response = await QUICKSTART_HANDLERS.auth0_get_quickstart_guide(
        {
          token,
          parameters: {
            client_id: 'test-client-id',
            framework: 'react',
            project_path: '/tmp/project',
            base_url: 'http://localhost',
          },
        },
        config
      );
      expect(response.isError).toBe(false);
      const result = JSON.parse(response.content[0].text);
      expect(result.quickstart_prompt).toContain('3000');
    });

    it('should use explicit URL port over spec default', async () => {
      mockFetchQuickstartSpec.mockResolvedValue(
        makeMockSpec({ defaultAppOrigin: { scheme: 'http', domain: 'localhost', port: 3000 } })
      );

      server.use(
        http.get('https://*/api/v2/clients/:clientId', () => {
          return HttpResponse.json({
            ...mockAppData,
            callbacks: [],
            allowed_logout_urls: [],
            web_origins: [],
          });
        })
      );

      const response = await QUICKSTART_HANDLERS.auth0_get_quickstart_guide(
        {
          token,
          parameters: {
            client_id: 'test-client-id',
            framework: 'react',
            project_path: '/tmp/project',
            base_url: 'http://localhost:8080',
          },
        },
        config
      );
      expect(response.isError).toBe(false);
      const result = JSON.parse(response.content[0].text);
      expect(result.quickstart_prompt).toContain('8080');
    });

    it('should fall back to 443 for HTTPS when no port in URL or spec', async () => {
      mockFetchQuickstartSpec.mockResolvedValue(
        makeMockSpec({ defaultAppOrigin: { scheme: 'https', domain: 'myapp.com' } })
      );

      server.use(
        http.get('https://*/api/v2/clients/:clientId', () => {
          return HttpResponse.json({ ...mockAppData, callbacks: [], allowed_logout_urls: [] });
        })
      );

      const response = await QUICKSTART_HANDLERS.auth0_get_quickstart_guide(
        {
          token,
          parameters: {
            client_id: 'test-client-id',
            framework: 'react',
            project_path: '/tmp/project',
            base_url: 'https://myapp.com',
          },
        },
        config
      );
      expect(response.isError).toBe(false);
      const result = JSON.parse(response.content[0].text);
      expect(result.quickstart_prompt).toContain('443');
    });

    it('should fall back to 80 for HTTP when no port in URL or spec', async () => {
      mockFetchQuickstartSpec.mockResolvedValue(
        makeMockSpec({ defaultAppOrigin: { scheme: 'http', domain: 'localhost' } })
      );

      server.use(
        http.get('https://*/api/v2/clients/:clientId', () => {
          return HttpResponse.json({
            ...mockAppData,
            callbacks: [],
            allowed_logout_urls: [],
            web_origins: [],
          });
        })
      );

      const response = await QUICKSTART_HANDLERS.auth0_get_quickstart_guide(
        {
          token,
          parameters: {
            client_id: 'test-client-id',
            framework: 'react',
            project_path: '/tmp/project',
            base_url: 'http://localhost',
          },
        },
        config
      );
      expect(response.isError).toBe(false);
      const result = JSON.parse(response.content[0].text);
      expect(result.quickstart_prompt).toContain('80');
    });
  });
});
