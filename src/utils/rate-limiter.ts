/**
 * Returns a per-key rate-limit function. Each call returns `{ allowed, retryAfterMs }`.
 * Timestamps older than `windowMs` are pruned on every check, so the limit is
 * enforced over a rolling window rather than a fixed clock interval.
 */
export function createRateLimiter(maxCalls: number, windowMs: number) {
  const calls = new Map<string, number[]>();

  return function tryConsume(key: string): { allowed: boolean; retryAfterMs: number } {
    const now = Date.now();
    const cutoff = now - windowMs;
    const timestamps = (calls.get(key) ?? []).filter((t) => t > cutoff);

    if (timestamps.length >= maxCalls) {
      return { allowed: false, retryAfterMs: timestamps[0] + windowMs - now };
    }

    timestamps.push(now);
    calls.set(key, timestamps);
    return { allowed: true, retryAfterMs: 0 };
  };
}
