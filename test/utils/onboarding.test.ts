import { describe, it, expect } from 'vitest';
import {
  resolveCallbackUrls,
  resolveDefaultOrigin,
  UrlSource,
  SUPPORTED_FRAMEWORKS,
  isFrameworkSupported,
  hasNonVerifiableCallbacks,
} from '../../src/utils/onboarding';
import type { QuickstartSpec, DefaultAppOrigin } from '../../src/utils/quickstarts';

const defaultSpec: QuickstartSpec = {
  appType: 'spa',
  defaultAppOrigin: {
    scheme: 'http',
    domain: 'localhost',
    port: 3000,
  },
  callbackPath: '/callback',
  logoutPath: '/logout',
  placeholders: {},
  inputs: {},
  environment: {},
};

describe('isFrameworkSupported', () => {
  it.each(SUPPORTED_FRAMEWORKS)('returns true for supported framework: %s', (framework) => {
    expect(isFrameworkSupported(framework)).toBe(true);
  });

  it('is case-insensitive', () => {
    expect(isFrameworkSupported('NextJS')).toBe(true);
    expect(isFrameworkSupported('REACT')).toBe(true);
    expect(isFrameworkSupported('Angular')).toBe(true);
  });

  it('returns false for unsupported frameworks', () => {
    expect(isFrameworkSupported('sveltekit')).toBe(false);
    expect(isFrameworkSupported('flask')).toBe(false);
    expect(isFrameworkSupported('django')).toBe(false);
    expect(isFrameworkSupported('')).toBe(false);
  });
});

describe('resolveDefaultOrigin', () => {
  it('should resolve domain with port', () => {
    const origin: DefaultAppOrigin = { scheme: 'http', domain: 'localhost', port: 3000 };
    expect(resolveDefaultOrigin(origin)).toBe('http://localhost:3000');
  });

  it('should resolve without port when port is undefined', () => {
    const origin: DefaultAppOrigin = { scheme: 'https', domain: 'example.com' };
    expect(resolveDefaultOrigin(origin)).toBe('https://example.com');
  });

  it('should normalize default port 80 for http', () => {
    const origin: DefaultAppOrigin = { scheme: 'http', domain: 'localhost', port: 80 };
    expect(resolveDefaultOrigin(origin)).toBe('http://localhost');
  });

  it('should normalize default port 443 for https', () => {
    const origin: DefaultAppOrigin = { scheme: 'https', domain: 'example.com', port: 443 };
    expect(resolveDefaultOrigin(origin)).toBe('https://example.com');
  });

  it('should handle non-default ports', () => {
    const origin: DefaultAppOrigin = { scheme: 'https', domain: 'example.com', port: 8443 };
    expect(resolveDefaultOrigin(origin)).toBe('https://example.com:8443');
  });

  it('should resolve object-form domain from inputValues', () => {
    const origin: DefaultAppOrigin = { scheme: 'https', domain: { inputKey: 'auth0Domain' } };
    expect(resolveDefaultOrigin(origin, { auth0Domain: 'tenant.auth0.com' })).toBe(
      'https://tenant.auth0.com'
    );
  });

  it('should throw when object-form domain cannot be resolved from inputValues', () => {
    const origin: DefaultAppOrigin = { scheme: 'https', domain: { inputKey: 'auth0Domain' } };
    expect(() => resolveDefaultOrigin(origin, {})).toThrow(
      /Cannot resolve defaultAppOrigin.domain/
    );
  });
});

