/**
 * Benchmark: auth0_list_logs — q parameter description gap
 *
 * Source: 661 observed 400 errors on GET /api/v2/logs (Apr 2025–Jul 2026).
 * Root cause: q description omits valid field names. LLM sends user_email,
 * which does not exist in Auth0 logs. Email is indexed under user_name.
 *
 * BEFORE tests: document the gap — bad input causes 400.
 * AFTER tests:  correct input succeeds.
 * SCHEMA tests: fail before the fix, pass after. These are the commit gate.
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import { http, HttpResponse } from 'msw';
import { LOG_HANDLERS, LOG_TOOLS } from '../../src/tools/logs';
import { mockConfig } from '../mocks/config';
import { mockLogs } from '../mocks/auth0/logs';
import { server } from '../setup';

vi.mock('../../src/utils/logger', () => ({
  log: vi.fn(),
  logInfo: vi.fn(),
  logError: vi.fn(),
}));

const { domain, token } = mockConfig;

// Validates the q parameter the same way the real Auth0 API does:
// user_email is not an indexed field — requests using it return 400.
function withStrictLogsHandler() {
  server.use(
    http.get('https://*/api/v2/logs', ({ request }) => {
      const q = new URL(request.url).searchParams.get('q') ?? '';
      if (/user_email/.test(q)) {
        return new HttpResponse(
          JSON.stringify({
            statusCode: 400,
            error: 'Bad Request',
            message: 'The search query string has an error: unknown field "user_email".',
          }),
          { status: 400, headers: { 'Content-Type': 'application/json' } }
        );
      }
      return HttpResponse.json({ logs: mockLogs, total: mockLogs.length });
    })
  );
}

afterEach(() => server.resetHandlers());

describe('Benchmark: auth0_list_logs — q field description gap', () => {
  describe('BEFORE: schema gap — LLM sends user_email, API returns 400', () => {
    it('query with user_email returns a 400 error', async () => {
      withStrictLogsHandler();

      const response = await LOG_HANDLERS.auth0_list_logs(
        { token, parameters: { q: 'user_email:"ct@monaco.com"' } },
        { domain }
      );

      expect(response.isError).toBe(true);
      expect(response.content[0].text).toMatch(/400|Bad Request|user_email/i);
    });
  });

  describe('AFTER: patched schema — LLM sends user_name, API returns 200', () => {
    it('query with user_name succeeds', async () => {
      withStrictLogsHandler();

      const response = await LOG_HANDLERS.auth0_list_logs(
        { token, parameters: { q: 'user_name:"ct@monaco.com"' } },
        { domain }
      );

      expect(response.isError).toBe(false);
      const parsed = JSON.parse(response.content[0].text);
      expect(Array.isArray(parsed.logs)).toBe(true);
    });

    it('type-based filter succeeds', async () => {
      withStrictLogsHandler();

      const response = await LOG_HANDLERS.auth0_list_logs(
        { token, parameters: { q: 'type:f' } },
        { domain }
      );

      expect(response.isError).toBe(false);
    });
  });

  describe('SCHEMA: q description must guide the LLM — fails before fix, passes after', () => {
    const qSchema = LOG_TOOLS.find((t) => t.name === 'auth0_list_logs')?.inputSchema
      ?.properties?.q as Record<string, string> | undefined;

    it('lists user_name as a searchable field', () => {
      expect(qSchema?.description).toContain('user_name');
    });

    it('explicitly names user_email as invalid', () => {
      expect(qSchema?.description).toMatch(/user_email/i);
    });

    it('includes at least one example query', () => {
      expect(qSchema?.description).toMatch(/example|e\.g\./i);
    });
  });
});
