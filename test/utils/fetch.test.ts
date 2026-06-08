import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { http, HttpResponse } from 'msw';
import { server } from '../setup';

vi.mock('../../src/utils/logger.js', () => ({
  log: vi.fn(),
}));

const TEST_URL = 'https://test.example.com/data';

describe('fetchWithOptions', () => {
  let fetchWithOptions: typeof import('../../src/utils/fetch.js').fetchWithOptions;

  beforeEach(async () => {
    vi.resetModules();
    const mod = await import('../../src/utils/fetch.js');
    fetchWithOptions = mod.fetchWithOptions;
  });

  afterEach(() => {
    server.resetHandlers();
  });

  it('returns response on success', async () => {
    server.use(http.get(TEST_URL, () => HttpResponse.json({ ok: true })));
    const response = await fetchWithOptions(TEST_URL);
    expect(response.ok).toBe(true);
    expect(await response.json()).toEqual({ ok: true });
  });

  it('returns 4xx response without retrying', async () => {
    let attempts = 0;
    server.use(
      http.get(TEST_URL, () => {
        attempts++;
        return new HttpResponse(null, { status: 404 });
      })
    );
    const response = await fetchWithOptions(TEST_URL, { retries: 1 });
    expect(response.status).toBe(404);
    expect(attempts).toBe(1);
  });

  it('does not retry on 5xx by default (retries: 0)', async () => {
    let attempts = 0;
    server.use(
      http.get(TEST_URL, () => {
        attempts++;
        return new HttpResponse(null, { status: 500 });
      })
    );
    const response = await fetchWithOptions(TEST_URL);
    expect(response.status).toBe(500);
    expect(attempts).toBe(1);
  });

  it('retries on 5xx and returns last response if all fail', async () => {
    let attempts = 0;
    server.use(
      http.get(TEST_URL, () => {
        attempts++;
        return new HttpResponse(null, { status: 500 });
      })
    );
    const response = await fetchWithOptions(TEST_URL, { retries: 1 });
    expect(response.status).toBe(500);
    expect(attempts).toBe(2);
  });

  it('reties on 5xx and returns success if retry succeeds', async () => {
    let attempts = 0;
    server.use(
      http.get(TEST_URL, () => {
        attempts++;
        if (attempts === 1) {
          return new HttpResponse(null, { status: 500 });
        }
        return HttpResponse.json({ ok: true });
      })
    );
    const response = await fetchWithOptions(TEST_URL, { retries: 1 });
    expect(response.ok).toBe(true);
  });

  it('retries on network error and returns success if retry succeeds', async () => {
    let attempts = 0;
    server.use(
      http.get(TEST_URL, () => {
        attempts++;
        if (attempts === 1) {
          return HttpResponse.error();
        }
        return HttpResponse.json({ ok: true });
      })
    );
    const response = await fetchWithOptions(TEST_URL, { retries: 1 });
    expect(response.ok).toBe(true);
  });

  it('throws on network error when all retries exhausted', async () => {
    server.use(http.get(TEST_URL, () => HttpResponse.error()));
    await expect(fetchWithOptions(TEST_URL, { retries: 1 })).rejects.toThrow();
  });

  it('respects custom retries option', async () => {
    let attempts = 0;
    server.use(
      http.get(TEST_URL, () => {
        attempts++;
        return new HttpResponse(null, { status: 500 });
      })
    );
    await fetchWithOptions(TEST_URL, { retries: 2 });
    expect(attempts).toBe(3);
  });

  it('applies custom timeouts', async () => {
    server.use(
      http.get(TEST_URL, async () => {
        await new Promise((resolve) => setTimeout(resolve, 500));
        return HttpResponse.json({ ok: true });
      })
    );
    await expect(fetchWithOptions(TEST_URL, { timeoutMs: 50, retries: 0 })).rejects.toThrow();
  });

  it('applies custom retryDelay time', async () => {
    let attempts = 0;
    const start = Date.now();
    server.use(
      http.get(TEST_URL, () => {
        attempts++;
        if (attempts === 1) {
          return new HttpResponse(null, { status: 500 });
        }
        return HttpResponse.json({ ok: true });
      })
    );
    await fetchWithOptions(TEST_URL, { retries: 1, retryDelayMs: 50 });
    const elapsed = Date.now() - start;
    expect(elapsed).toBeLessThan(500);
    expect(attempts).toBe(2);
  });
});
