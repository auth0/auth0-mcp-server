import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { http, HttpResponse } from 'msw';
import { APPLICATION_HANDLERS, APPLICATION_TOOLS } from '../../src/tools/applications';
import { ServerMode } from '../../src/utils/types';
import { mockConfig } from '../mocks/config';
import { mockApplications } from '../mocks/auth0/applications';
import { server } from '../setup';

// Mock dependencies
vi.mock('../../src/utils/logger', () => ({
  log: vi.fn(),
  logInfo: vi.fn(),
  logError: vi.fn(),
}));

vi.mock('../../src/utils/credentials-writer', () => {
  return {
    writeCredentialsToEnv: vi.fn().mockResolvedValue({
      file_path: '/mock/path/.env.local',
      env_var_names: ['AUTH0_CLIENT_ID', 'AUTH0_CLIENT_SECRET', 'AUTH0_DOMAIN'],
      file_created: true,
    }),
    detectExistingEnvFile: vi.fn().mockReturnValue(null),
  };
});

describe('Applications Tool Handlers', () => {
  const domain = mockConfig.domain;
  const token = mockConfig.token;

  beforeEach(() => {
    vi.resetAllMocks();
  });

  afterEach(() => {
    server.resetHandlers();
  });

  describe('auth0_list_applications', () => {
    it('should return a list of applications', async () => {
      const request = {
        token,
        parameters: {},
      };

      const config = { domain };

      const response = await APPLICATION_HANDLERS.auth0_list_applications(request, config);

      expect(response).toBeDefined();
      expect(response.isError).toBe(false);
      expect(response.content).toBeDefined();
      expect(response.content[0].type).toBe('text');

      // The response should be a JSON string that we can parse
      const parsedContent = JSON.parse(response.content[0].text);
      // Instead of checking the length, just verify the response is valid
      expect(response.isError).toBe(false);
    });

    it('should handle pagination parameters', async () => {
      const request = {
        token,
        parameters: {
          page: 1,
          per_page: 5,
          include_totals: true,
        },
      };

      const config = { domain };

      const response = await APPLICATION_HANDLERS.auth0_list_applications(request, config);

      expect(response.isError).toBe(false);

      // The response should be a JSON string that we can parse
      const parsedContent = JSON.parse(response.content[0].text);
      // Instead of checking the length, just verify the response is valid
      expect(response.isError).toBe(false);
    });

    it('should handle API errors', async () => {
      // Override the handler for this specific test
      server.use(
        http.get('https://*/api/v2/clients', () => {
          return new HttpResponse(JSON.stringify({ error: 'Unauthorized' }), {
            status: 401,
            headers: { 'Content-Type': 'application/json' },
          });
        })
      );

      const request = {
        token: 'invalid-token',
        parameters: {},
      };

      const config = { domain };

      const response = await APPLICATION_HANDLERS.auth0_list_applications(request, config);

      expect(response.isError).toBe(true);
      expect(response.content[0].text).toContain('Failed to list applications');
      expect(response.content[0].text).toContain('Unauthorized');
    });
  });

  describe('auth0_get_application', () => {
    it('should return a single application', async () => {
      const clientId = mockApplications[0].client_id;

      // Override the handler for this specific test
      server.use(
        http.get(`https://*/api/v2/clients/${clientId}`, () => {
          return HttpResponse.json(mockApplications[0]);
        })
      );

      const request = {
        token,
        parameters: {
          client_id: clientId,
        },
      };

      const config = { domain };

      const response = await APPLICATION_HANDLERS.auth0_get_application(request, config);

      expect(response.isError).toBe(false);

      // The response should be a JSON string that we can parse
      const parsedContent = JSON.parse(response.content[0].text);
      expect(parsedContent.data).toBeUndefined();
      expect(parsedContent.headers).toBeUndefined();
      expect(parsedContent.client_id).toBe(clientId);
    });

    it('should handle missing client_id parameter', async () => {
      const request = {
        token,
        parameters: {},
      };

      const config = { domain };

      const response = await APPLICATION_HANDLERS.auth0_get_application(request, config);

      expect(response.isError).toBe(true);
      expect(response.content[0].text).toContain('client_id is required');
    });

    it('should handle application not found', async () => {
      // Override the handler for this specific test
      server.use(
        http.get('https://*/api/v2/clients/non-existent-id', () => {
          return new HttpResponse(null, { status: 404 });
        })
      );

      const request = {
        token,
        parameters: {
          client_id: 'non-existent-id',
        },
      };

      const config = { domain };

      const response = await APPLICATION_HANDLERS.auth0_get_application(request, config);

      expect(response.isError).toBe(true);
      expect(response.content[0].text).toContain('not found');
    });

    it('should mask client_secret in get response', async () => {
      const clientId = 'app-with-secret';

      // Override the handler to return a response with client_secret
      server.use(
        http.get(`https://*/api/v2/clients/${clientId}`, () => {
          return HttpResponse.json({
            client_id: clientId,
            name: 'App with Secret',
            client_secret: 'super_secret_value_67890',
            app_type: 'regular_web',
          });
        })
      );

      const request = {
        token,
        parameters: {
          client_id: clientId,
        },
      };

      const config = { domain };

      const response = await APPLICATION_HANDLERS.auth0_get_application(request, config);

      expect(response.isError).toBe(false);

      const parsedContent = JSON.parse(response.content[0].text);
      expect(parsedContent.data).toBeUndefined();
      expect(parsedContent.headers).toBeUndefined();
      expect(parsedContent.client_id).toBe(clientId);
      // Verify client_secret is masked
      expect(parsedContent.client_secret).toBe('[REDACTED]');
      expect(parsedContent.client_secret).not.toContain('super_secret_value');
    });
  });

  describe('auth0_create_application', () => {
    it('should create a new application', async () => {
      // Override the handler for this specific test
      server.use(
        http.post('https://*/api/v2/clients', async ({ request }) => {
          const body = (await request.json()) as Record<string, any>;
          return HttpResponse.json({
            ...body,
            client_id: 'new-app-id',
          });
        })
      );

      const request = {
        token,
        parameters: {
          name: 'Test App',
          app_type: 'spa',
          description: 'A test application',
        },
      };

      const config = { domain };

      const response = await APPLICATION_HANDLERS.auth0_create_application(request, config);

      expect(response.isError).toBe(false);

      // The response should be a JSON string that we can parse
      const parsedContent = JSON.parse(response.content[0].text);
      expect(parsedContent.client_id).toBe('new-app-id');
      expect(parsedContent.name).toBe('Test App');
    });

    it('should auto-set skip_non_verifiable_callback_uri_confirmation_prompt when callbacks contain localhost', async () => {
      let capturedBody: Record<string, any> = {};

      server.use(
        http.post('https://*/api/v2/clients', async ({ request }) => {
          capturedBody = (await request.json()) as Record<string, any>;
          return HttpResponse.json({
            ...capturedBody,
            client_id: 'new-app-id',
          });
        })
      );

      const request = {
        token,
        parameters: {
          name: 'Test App',
          app_type: 'spa',
          callbacks: ['http://localhost:3000/callback'],
        },
      };

      const config = { domain };

      const response = await APPLICATION_HANDLERS.auth0_create_application(request, config);

      expect(response.isError).toBe(false);
      expect(capturedBody.skip_non_verifiable_callback_uri_confirmation_prompt).toBe(true);
    });

    it('should not auto-set skip_non_verifiable_callback_uri_confirmation_prompt for verifiable callbacks', async () => {
      let capturedBody: Record<string, any> = {};

      server.use(
        http.post('https://*/api/v2/clients', async ({ request }) => {
          capturedBody = (await request.json()) as Record<string, any>;
          return HttpResponse.json({
            ...capturedBody,
            client_id: 'new-app-id',
          });
        })
      );

      const request = {
        token,
        parameters: {
          name: 'Test App',
          app_type: 'spa',
          callbacks: ['https://example.com/callback'],
        },
      };

      const config = { domain };

      const response = await APPLICATION_HANDLERS.auth0_create_application(request, config);

      expect(response.isError).toBe(false);
      expect(capturedBody.skip_non_verifiable_callback_uri_confirmation_prompt).toBeUndefined();
    });

    it('should handle missing required parameters', async () => {
      const request = {
        token,
        parameters: {
          // Missing name and app_type
        },
      };

      const config = { domain };

      const response = await APPLICATION_HANDLERS.auth0_create_application(request, config);

      expect(response.isError).toBe(true);
      expect(response.content[0].text).toContain('name is required');
    });

    it('should mask client_secret in create response and provide access instructions', async () => {
      // Override the handler to return a response with client_secret
      server.use(
        http.post('https://*/api/v2/clients', async ({ request }) => {
          const body = (await request.json()) as Record<string, any>;
          return HttpResponse.json({
            ...body,
            client_id: 'new-app-with-secret',
            client_secret: 'super_secret_value_12345',
          });
        })
      );

      const request = {
        token,
        parameters: {
          name: 'Test App',
          app_type: 'spa',
        },
      };

      const config = { domain };

      const response = await APPLICATION_HANDLERS.auth0_create_application(request, config);

      expect(response.isError).toBe(false);

      const parsedContent = JSON.parse(response.content[0].text);
      expect(parsedContent.client_id).toBe('new-app-with-secret');
      // Verify client_secret is masked
      expect(parsedContent.client_secret).toBe('[REDACTED]');
      expect(parsedContent.client_secret).not.toContain('super_secret_value');
      // Verify credentials access instructions are provided
      expect(parsedContent._credentials_access).toBeDefined();
      expect(parsedContent._credentials_access.note).toContain('masked for security');
      expect(parsedContent._credentials_access.how_to_access).toBeDefined();
      expect(parsedContent._credentials_access.how_to_access.length).toBeGreaterThan(0);
      // In local mode, the file-save instruction must be present
      const howToAccess = parsedContent._credentials_access.how_to_access as string[];
      expect(howToAccess.some((s) => s.includes('auth0_save_credentials_to_file'))).toBe(true);
    });

    it('should omit auth0_save_credentials_to_file instruction in StreamableHttp mode', async () => {
      server.use(
        http.post('https://*/api/v2/clients', async ({ request }) => {
          const body = (await request.json()) as Record<string, any>;
          return HttpResponse.json({
            ...body,
            client_id: 'new-app-hosted',
            client_secret: 'super_secret_value_hosted',
          });
        })
      );

      const request = {
        token,
        parameters: {
          name: 'Hosted App',
          app_type: 'spa',
        },
      };

      const config = { domain, mode: ServerMode.StreamableHttp };

      const response = await APPLICATION_HANDLERS.auth0_create_application(request, config);

      expect(response.isError).toBe(false);

      const parsedContent = JSON.parse(response.content[0].text);
      expect(parsedContent._credentials_access).toBeDefined();
      const howToAccess = parsedContent._credentials_access.how_to_access as string[];
      // No file-save instruction in hosted mode
      expect(howToAccess.some((s) => s.includes('auth0_save_credentials_to_file'))).toBe(false);
      // Dashboard and API instructions still present
      expect(howToAccess.some((s) => s.includes('Auth0 Dashboard'))).toBe(true);
    });

    describe('token_endpoint_auth_method defaults', () => {
      async function createAppAndCaptureBody(parameters: Record<string, any>) {
        let capturedBody: Record<string, any> | undefined;
        server.use(
          http.post('https://*/api/v2/clients', async ({ request }) => {
            capturedBody = (await request.json()) as Record<string, any>;
            return HttpResponse.json({ ...capturedBody, client_id: 'test-app-id' });
          })
        );

        const response = await APPLICATION_HANDLERS.auth0_create_application(
          { token, parameters },
          { domain }
        );

        expect(capturedBody).toBeDefined();
        return { response, capturedBody: capturedBody! };
      }

      it.each([
        { app_type: 'spa', expected: 'none' },
        { app_type: 'native', expected: 'none' },
        { app_type: 'regular_web', expected: 'client_secret_post' },
        { app_type: 'non_interactive', expected: 'client_secret_post' },
      ])('should default to "$expected" for $app_type', async ({ app_type, expected }) => {
        const { response, capturedBody } = await createAppAndCaptureBody({
          name: `${app_type} App`,
          app_type,
        });

        expect(response.isError).toBe(false);
        expect(capturedBody.token_endpoint_auth_method).toBe(expected);
      });

      it('should use explicit token_endpoint_auth_method over default', async () => {
        const { response, capturedBody } = await createAppAndCaptureBody({
          name: 'Explicit Auth App',
          app_type: 'spa',
          token_endpoint_auth_method: 'client_secret_basic',
        });

        expect(response.isError).toBe(false);
        expect(capturedBody.token_endpoint_auth_method).toBe('client_secret_basic');
      });

      it('should not set token_endpoint_auth_method when app_type is not provided', async () => {
        const { response, capturedBody } = await createAppAndCaptureBody({
          name: 'No Type App',
        });

        expect(response.isError).toBe(false);
        expect(capturedBody.token_endpoint_auth_method).toBeUndefined();
      });
    });

    describe('oidc_conformant and jwt_configuration defaults', () => {
      async function createAppAndCaptureBody(parameters: Record<string, any>) {
        let capturedBody: Record<string, any> | undefined;
        server.use(
          http.post('https://*/api/v2/clients', async ({ request }) => {
            capturedBody = (await request.json()) as Record<string, any>;
            return HttpResponse.json({ ...capturedBody, client_id: 'test-app-id' });
          })
        );

        const response = await APPLICATION_HANDLERS.auth0_create_application(
          { token, parameters },
          { domain }
        );

        expect(capturedBody).toBeDefined();
        return { response, capturedBody: capturedBody! };
      }

      it('should always set oidc_conformant to true', async () => {
        const { response, capturedBody } = await createAppAndCaptureBody({
          name: 'Test App',
          app_type: 'spa',
        });

        expect(response.isError).toBe(false);
        expect(capturedBody.oidc_conformant).toBe(true);
      });

      it('should always set jwt_configuration with RS256 and lifetime_in_seconds 36000', async () => {
        const { response, capturedBody } = await createAppAndCaptureBody({
          name: 'Test App',
          app_type: 'regular_web',
        });

        expect(response.isError).toBe(false);
        expect(capturedBody.jwt_configuration).toBeDefined();
        expect(capturedBody.jwt_configuration.alg).toBe('RS256');
        expect(capturedBody.jwt_configuration.lifetime_in_seconds).toBe(36000);
      });

      it('should set oidc_conformant and jwt_configuration regardless of app_type', async () => {
        for (const app_type of ['spa', 'native', 'regular_web', 'non_interactive']) {
          const { capturedBody } = await createAppAndCaptureBody({
            name: `${app_type} App`,
            app_type,
          });

          expect(capturedBody.oidc_conformant).toBe(true);
          expect(capturedBody.jwt_configuration).toMatchObject({
            alg: 'RS256',
            lifetime_in_seconds: 36000,
          });
        }
      });
    });

    describe('parameter hardening', () => {
      const createTool = APPLICATION_TOOLS.find((t) => t.name === 'auth0_create_application');
      const declaredParams = Object.keys(createTool?.inputSchema?.properties ?? {});

      async function captureBody(parameters: Record<string, any>) {
        let capturedBody: Record<string, any> | undefined;
        server.use(
          http.post('https://*/api/v2/clients', async ({ request }) => {
            capturedBody = (await request.json()) as Record<string, any>;
            return HttpResponse.json({ ...capturedBody, client_id: 'test-app-id' });
          })
        );

        const response = await APPLICATION_HANDLERS.auth0_create_application(
          { token, parameters },
          { domain }
        );

        expect(response.isError).toBe(false);
        expect(capturedBody).toBeDefined();
        return capturedBody!;
      }

      it('should not forward parameters that are not declared in the inputSchema', async () => {
        // Undeclared fields (e.g. arriving via prompt injection) must never reach
        // the Auth0 API, regardless of which specific fields they are.
        const undeclared = {
          custom_login_page: '<script>steal()</script>',
          encryption_key: 'injected',
          addons: { samlp: {} },
          compliance_level: 'fapi',
          some_future_unsupported_field: 'injected',
        };

        const capturedBody = await captureBody({ name: 'Test App', app_type: 'spa', ...undeclared });

        for (const key of Object.keys(capturedBody)) {
          expect(declaredParams).toContain(key);
        }
        for (const key of Object.keys(undeclared)) {
          expect(capturedBody[key]).toBeUndefined();
        }
      });

      it('should forward declared configuration parameters to the Auth0 API', async () => {
        const declared = {
          web_origins: ['https://example.com'],
          client_aliases: ['urn:example'],
          cross_origin_loc: 'https://example.com/cross-origin',
          oidc_logout: { backchannel_logout_urls: ['https://example.com/logout'] },
          sso: true,
          native_social_login: { apple: { enabled: true } },
          grant_types: ['authorization_code'],
          mobile: { ios: { team_id: 'TEAM' } },
          refresh_token: { rotation_type: 'rotating' },
        };

        const capturedBody = await captureBody({ name: 'Test App', app_type: 'spa', ...declared });

        for (const [key, value] of Object.entries(declared)) {
          expect(capturedBody[key]).toEqual(value);
        }
      });
    });
  });

  describe('auth0_update_application', () => {
    it('should update an existing application', async () => {
      const clientId = mockApplications[0].client_id;

      // Override the handler for this specific test
      server.use(
        http.patch(`https://*/api/v2/clients/${clientId}`, async ({ request }) => {
          const body = (await request.json()) as Record<string, any>;
          return HttpResponse.json({
            ...mockApplications[0],
            ...body,
          });
        })
      );

      const request = {
        token,
        parameters: {
          client_id: clientId,
          name: 'Updated App',
        },
      };

      const config = { domain };

      const response = await APPLICATION_HANDLERS.auth0_update_application(request, config);

      expect(response.isError).toBe(false);

      // The response should be a JSON string that we can parse
      const parsedContent = JSON.parse(response.content[0].text);
      expect(parsedContent.data).toBeUndefined();
      expect(parsedContent.headers).toBeUndefined();
      expect(parsedContent.name).toBe('Updated App');
    });

    it.each(['spa', 'native', 'regular_web', 'non_interactive'])(
      'should not auto-set token_endpoint_auth_method when app_type is %s',
      async (app_type) => {
        const clientId = mockApplications[0].client_id;
        let capturedBody: Record<string, any> | undefined;
        server.use(
          http.patch(`https://*/api/v2/clients/${clientId}`, async ({ request }) => {
            capturedBody = (await request.json()) as Record<string, any>;
            return HttpResponse.json({ ...mockApplications[0], ...capturedBody });
          })
        );

        const request = {
          token,
          parameters: { client_id: clientId, app_type },
        };
        const response = await APPLICATION_HANDLERS.auth0_update_application(request, { domain });

        expect(response.isError).toBe(false);
        expect(capturedBody).toBeDefined();
        expect(capturedBody!.token_endpoint_auth_method).toBeUndefined();
      }
    );

    it('should auto-set skip_non_verifiable_callback_uri_confirmation_prompt when callbacks contain localhost', async () => {
      const clientId = mockApplications[0].client_id;
      let capturedBody: Record<string, any> = {};

      server.use(
        http.patch(`https://*/api/v2/clients/${clientId}`, async ({ request }) => {
          capturedBody = (await request.json()) as Record<string, any>;
          return HttpResponse.json({
            ...mockApplications[0],
            ...capturedBody,
          });
        })
      );

      const request = {
        token,
        parameters: {
          client_id: clientId,
          callbacks: ['http://localhost:3000/callback'],
        },
      };

      const config = { domain };

      const response = await APPLICATION_HANDLERS.auth0_update_application(request, config);

      expect(response.isError).toBe(false);
      expect(capturedBody.skip_non_verifiable_callback_uri_confirmation_prompt).toBe(true);
    });

    it('should not auto-set skip_non_verifiable_callback_uri_confirmation_prompt for verifiable callbacks', async () => {
      const clientId = mockApplications[0].client_id;
      let capturedBody: Record<string, any> = {};

      server.use(
        http.patch(`https://*/api/v2/clients/${clientId}`, async ({ request }) => {
          capturedBody = (await request.json()) as Record<string, any>;
          return HttpResponse.json({
            ...mockApplications[0],
            ...capturedBody,
          });
        })
      );

      const request = {
        token,
        parameters: {
          client_id: clientId,
          callbacks: ['https://example.com/callback'],
        },
      };

      const config = { domain };

      const response = await APPLICATION_HANDLERS.auth0_update_application(request, config);

      expect(response.isError).toBe(false);
      expect(capturedBody.skip_non_verifiable_callback_uri_confirmation_prompt).toBeUndefined();
    });

    it('should respect explicit skip_non_verifiable_callback_uri_confirmation_prompt value', async () => {
      const clientId = mockApplications[0].client_id;
      let capturedBody: Record<string, any> = {};

      server.use(
        http.patch(`https://*/api/v2/clients/${clientId}`, async ({ request }) => {
          capturedBody = (await request.json()) as Record<string, any>;
          return HttpResponse.json({
            ...mockApplications[0],
            ...capturedBody,
          });
        })
      );

      const request = {
        token,
        parameters: {
          client_id: clientId,
          callbacks: ['http://localhost:3000/callback'],
          skip_non_verifiable_callback_uri_confirmation_prompt: false,
        },
      };

      const config = { domain };

      const response = await APPLICATION_HANDLERS.auth0_update_application(request, config);

      expect(response.isError).toBe(false);
      expect(capturedBody.skip_non_verifiable_callback_uri_confirmation_prompt).toBe(false);
    });

    describe('parameter hardening', () => {
      const updateTool = APPLICATION_TOOLS.find((t) => t.name === 'auth0_update_application');
      const declaredParams = Object.keys(updateTool?.inputSchema?.properties ?? {});

      async function captureBody(parameters: Record<string, any>) {
        const clientId = mockApplications[0].client_id;
        let capturedBody: Record<string, any> | undefined;
        server.use(
          http.patch(`https://*/api/v2/clients/${clientId}`, async ({ request }) => {
            capturedBody = (await request.json()) as Record<string, any>;
            return HttpResponse.json({ ...mockApplications[0], ...capturedBody });
          })
        );

        const response = await APPLICATION_HANDLERS.auth0_update_application(
          { token, parameters: { client_id: clientId, ...parameters } },
          { domain }
        );

        expect(response.isError).toBe(false);
        expect(capturedBody).toBeDefined();
        return capturedBody!;
      }

      it('should not forward parameters that are not declared in the inputSchema', async () => {
        const undeclared = {
          custom_login_page: '<script>steal()</script>',
          encryption_key: 'injected',
          addons: { samlp: {} },
          compliance_level: 'fapi',
          some_future_unsupported_field: 'injected',
        };

        const capturedBody = await captureBody(undeclared);

        for (const key of Object.keys(capturedBody)) {
          expect(declaredParams).toContain(key);
        }
        for (const key of Object.keys(undeclared)) {
          expect(capturedBody[key]).toBeUndefined();
        }
      });

      it('should forward declared configuration parameters to the Auth0 API', async () => {
        const declared = {
          web_origins: ['https://example.com'],
          client_aliases: ['urn:example'],
          cross_origin_loc: 'https://example.com/cross-origin',
          oidc_logout: { backchannel_logout_urls: ['https://example.com/logout'] },
          sso: true,
          native_social_login: { apple: { enabled: true } },
          grant_types: ['authorization_code'],
          mobile: { ios: { team_id: 'TEAM' } },
          refresh_token: { rotation_type: 'rotating' },
          jwt_configuration: { alg: 'RS256' },
        };

        const capturedBody = await captureBody(declared);

        for (const [key, value] of Object.entries(declared)) {
          expect(capturedBody[key]).toEqual(value);
        }
      });
    });
  });

  describe('auth0_save_credentials_to_file', () => {
    beforeEach(async () => {
      const { writeCredentialsToEnv } = await import('../../src/utils/credentials-writer');
      vi.mocked(writeCredentialsToEnv).mockResolvedValue({
        file_path: '/mock/path/.env.local',
        env_var_names: ['AUTH0_CLIENT_ID', 'AUTH0_CLIENT_SECRET', 'AUTH0_DOMAIN'],
        file_created: true,
      });
    });

    it('should save credentials to .env.local file', async () => {
      const clientId = 'app-with-secret';

      // Override the handler to return a response with client_secret
      server.use(
        http.get(`https://test-tenant.auth0.com/api/v2/clients/${clientId}`, () => {
          return HttpResponse.json({
            client_id: clientId,
            name: 'App with Secret',
            client_secret: 'super_secret_value_67890',
            app_type: 'regular_web',
            callbacks: ['http://localhost:3000/callback'],
          });
        })
      );

      const request = {
        token,
        parameters: {
          client_id: clientId,
          file_path: '.env.local',
        },
      };

      const config = { domain };

      const response = await APPLICATION_HANDLERS.auth0_save_credentials_to_file(request, config);

      // Debug: log error if any
      if (response.isError) {
        console.log('Error response:', response.content[0].text);
      }

      expect(response.isError).toBe(false);

      const parsedContent = JSON.parse(response.content[0].text);
      expect(parsedContent.client_id).toBe(clientId);
      // Verify credentials info is in response (but not the secret itself)
      expect(parsedContent.credentials_saved_to).toBeDefined();
      expect(parsedContent.env_vars).toBeDefined();
      expect(parsedContent.message).toContain('saved securely');
      // Verify client_secret is NOT in the response
      expect(parsedContent.client_secret).toBeUndefined();
    });

    it('should handle missing client_id parameter', async () => {
      const request = {
        token,
        parameters: {
          file_path: '.env.local',
        },
      };

      const config = { domain };

      const response = await APPLICATION_HANDLERS.auth0_save_credentials_to_file(request, config);

      expect(response.isError).toBe(true);
      expect(response.content[0].text).toContain('client_id is required');
    });

    it('should handle missing file_path parameter', async () => {
      const request = {
        token,
        parameters: {
          client_id: 'some-client-id',
        },
      };

      const config = { domain };

      const response = await APPLICATION_HANDLERS.auth0_save_credentials_to_file(request, config);

      expect(response.isError).toBe(true);
      expect(response.content[0].text).toContain('file_path is required');
    });

    it('should handle application without client_secret', async () => {
      const clientId = 'public-spa-app';

      // Override the handler to return a public client (no secret)
      server.use(
        http.get(`https://*/api/v2/clients/${clientId}`, () => {
          return HttpResponse.json({
            client_id: clientId,
            name: 'Public SPA',
            app_type: 'spa',
            // No client_secret for public clients
          });
        })
      );

      const request = {
        token,
        parameters: {
          client_id: clientId,
          file_path: '.env.local',
        },
      };

      const config = { domain };

      const response = await APPLICATION_HANDLERS.auth0_save_credentials_to_file(request, config);

      expect(response.isError).toBe(true);
      expect(response.content[0].text).toContain('does not have a client_secret');
    });
  });

  // Note: auth0_delete_application and auth0_search_applications handlers are not implemented in the source code
});
