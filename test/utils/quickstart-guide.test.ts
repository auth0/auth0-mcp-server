import { describe, it, expect } from 'vitest';
import { calculateUrlUpdates } from '../../src/utils/quickstart-guide';
import { UrlSource } from '../../src/utils/onboarding';

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
