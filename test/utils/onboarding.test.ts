import { describe, it, expect } from 'vitest';
import { hasNonVerifiableCallbacks } from '../../src/utils/onboarding';

describe('hasNonVerifiableCallbacks', () => {
  it('returns true for localhost callback', () => {
    expect(hasNonVerifiableCallbacks(['http://localhost:3000/callback'])).toBe(true);
  });

  it('returns true for 127.0.0.1 callback', () => {
    expect(hasNonVerifiableCallbacks(['http://127.0.0.1:3000/callback'])).toBe(true);
  });

  it('returns true for other 127.x.x.x loopback addresses', () => {
    expect(hasNonVerifiableCallbacks(['http://127.0.0.2:8080/callback'])).toBe(true);
    expect(hasNonVerifiableCallbacks(['http://127.255.255.255/callback'])).toBe(true);
  });

  it('returns true for IPv6 loopback [::1]', () => {
    expect(hasNonVerifiableCallbacks(['http://[::1]:3000/callback'])).toBe(true);
  });

  it('returns true for custom URI scheme', () => {
    expect(hasNonVerifiableCallbacks(['myapp://callback'])).toBe(true);
    expect(hasNonVerifiableCallbacks(['com.example.app://auth'])).toBe(true);
  });

  it('returns false for verifiable https URL', () => {
    expect(hasNonVerifiableCallbacks(['https://example.com/callback'])).toBe(false);
  });

  it('returns false for verifiable http URL with non-loopback host', () => {
    expect(hasNonVerifiableCallbacks(['http://example.com/callback'])).toBe(false);
  });

  it('returns false for empty array', () => {
    expect(hasNonVerifiableCallbacks([])).toBe(false);
  });

  it('returns false for invalid URLs', () => {
    expect(hasNonVerifiableCallbacks(['not a url'])).toBe(false);
  });

  it('returns true if any callback is non-verifiable', () => {
    expect(
      hasNonVerifiableCallbacks([
        'https://example.com/callback',
        'http://localhost:3000/callback',
      ])
    ).toBe(true);
  });

  it('returns false when all callbacks are verifiable', () => {
    expect(
      hasNonVerifiableCallbacks([
        'https://example.com/callback',
        'https://app.example.com/auth',
      ])
    ).toBe(false);
  });
});
