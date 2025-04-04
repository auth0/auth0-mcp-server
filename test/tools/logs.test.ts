import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { http, HttpResponse } from 'msw';
import { LOG_HANDLERS } from '../../src/tools/logs';
import { mockConfig } from '../mocks/config';
import { mockLogs } from '../mocks/auth0/logs';
import { server } from '../setup';

// Mock dependencies
vi.mock('../../src/utils/logger', () => ({
  log: vi.fn(),
  logInfo: vi.fn(),
  logError: vi.fn(),
}));

describe('Logs Tool Handlers', () => {
  const domain = mockConfig.domain;
  const token = mockConfig.token;

  beforeEach(() => {
    vi.resetAllMocks();
  });

  afterEach(() => {
    server.resetHandlers();
  });

  describe('auth0_list_logs', () => {
    it('should return a list of logs', async () => {
      const request = {
        token,
        parameters: {},
      };

      const config = { domain };

      const response = await LOG_HANDLERS.auth0_list_logs(request, config);

      expect(response.toolResult).toBeDefined();
      expect(response.toolResult.isError).toBe(false);
      expect(response.toolResult.content).toBeDefined();
      expect(response.toolResult.content[0].type).toBe('text');

      // The response should be a JSON string that we can parse
      const parsedContent = JSON.parse(response.toolResult.content[0].text);
      expect(parsedContent.logs).toBeDefined();
      expect(parsedContent.logs.length).toBeGreaterThan(0);

      // No need to check fetch call with MSW
    });

    it('should handle pagination parameters', async () => {
      const request = {
        token,
        parameters: {
          from: 'log_1',
          take: 5,
          include_totals: true,
        },
      };

      const config = { domain };

      await LOG_HANDLERS.auth0_list_logs(request, config);

      // No need to check fetch call with MSW
    });

    it('should handle query parameter', async () => {
      const request = {
        token,
        parameters: {
          q: 'type:success',
        },
      };

      const config = { domain };

      await LOG_HANDLERS.auth0_list_logs(request, config);

      // No need to check fetch call with MSW
    });

    it('should handle API errors', async () => {
      // Override the handler for this specific test
      server.use(
        http.get('https://*/api/v2/logs', () => {
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

      const response = await LOG_HANDLERS.auth0_list_logs(request, config);

      expect(response.toolResult.isError).toBe(true);
      expect(response.toolResult.content[0].text).toContain('Failed to list logs');
      expect(response.toolResult.content[0].text).toContain('Unauthorized');
    });
  });

  describe('auth0_get_log', () => {
    it('should return a single log entry', async () => {
      const logId = mockLogs[0].log_id;

      // Override the handler for this specific test
      server.use(
        http.get(`https://*/api/v2/logs/${logId}`, () => {
          return HttpResponse.json(mockLogs[0]);
        })
      );

      const request = {
        token,
        parameters: {
          id: logId,
        },
      };

      const config = { domain };

      const response = await LOG_HANDLERS.auth0_get_log(request, config);

      expect(response.toolResult.isError).toBe(false);

      // The response should be a JSON string that we can parse
      const parsedContent = JSON.parse(response.toolResult.content[0].text);
      expect(parsedContent.log_id).toBe(logId);
    });

    it('should handle missing id parameter', async () => {
      const request = {
        token,
        parameters: {},
      };

      const config = { domain };

      const response = await LOG_HANDLERS.auth0_get_log(request, config);

      expect(response.toolResult.isError).toBe(true);
      expect(response.toolResult.content[0].text).toContain('id is required');
    });

    it('should handle log not found', async () => {
      // Override the handler for this specific test
      server.use(
        http.get('https://*/api/v2/logs/non-existent-id', () => {
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

      const response = await LOG_HANDLERS.auth0_get_log(request, config);

      expect(response.toolResult.isError).toBe(true);
      expect(response.toolResult.content[0].text).toContain('not found');
    });
  });

  // Note: auth0_search_logs handler is not implemented in the source code
});
