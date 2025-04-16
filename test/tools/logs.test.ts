import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { http, HttpResponse } from 'msw';
import { LOG_HANDLERS, LOG_TOOLS } from '../../src/tools/logs';
import { z } from 'zod';
import { mockConfig } from '../mocks/config';
import { mockLogs } from '../mocks/auth0/logs';
import { server } from '../setup';

// Mock dependencies
vi.mock('../../src/utils/logger', () => ({
  log: vi.fn(),
  logInfo: vi.fn(),
  logError: vi.fn(),
}));

describe('Logs Tools', () => {
  describe('Logs Schema Validation', () => {
    it('should validate auth0_list_logs parameters correctly', () => {
      const tool = LOG_TOOLS.find((tool) => tool.name === 'auth0_list_logs');
      expect(tool).toBeDefined();

      const schema = tool?.inputSchema as z.ZodObject<any>;

      // Valid parameters should pass validation
      const validParams = {
        from: 'log_123',
        take: 10,
        q: 'type:success',
        sort: 'date:-1',
        include_fields: true,
        include_totals: true,
      };
      const validResult = schema.safeParse(validParams);
      expect(validResult.success).toBe(true);

      // Invalid take parameter (string instead of number)
      const invalidTake = {
        take: 'ten',
      };
      const invalidTakeResult = schema.safeParse(invalidTake);
      expect(invalidTakeResult.success).toBe(false);

      // Invalid sort parameter (not in enum)
      const invalidSort = {
        sort: 'invalid_sort',
      };
      const invalidSortResult = schema.safeParse(invalidSort);
      expect(invalidSortResult.success).toBe(false);

      // Empty object should pass (all parameters are optional)
      const emptyParams = {};
      const emptyResult = schema.safeParse(emptyParams);
      expect(emptyResult.success).toBe(true);
    });

    it('should validate auth0_get_log parameters correctly', () => {
      const tool = LOG_TOOLS.find((tool) => tool.name === 'auth0_get_log');
      expect(tool).toBeDefined();

      const schema = tool?.inputSchema as z.ZodObject<any>;

      // Valid parameters should pass validation
      const validParams = {
        id: 'log_123',
      };
      const validResult = schema.safeParse(validParams);
      expect(validResult.success).toBe(true);

      // Missing required id parameter
      const missingId = {};
      const missingIdResult = schema.safeParse(missingId);
      expect(missingIdResult.success).toBe(false);
    });
  });

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

        expect(response).toBeDefined();
        expect(response.isError).toBe(false);
        expect(response.content).toBeDefined();
        expect(response.content[0].type).toBe('text');

        // The response should be a JSON string that we can parse
        const parsedContent = JSON.parse(response.content[0].text);
        expect(parsedContent.logs).toBeDefined();
        expect(parsedContent.logs.length).toBeGreaterThan(0);
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

        expect(response.isError).toBe(true);
        expect(response.content[0].text).toContain('Failed to list logs');
        expect(response.content[0].text).toContain('Unauthorized');
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

        expect(response.isError).toBe(false);

        // The response should be a JSON string that we can parse
        const parsedContent = JSON.parse(response.content[0].text);
        expect(parsedContent.log_id).toBe(logId);
      });

      it('should handle missing id parameter', async () => {
        const request = {
          token,
          parameters: {},
        };

        const config = { domain };

        const response = await LOG_HANDLERS.auth0_get_log(request, config);

        expect(response.isError).toBe(true);
        expect(response.content[0].text).toContain('id is required');
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

        expect(response.isError).toBe(true);
        expect(response.content[0].text).toContain('not found');
      });
    });

    // Note: auth0_search_logs handler is not implemented in the source code
  });
});
