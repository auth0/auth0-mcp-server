import { describe, it, expect } from 'vitest';
import { resolvePlaceholders, calculateUrlUpdates } from '../../src/utils/quickstart-guide';
import { UrlSource } from '../../src/utils/onboarding';

describe('resolvePlaceholders', () => {
  const placeholders = {
    '%AUTH0_DOMAIN%': { inputKey: 'auth0Domain' },
    '%AUTH0_CLIENT_ID%': { inputKey: 'auth0ClientId' },
    '%PORT%': { inputKey: 'port' },
    '%APP_SCHEME%': { inputKey: 'appScheme' },
    '%APP_DOMAIN%': { inputKey: 'appDomain' },
    '%SDK_VERSION%': '2.x',
    '%GIT_REMOTE%': { environmentKey: 'gitRemote' },
    '%GIT_BRANCH%': { environmentKey: 'gitBranch' },
    '{import.meta.env.VITE_AUTH0_DOMAIN}': { inputKey: 'auth0Domain', prefix: '"', suffix: '"' },
  };

  const inputValues = {
    auth0Domain: 'tenant.auth0.com',
    auth0ClientId: 'abc123',
    port: '5173',
    appDomain: 'localhost',
    appScheme: 'http',
  };

  const environment = {
    gitRemote: 'https://github.com/auth0-samples/auth0-react-samples',
    gitBranch: 'quickstart/login',
  };

  it('should resolve inputKey placeholders', () => {
    const result = resolvePlaceholders(
      'Domain: %AUTH0_DOMAIN%, ID: %AUTH0_CLIENT_ID%',
      placeholders,
      inputValues,
      environment
    );
    expect(result).toBe('Domain: tenant.auth0.com, ID: abc123');
  });

  it('should resolve static string placeholders', () => {
    const result = resolvePlaceholders(
      'npm install @auth0/auth0-react@%SDK_VERSION%',
      placeholders,
      inputValues,
      environment
    );
    expect(result).toBe('npm install @auth0/auth0-react@2.x');
  });

  it('should resolve environmentKey placeholders', () => {
    const result = resolvePlaceholders(
      'git clone -b %GIT_BRANCH% %GIT_REMOTE%',
      placeholders,
      inputValues,
      environment
    );
    expect(result).toBe(
      'git clone -b quickstart/login https://github.com/auth0-samples/auth0-react-samples'
    );
  });

  it('should apply prefix and suffix wrapping', () => {
    const result = resolvePlaceholders(
      'domain={import.meta.env.VITE_AUTH0_DOMAIN}',
      placeholders,
      inputValues,
      environment
    );
    expect(result).toBe('domain="tenant.auth0.com"');
  });

  it('should leave unresolvable placeholders unchanged', () => {
    const result = resolvePlaceholders(
      'Value: %UNKNOWN%',
      { '%UNKNOWN%': { inputKey: 'nonexistent' } },
      inputValues,
      environment
    );
    expect(result).toBe('Value: %UNKNOWN%');
  });

  it('should handle prompts with no matching placeholders', () => {
    const result = resolvePlaceholders(
      'No placeholders here',
      placeholders,
      inputValues,
      environment
    );
    expect(result).toBe('No placeholders here');
  });

  it('should handle multiple occurrences of the same placeholder', () => {
    const result = resolvePlaceholders('%PORT% and %PORT%', placeholders, inputValues, environment);
    expect(result).toBe('5173 and 5173');
  });

  it('should handle empty placeholders map', () => {
    const result = resolvePlaceholders('%PORT%', {}, inputValues, environment);
    expect(result).toBe('%PORT%');
  });

  it('should handle empty string prompt', () => {
    const result = resolvePlaceholders('', placeholders, inputValues, environment);
    expect(result).toBe('');
  });

  it('should not recursively expand values containing placeholder syntax', () => {
    const result = resolvePlaceholders(
      'Domain: %AUTH0_DOMAIN%',
      { '%AUTH0_DOMAIN%': { inputKey: 'auth0Domain' } },
      { auth0Domain: '%PORT%' },
      environment
    );
    expect(result).toBe('Domain: %PORT%');
  });

  it('should leave placeholder unchanged when environmentKey is missing', () => {
    const result = resolvePlaceholders(
      'URL: %DOWNLOAD_URL%',
      { '%DOWNLOAD_URL%': { environmentKey: 'downloadUrl' } },
      inputValues,
      {}
    );
    expect(result).toBe('URL: %DOWNLOAD_URL%');
  });
});

