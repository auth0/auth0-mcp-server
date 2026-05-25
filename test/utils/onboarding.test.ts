import { describe, it, expect } from 'vitest';
import {
  resolveCallbackUrls,
  resolveDefaultOrigin,
  UrlSource,
  SUPPORTED_FRAMEWORKS,
  isFrameworkSupported,
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
    expect(isFrameworkSupported('express')).toBe(false);
    expect(isFrameworkSupported('flask')).toBe(false);
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
});
