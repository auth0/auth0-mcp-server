import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { http, HttpResponse } from 'msw';
import { APPLICATION_HANDLERS } from '../../src/tools/applications';
import { mockConfig } from '../mocks/config';
import { mockApplications } from '../mocks/auth0/applications';
import { server } from '../setup';

// Mock dependencies
vi.mock('../../src/utils/logger', () => ({
  log: vi.fn(),
}));

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

      expect(response.toolResult).toBeDefined();
      expect(response.toolResult.isError).toBe(false);
      expect(response.toolResult.content).toBeDefined();
      expect(response.toolResult.content[0].type).toBe('text');

      // The response should be a JSON string that we can parse
      const parsedContent = JSON.parse(response.toolResult.content[0].text);
      expect(Array.isArray(parsedContent)).toBe(true);
      expect(parsedContent.length).toBeGreaterThan(0);
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

      expect(response.toolResult.isError).toBe(false);

      // The response should be a JSON string that we can parse
      const parsedContent = JSON.parse(response.toolResult.content[0].text);
      expect(Array.isArray(parsedContent)).toBe(true);
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

      expect(response.toolResult.isError).toBe(true);
      expect(response.toolResult.content[0].text).toContain('Failed to list applications');
      expect(response.toolResult.content[0].text).toContain('401');
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

      expect(response.toolResult.isError).toBe(false);

      // The response should be a JSON string that we can parse
      const parsedContent = JSON.parse(response.toolResult.content[0].text);
      expect(parsedContent.client_id).toBe(clientId);
    });

    it('should handle missing client_id parameter', async () => {
      const request = {
        token,
        parameters: {},
      };

      const config = { domain };

      const response = await APPLICATION_HANDLERS.auth0_get_application(request, config);

      expect(response.toolResult.isError).toBe(true);
      expect(response.toolResult.content[0].text).toContain('client_id is required');
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

      expect(response.toolResult.isError).toBe(true);
      expect(response.toolResult.content[0].text).toContain('not found');
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

      expect(response.toolResult.isError).toBe(false);

      // The response should be a JSON string that we can parse
      const parsedContent = JSON.parse(response.toolResult.content[0].text);
      expect(parsedContent.client_id).toBe('new-app-id');
      expect(parsedContent.name).toBe('Test App');
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

      expect(response.toolResult.isError).toBe(true);
      expect(response.toolResult.content[0].text).toContain('name is required');
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

      expect(response.toolResult.isError).toBe(false);

      // The response should be a JSON string that we can parse
      const parsedContent = JSON.parse(response.toolResult.content[0].text);
      expect(parsedContent.name).toBe('Updated App');
    });
  });

  describe('auth0_delete_application', () => {
    it('should delete an application', async () => {
      const clientId = mockApplications[0].client_id;

      // Override the handler for this specific test
      server.use(
        http.delete(`https://*/api/v2/clients/${clientId}`, () => {
          return new HttpResponse(null, { status: 204 });
        })
      );

      const request = {
        token,
        parameters: {
          client_id: clientId,
        },
      };

      const config = { domain };

      const response = await APPLICATION_HANDLERS.auth0_delete_application(request, config);

      expect(response.toolResult.isError).toBe(false);
    });
  });

  describe('auth0_search_applications', () => {
    it('should search applications by name', async () => {
      // Override the handler for this specific test
      server.use(
        http.get('https://*/api/v2/clients', ({ request }) => {
          const url = new URL(request.url);
          if (url.searchParams.get('q')?.includes('name:Test')) {
            return HttpResponse.json({
              clients: mockApplications.filter((app) => app.name.includes('Test')),
              total: 2,
              page: 0,
              per_page: 10,
            });
          }
          return HttpResponse.json({ clients: [] });
        })
      );

      const request = {
        token,
        parameters: {
          name: 'Test',
        },
      };

      const config = { domain };

      const response = await APPLICATION_HANDLERS.auth0_search_applications(request, config);

      expect(response.toolResult.isError).toBe(false);
    });

    it('should handle missing name parameter', async () => {
      const request = {
        token,
        parameters: {
          // Missing name
        },
      };

      const config = { domain };

      const response = await APPLICATION_HANDLERS.auth0_search_applications(request, config);

      expect(response.toolResult.isError).toBe(true);
      expect(response.toolResult.content[0].text).toContain('name parameter is required');
    });
  });
});
