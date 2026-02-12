import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { http, HttpResponse } from 'msw';
import { APPLICATION_GRANT_HANDLERS } from '../../src/tools/application-grants';
import { mockConfig } from '../mocks/config';
import { server } from '../setup';

// Mock dependencies
vi.mock('../../src/utils/logger', () => ({
  log: vi.fn(),
  logInfo: vi.fn(),
  logError: vi.fn(),
}));

describe('Application Grants Tool Handlers', () => {
  const domain = mockConfig.domain;
  const token = mockConfig.token;

  beforeEach(() => {
    vi.resetAllMocks();
  });

  afterEach(() => {
    server.resetHandlers();
  });

  describe('auth0_create_application_grant', () => {
    it('should create a new application grant', async () => {
      server.use(
        http.post('https://*/api/v2/client-grants', async ({ request }) => {
          const body = (await request.json()) as Record<string, any>;
          return HttpResponse.json({
            id: 'mock_123',
            client_id: body.client_id,
            audience: body.audience,
            scope: body.scope || [],
          });
        })
      );

      const request = {
        token,
        parameters: {
          client_id: 'test_client_id_123',
          audience: 'https://api.example.com',
          scope: ['read:users', 'write:users'],
        },
      };

      const config = { domain };

      const response = await APPLICATION_GRANT_HANDLERS.auth0_create_application_grant(
        request,
        config
      );

      expect(response.isError).toBe(false);

      const parsedContent = JSON.parse(response.content[0].text);
      expect(parsedContent.id).toBe('mock_123');
      expect(parsedContent.client_id).toBe('test_client_id_123');
      expect(parsedContent.audience).toBe('https://api.example.com');
      expect(parsedContent.scope).toEqual(['read:users', 'write:users']);
    });

    it.each(['client_id', 'audience', 'scope'])(
      'should handle missing "%s" parameter',
      async (name) => {
        const request = {
          token,
          parameters: {
            client_id: 'test_client_id_123',
            audience: 'https://api.example.com',
            scope: ['read:users', 'write:users'],
          } as Record<string, string | string[]>,
        };

        delete request.parameters[name];

        const config = { domain };

        const response = await APPLICATION_GRANT_HANDLERS.auth0_create_application_grant(
          request,
          config
        );

        expect(response.isError).toBe(true);
        expect(response.content[0].text).toContain(`${name} is required`);
      }
    );

    it('should handle empty scopes', async () => {
      const request = {
        token,
        parameters: {
          client_id: 'test_client_id_123',
          audience: 'https://api.example.com',
          scope: [],
        },
      };

      const config = { domain };

      const response = await APPLICATION_GRANT_HANDLERS.auth0_create_application_grant(
        request,
        config
      );

      expect(response.isError).toBe(true);
      expect(response.content[0].text).toContain('scope is required');
    });

    it('should handle missing token', async () => {
      const request = {
        token: undefined, // Missing token
        parameters: {
          client_id: 'test_client_id_123',
          audience: 'https://api.example.com',
          scope: ['read:users'],
        },
      };

      const config = { domain };

      const response = await APPLICATION_GRANT_HANDLERS.auth0_create_application_grant(
        request as any,
        config
      );

      expect(response.isError).toBe(true);
      expect(response.content[0].text).toContain('Missing authorization token');
    });
  });
});
