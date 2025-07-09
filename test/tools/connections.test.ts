import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { http, HttpResponse } from 'msw';
import { CONNECTION_HANDLERS } from '../../src/tools/connections';
import { mockConnections } from '../mocks/auth0/connections';
import { mockConfig } from '../mocks/config';
import { server } from '../setup';

// Mock dependencies
vi.mock('../../src/utils/logger', () => ({
  log: vi.fn(),
  logInfo: vi.fn(),
  logError: vi.fn(),
}));

describe('Connections Tool Handlers', () => {
  const domain = mockConfig.domain;
  const token = mockConfig.token;

  beforeEach(() => {
    vi.resetAllMocks();
  });

  afterEach(() => {
    server.resetHandlers();
  });

  describe('auth0_list_connections', () => {
    it('should return a list of connections', async () => {
      const request = {
        token,
        parameters: {
          include_totals: true,
        },
      };

      const config = { domain };

      const response = await CONNECTION_HANDLERS.auth0_list_connections(request, config);

      expect(response).toBeDefined();
      expect(response.isError).toBe(false);
      expect(response.content).toBeDefined();
      expect(response.content[0].type).toBe('text');

      const parsedContent = JSON.parse(response.content[0].text);
      expect(parsedContent.connections).toEqual(mockConnections);
      expect(parsedContent.total).toBe(mockConnections.length);
    });

    it('should handle pagination parameters', async () => {
      const request = {
        token,
        parameters: {
          page: 0,
          per_page: 1,
          include_totals: true,
        },
      };

      const config = { domain };

      const response = await CONNECTION_HANDLERS.auth0_list_connections(request, config);

      expect(response.isError).toBe(false);

      const parsedContent = JSON.parse(response.content[0].text);
      expect(parsedContent.connections.length).toBe(1);
      expect(parsedContent.total).toBe(mockConnections.length);
    });

    it('should handle API errors', async () => {
      server.use(
        http.get('https://*/api/v2/connections', () => {
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

      const response = await CONNECTION_HANDLERS.auth0_list_connections(request, config);

      expect(response.isError).toBe(true);
      expect(response.content[0].text).toContain('Failed to list connections');
      expect(response.content[0].text).toContain('Unauthorized');
    });
  });

  describe('auth0_get_connection', () => {
    it('should return a single connection', async () => {
      const connectionId = mockConnections[0].id;

      server.use(
        http.get(`https://*/api/v2/connections/${connectionId}`, () => {
          return HttpResponse.json(mockConnections[0]);
        })
      );

      const request = {
        token,
        parameters: {
          id: connectionId,
        },
      };

      const config = { domain };

      const response = await CONNECTION_HANDLERS.auth0_get_connection(request, config);

      expect(response.isError).toBe(false);

      const parsedContent = JSON.parse(response.content[0].text);
      expect(parsedContent.id).toBe(connectionId);
    });

    it('should handle missing id parameter', async () => {
      const request = {
        token,
        parameters: {},
      };

      const config = { domain };

      const response = await CONNECTION_HANDLERS.auth0_get_connection(request, config);

      expect(response.isError).toBe(true);
      expect(response.content[0].text).toContain('id is required');
    });

    it('should handle connection not found', async () => {
      server.use(
        http.get('https://*/api/v2/connections/non-existent-id', () => {
          return new HttpResponse(null, { status: 404 });
        })
      );

      const request = {
        token,
        parameters: {
          id: 'non-existent-id',
        },
      };

      const config = { domain };

      const response = await CONNECTION_HANDLERS.auth0_get_connection(request, config);

      expect(response.isError).toBe(true);
      expect(response.content[0].text).toContain('not found');
    });
  });

  describe('auth0_create_connection', () => {
    it('should create a new connection', async () => {
      server.use(
        http.post('https://*/api/v2/connections', async ({ request }) => {
          const body = (await request.json()) as Record<string, any>;
          return HttpResponse.json({
            ...body,
            id: 'new-connection-id',
          });
        })
      );

      const request = {
        token,
        parameters: {
          name: 'Test Connection',
          strategy: 'auth0',
        },
      };

      const config = { domain };

      const response = await CONNECTION_HANDLERS.auth0_create_connection(request, config);

      expect(response.isError).toBe(false);

      const parsedContent = JSON.parse(response.content[0].text);
      expect(parsedContent.id).toBe('new-connection-id');
      expect(parsedContent.name).toBe('Test Connection');
    });

    it('should handle missing required parameters', async () => {
      const request = {
        token,
        parameters: {
          // Missing name and strategy
        },
      };

      const config = { domain };

      const response = await CONNECTION_HANDLERS.auth0_create_connection(request, config);

      expect(response.isError).toBe(true);
      expect(response.content[0].text).toContain('name is required');
    });
  });

  describe('auth0_update_connection', () => {
    it('should update an existing connection', async () => {
      const connectionId = mockConnections[0].id;

      server.use(
        http.patch(`https://*/api/v2/connections/${connectionId}`, async ({ request }) => {
          const body = (await request.json()) as Record<string, any>;
          return HttpResponse.json({
            ...mockConnections[0],
            ...body,
          });
        })
      );

      const request = {
        token,
        parameters: {
          id: connectionId,
          options: { newOption: 'newValue' },
        },
      };

      const config = { domain };

      const response = await CONNECTION_HANDLERS.auth0_update_connection(request, config);

      expect(response.isError).toBe(false);

      const parsedContent = JSON.parse(response.content[0].text);
      expect(parsedContent.options.newOption).toBe('newValue');
    });
  });

  describe('auth0_delete_connection', () => {
    it('should delete a connection', async () => {
      const connectionId = mockConnections[0].id;

      server.use(
        http.delete(`https://*/api/v2/connections/${connectionId}`, () => {
          return new HttpResponse(null, { status: 204 });
        })
      );

      const request = {
        token,
        parameters: {
          id: connectionId,
        },
      };

      const config = { domain };

      const response = await CONNECTION_HANDLERS.auth0_delete_connection(request, config);

      expect(response.isError).toBe(false);
      expect(response.content[0].text).toContain('successfully deleted');
    });

    it('should handle connection not found on delete', async () => {
      server.use(
        http.delete('https://*/api/v2/connections/non-existent-id', () => {
          return new HttpResponse(null, { status: 404 });
        })
      );

      const request = {
        token,
        parameters: {
          id: 'non-existent-id',
        },
      };

      const config = { domain };

      const response = await CONNECTION_HANDLERS.auth0_delete_connection(request, config);

      expect(response.isError).toBe(true);
      expect(response.content[0].text).toContain('not found');
    });
  });
});