describe('resolveCallbackUrls', () => {
  describe('with base URL provided', () => {
    it('should use the provided base url', () => {
      const expectedBaseUrl = 'http://localhost:4000';
      const result = resolveCallbackUrls(defaultSpec, expectedBaseUrl);

      expect(result.base_url).toBe(expectedBaseUrl);
      expect(result.callback_urls).toEqual([`${expectedBaseUrl}/callback`]);
      expect(result.logout_urls).toEqual([`${expectedBaseUrl}/logout`]);
      expect(result.web_origins).toEqual([expectedBaseUrl]);
      expect(result.url_source).toBe(UrlSource.Detected);
    });

    it('should strip trailing slashes from base URL', () => {
      const result = resolveCallbackUrls(defaultSpec, 'http://localhost:4000/////');
      expect(result.base_url).toBe('http://localhost:4000');
    });

    it('should trim whitespace from base URL', () => {
      const result = resolveCallbackUrls(defaultSpec, '   http://localhost:4000 ');
      expect(result.base_url).toBe('http://localhost:4000');
    });

    it('should trim whitespace and strip trailing slashes together', () => {
      const result = resolveCallbackUrls(defaultSpec, ' http://localhost:4000////  ');
      expect(result.base_url).toBe('http://localhost:4000');
    });
  });

  describe('with no base URL', () => {
    it('should resolve from defaultAppOrigin object', () => {
      const result = resolveCallbackUrls(defaultSpec);

      expect(result.base_url).toBe('http://localhost:3000');
      expect(result.callback_urls).toEqual(['http://localhost:3000/callback']);
      expect(result.logout_urls).toEqual(['http://localhost:3000/logout']);
      expect(result.web_origins).toEqual(['http://localhost:3000']);
      expect(result.url_source).toBe(UrlSource.FrameworkDefault);
    });

    it('should handle defaultAppOrigin without port', () => {
      const spec: QuickstartSpec = {
        ...defaultSpec,
        defaultAppOrigin: { scheme: 'https', domain: 'example.com' },
      };

      const result = resolveCallbackUrls(spec);

      expect(result.base_url).toBe('https://example.com');
      expect(result.callback_urls).toEqual(['https://example.com/callback']);
    });
  });

  describe('callback and logout path handling', () => {
    it('should use base URL when callbackPath is empty', () => {
      const spec: QuickstartSpec = { ...defaultSpec, callbackPath: '' };
      const result = resolveCallbackUrls(spec);

      expect(result.callback_urls).toEqual(['http://localhost:3000']);
      expect(result.logout_urls).toEqual(['http://localhost:3000/logout']);
    });

    it('should use base URL when logoutPath is empty', () => {
      const spec: QuickstartSpec = { ...defaultSpec, logoutPath: '' };
      const result = resolveCallbackUrls(spec);

      expect(result.callback_urls).toEqual(['http://localhost:3000/callback']);
      expect(result.logout_urls).toEqual(['http://localhost:3000']);
    });

    it('should use base URL for both when paths are empty', () => {
      const spec: QuickstartSpec = { ...defaultSpec, callbackPath: '', logoutPath: '' };
      const result = resolveCallbackUrls(spec);

      expect(result.callback_urls).toEqual(['http://localhost:3000']);
      expect(result.logout_urls).toEqual(['http://localhost:3000']);
    });
  });

  describe('app type URL filtering', () => {
    it('should include all URL types for spa', () => {
      const result = resolveCallbackUrls({ ...defaultSpec, appType: 'spa' });

      expect(result.callback_urls).toEqual(['http://localhost:3000/callback']);
      expect(result.logout_urls).toEqual(['http://localhost:3000/logout']);
      expect(result.web_origins).toEqual(['http://localhost:3000']);
    });

    it('should omit web_origins for webapp', () => {
      const result = resolveCallbackUrls({ ...defaultSpec, appType: 'webapp' });

      expect(result.callback_urls).toEqual(['http://localhost:3000/callback']);
      expect(result.logout_urls).toEqual(['http://localhost:3000/logout']);
      expect(result.web_origins).toBeUndefined();
    });

    it('should omit web_origins for native', () => {
      const result = resolveCallbackUrls({ ...defaultSpec, appType: 'native' });

      expect(result.callback_urls).toEqual(['http://localhost:3000/callback']);
      expect(result.logout_urls).toEqual(['http://localhost:3000/logout']);
      expect(result.web_origins).toBeUndefined();
    });

    it('should apply app type filtering with provided base URL', () => {
      const result = resolveCallbackUrls(
        { ...defaultSpec, appType: 'webapp' },
        'http://localhost:8080'
      );

      expect(result.base_url).toBe('http://localhost:8080');
      expect(result.callback_urls).toEqual(['http://localhost:8080/callback']);
      expect(result.logout_urls).toEqual(['http://localhost:8080/logout']);
      expect(result.web_origins).toBeUndefined();
      expect(result.url_source).toBe(UrlSource.Detected);
    });
  });

  describe('native spec with object-form domain and placeholder paths (Android)', () => {
    const androidSpec: QuickstartSpec = {
      appType: 'native',
      defaultAppOrigin: { scheme: 'https', domain: { inputKey: 'auth0Domain' } },
      callbackPath: '/android/%APPLICATION_ID%/callback',
      logoutPath: '/android/%APPLICATION_ID%/callback',
      placeholders: { '%APPLICATION_ID%': { inputKey: 'applicationId' } },
      inputs: {},
      environment: {},
    };

    it('resolves the object domain and substitutes the path placeholder', () => {
      const result = resolveCallbackUrls(androidSpec, undefined, {
        auth0Domain: 'tenant.auth0.com',
        applicationId: 'com.auth0.samples',
      });

      expect(result.base_url).toBe('https://tenant.auth0.com');
      expect(result.callback_urls).toEqual([
        'https://tenant.auth0.com/android/com.auth0.samples/callback',
      ]);
      expect(result.logout_urls).toEqual([
        'https://tenant.auth0.com/android/com.auth0.samples/callback',
      ]);
      expect(result.web_origins).toBeUndefined();
      expect(result.url_source).toBe(UrlSource.FrameworkDefault);
    });

    it('uses a custom scheme override for the registered callback URL (custom_scheme)', () => {
      const result = resolveCallbackUrls(
        androidSpec,
        undefined,
        { auth0Domain: 'tenant.auth0.com', applicationId: 'com.auth0.samples' },
        'demo'
      );

      // The custom scheme drives the base URL and callback, not the spec's fixed https origin.
      expect(result.base_url).toBe('demo://tenant.auth0.com');
      expect(result.callback_urls).toEqual([
        'demo://tenant.auth0.com/android/com.auth0.samples/callback',
      ]);
      // A custom-scheme callback is non-verifiable.
      expect(hasNonVerifiableCallbacks(result.callback_urls!)).toBe(true);
    });
  });
});

describe('resolveDefaultOrigin with schemeOverride', () => {
  it('builds a custom-scheme origin without the "null" origin bug', () => {
    const origin: DefaultAppOrigin = { scheme: 'https', domain: { inputKey: 'auth0Domain' } };
    // new URL('demo://host').origin returns the literal "null"; the override path must not use it.
    expect(resolveDefaultOrigin(origin, { auth0Domain: 'tenant.auth0.com' }, 'demo')).toBe(
      'demo://tenant.auth0.com'
    );
  });

  it('still normalizes http/https origins when no override is given', () => {
    const origin: DefaultAppOrigin = { scheme: 'https', domain: 'example.com', port: 443 };
    expect(resolveDefaultOrigin(origin, {}, undefined)).toBe('https://example.com');
  });
});

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
      hasNonVerifiableCallbacks(['https://example.com/callback', 'http://localhost:3000/callback'])
    ).toBe(true);
  });

  it('returns false when all callbacks are verifiable', () => {
    expect(
      hasNonVerifiableCallbacks(['https://example.com/callback', 'https://app.example.com/auth'])
    ).toBe(false);
  });
});