describe('calculateUrlUpdates', () => {
  const baseResolvedUrls = {
    base_url: 'http://localhost:3000',
    callback_urls: ['http://localhost:3000/callback'],
    logout_urls: ['http://localhost:3000/'],
    web_origins: ['http://localhost:3000'],
    url_source: UrlSource.FrameworkDefault,
  };

  it('should detect all URLs as new when app has none', () => {
    const currentApp = { callbacks: [], allowed_logout_urls: [], web_origins: [] };
    const { updatePayload, finalUrls } = calculateUrlUpdates(baseResolvedUrls, currentApp);

    expect(updatePayload).not.toBeNull();
    expect(updatePayload!.callbacks).toEqual(['http://localhost:3000/callback']);
    expect(updatePayload!.allowed_logout_urls).toEqual(['http://localhost:3000/']);
    expect(updatePayload!.web_origins).toEqual(['http://localhost:3000']);
    expect(finalUrls.callbacks).toEqual(['http://localhost:3000/callback']);
    expect(finalUrls.allowed_logout_urls).toEqual(['http://localhost:3000/']);
    expect(finalUrls.web_origins).toEqual(['http://localhost:3000']);
  });

  it('should return null updatePayload when all URLs already exist', () => {
    const currentApp = {
      callbacks: ['http://localhost:3000/callback'],
      allowed_logout_urls: ['http://localhost:3000/'],
      web_origins: ['http://localhost:3000'],
    };
    const { updatePayload } = calculateUrlUpdates(baseResolvedUrls, currentApp);
    expect(updatePayload).toBeNull();
  });

  it('should append new URLs while preserving existing ones', () => {
    const currentApp = {
      callbacks: ['https://prod.example.com/callback'],
      allowed_logout_urls: ['https://prod.example.com'],
      web_origins: ['https://prod.example.com'],
    };
    const { updatePayload, finalUrls } = calculateUrlUpdates(baseResolvedUrls, currentApp);

    expect(updatePayload!.callbacks).toEqual([
      'https://prod.example.com/callback',
      'http://localhost:3000/callback',
    ]);
    expect(finalUrls.callbacks).toEqual([
      'https://prod.example.com/callback',
      'http://localhost:3000/callback',
    ]);
  });

  it('should only include fields with additions in the update payload', () => {
    const currentApp = {
      callbacks: ['http://localhost:3000/callback'],
      allowed_logout_urls: [],
      web_origins: ['http://localhost:3000'],
    };
    const { updatePayload } = calculateUrlUpdates(baseResolvedUrls, currentApp);

    expect(updatePayload!.callbacks).toBeUndefined();
    expect(updatePayload!.allowed_logout_urls).toEqual(['http://localhost:3000/']);
    expect(updatePayload!.web_origins).toBeUndefined();
  });

  it('should set skip_non_verifiable flag for localhost callbacks', () => {
    const currentApp = { callbacks: [], allowed_logout_urls: [], web_origins: [] };
    const { updatePayload, finalUrls } = calculateUrlUpdates(baseResolvedUrls, currentApp);

    expect(updatePayload!.skip_non_verifiable_callback_uri_confirmation_prompt).toBe(true);
    expect(finalUrls.skip_non_verifiable_callback_uri_confirmation_prompt).toBe(true);
  });

  it('should not set skip_non_verifiable flag when no update is needed even with localhost URLs', () => {
    const currentApp = {
      callbacks: ['http://localhost:3000/callback'],
      allowed_logout_urls: ['http://localhost:3000/'],
      web_origins: ['http://localhost:3000'],
    };
    const { updatePayload, finalUrls } = calculateUrlUpdates(baseResolvedUrls, currentApp);

    expect(updatePayload).toBeNull();
    expect(finalUrls.skip_non_verifiable_callback_uri_confirmation_prompt).toBeUndefined();
  });

  it('should not set skip_non_verifiable flag for production URLs', () => {
    const resolvedUrls = {
      base_url: 'https://myapp.com',
      callback_urls: ['https://myapp.com/callback'],
      logout_urls: ['https://myapp.com/'],
      web_origins: ['https://myapp.com'],
      url_source: UrlSource.Detected,
    };
    const currentApp = { callbacks: [], allowed_logout_urls: [], web_origins: [] };
    const { updatePayload, finalUrls } = calculateUrlUpdates(resolvedUrls, currentApp);

    expect(updatePayload!.skip_non_verifiable_callback_uri_confirmation_prompt).toBeUndefined();
    expect(finalUrls.skip_non_verifiable_callback_uri_confirmation_prompt).toBeUndefined();
  });

  it('should handle missing fields in currentApp gracefully', () => {
    const currentApp = {};
    const { updatePayload } = calculateUrlUpdates(baseResolvedUrls, currentApp);

    expect(updatePayload).not.toBeNull();
    expect(updatePayload!.callbacks).toEqual(['http://localhost:3000/callback']);
  });

  it('should handle resolved URLs without web_origins (non-SPA)', () => {
    const resolvedUrls = {
      base_url: 'http://localhost:3000',
      callback_urls: ['http://localhost:3000/callback'],
      logout_urls: ['http://localhost:3000/'],
      url_source: UrlSource.FrameworkDefault,
    };
    const currentApp = { callbacks: [], allowed_logout_urls: [] };
    const { updatePayload, finalUrls } = calculateUrlUpdates(resolvedUrls, currentApp);

    expect(updatePayload!.web_origins).toBeUndefined();
    expect(finalUrls.web_origins).toBeUndefined();
  });

  it('should handle currentApp with undefined URL fields', () => {
    const currentApp = {
      callbacks: undefined,
      allowed_logout_urls: undefined,
      web_origins: undefined,
    };
    const { updatePayload } = calculateUrlUpdates(baseResolvedUrls, currentApp);

    expect(updatePayload).not.toBeNull();
    expect(updatePayload!.callbacks).toEqual(['http://localhost:3000/callback']);
    expect(updatePayload!.allowed_logout_urls).toEqual(['http://localhost:3000/']);
    expect(updatePayload!.web_origins).toEqual(['http://localhost:3000']);
  });

  it('should handle currentApp with null URL fields', () => {
    const currentApp = { callbacks: null, allowed_logout_urls: null, web_origins: null };
    const { updatePayload } = calculateUrlUpdates(baseResolvedUrls, currentApp);

    expect(updatePayload).not.toBeNull();
    expect(updatePayload!.callbacks).toEqual(['http://localhost:3000/callback']);
  });
});
