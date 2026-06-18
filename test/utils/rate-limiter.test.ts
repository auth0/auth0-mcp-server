import { describe, it, expect, vi, afterEach } from 'vitest';
import { createRateLimiter } from '../../src/utils/rate-limiter.js';

describe('SlidingWindowRateLimiter', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('allows calls up to the limit within a window', () => {
    const limiter = createRateLimiter(5, 60_000);
    for (let i = 0; i < 5; i++) {
      expect(limiter('tool').allowed).toBe(true);
    }
  });

  it('denies the call that exceeds the limit', () => {
    const limiter = createRateLimiter(5, 60_000);
    for (let i = 0; i < 5; i++) limiter('tool');
    const result = limiter('tool');
    expect(result.allowed).toBe(false);
    expect(result.retryAfterMs).toBeGreaterThan(0);
  });

  it('allows calls again after the window expires', () => {
    vi.useFakeTimers();
    const limiter = createRateLimiter(5, 60_000);
    for (let i = 0; i < 5; i++) limiter('tool');
    expect(limiter('tool').allowed).toBe(false);

    vi.advanceTimersByTime(60_001);
    expect(limiter('tool').allowed).toBe(true);
  });

  it('tracks different keys independently', () => {
    const limiter = createRateLimiter(5, 60_000);
    for (let i = 0; i < 5; i++) limiter('tool-a');
    expect(limiter('tool-a').allowed).toBe(false);
    expect(limiter('tool-b').allowed).toBe(true);
  });

  it('retryAfterMs is approximately the window duration for the first excess call', () => {
    vi.useFakeTimers();
    const limiter = createRateLimiter(5, 60_000);
    for (let i = 0; i < 5; i++) limiter('tool');
    const { retryAfterMs } = limiter('tool');
    expect(retryAfterMs).toBeGreaterThan(59_000);
    expect(retryAfterMs).toBeLessThanOrEqual(60_000);
  });
});
