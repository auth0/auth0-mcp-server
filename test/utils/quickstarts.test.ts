import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { http, HttpResponse } from 'msw';
import { server } from '../setup';

vi.mock('../../src/utils/logger.js', () => ({
  log: vi.fn(),
}));

const CDN_BASE = 'https://cdn.auth0.com/manhattan/quickstarts';
const QUICKSTART_RELEASE_URL = `${CDN_BASE}/releases/production.json`;
const MOCK_VERSION = '1.0.42';
const CACHE_TTL_MS = 60 * 60 * 1000;

const FRAMEWORK_FILENAMES: Record<string, string> = {
  react: 'react-quickstart-definition.json',
  vue: 'vuejs-quickstart-definition.json',
  angular: 'angular-quickstart-definition.json',
  nextjs: 'nextjs-quickstart-definition.json',
};

const defUrl = (framework: string) =>
  `${CDN_BASE}/versions/${MOCK_VERSION}/assets/definitions/en/${FRAMEWORK_FILENAMES[framework]}`;

const MOCK_QUICKSTART_RELEASE_RESPONSE = {
  name: 'quickstarts',
  scheme: 'versioned',
  current: MOCK_VERSION,
  fallback: '0.0.0',
};

const makeMockRawSpec = (framework: string) => ({
  appType: 'spa',
  defaultAppOrigin: { scheme: 'http', domain: 'localhost', port: 3000 },
  callbackPath: '/callback',
  logoutPath: '/logout',
  llmPromptPath: `https://example.com/${framework}-prompt`,
  envSnippet: {
    type: 'env',
    language: 'shell',
    fileName: '.env',
    entries: [
      { type: 'var', name: 'CLIENT_ID', value: '{yourClientId}' },
      { type: 'var', name: 'CLIENT_SECRET', value: '{yourClientSecret}', sensitive: true },
    ],
  },
  placeholders: { domain: 'example.auth0.com' },
  inputs: { framework },
  environment: { NODE_ENV: 'development' },
  download: { url: 'https://example.com/download.zip' },
  steps: [{ title: 'Step 1', content: 'Do something' }],
  nextSteps: [{ title: 'Next', content: 'Do more' }],
  technologyLabel: 'React SPA',
});

const makeExpectedSpec = (framework: string) => ({
  appType: 'spa',
  defaultAppOrigin: { scheme: 'http', domain: 'localhost', port: 3000 },
  callbackPath: '/callback',
  logoutPath: '/logout',
  llmPromptPath: `https://example.com/${framework}-prompt`,
  envSnippet: {
    type: 'env',
    language: 'shell',
    fileName: '.env',
    entries: [
      { type: 'var', name: 'CLIENT_ID', value: '{yourClientId}' },
      { type: 'var', name: 'CLIENT_SECRET', value: '{yourClientSecret}', sensitive: true },
    ],
  },
  placeholders: { domain: 'example.auth0.com' },
  inputs: { framework },
  environment: { NODE_ENV: 'development' },
});

const mockLatest = () =>
  http.get(QUICKSTART_RELEASE_URL, () => HttpResponse.json(MOCK_QUICKSTART_RELEASE_RESPONSE));

const mockDefinition = (framework: string) =>
  http.get(defUrl(framework), () => HttpResponse.json(makeMockRawSpec(framework)));

describe('fetchQuickstartSpec', () => {
  let fetchQuickstartSpec: typeof import('../../src/utils/quickstarts.js').fetchQuickstartSpec;

  beforeEach(async () => {
    vi.resetModules();
    const mod = await import('../../src/utils/quickstarts.js');
    fetchQuickstartSpec = mod.fetchQuickstartSpec;
  });

  afterEach(() => {
    vi.restoreAllMocks();
    server.resetHandlers();
  });

  it('fetches and returns a stripped spec', async () => {
    server.use(mockLatest(), mockDefinition('react'));
    const spec = await fetchQuickstartSpec('react');
    expect(spec).toEqual(makeExpectedSpec('react'));
  });

  it('resolves URLs in two steps: production.json then versioned definition', async () => {
    const urls: string[] = [];
    server.use(
      http.get(QUICKSTART_RELEASE_URL, () => {
        urls.push(QUICKSTART_RELEASE_URL);
        return HttpResponse.json(MOCK_QUICKSTART_RELEASE_RESPONSE);
      }),
      http.get(defUrl('react'), ({ request }) => {
        urls.push(request.url);
        return HttpResponse.json(makeMockRawSpec('react'));
      })
    );
    await fetchQuickstartSpec('react');
    expect(urls).toEqual([QUICKSTART_RELEASE_URL, defUrl('react')]);
  });

  it.each([
    ['react', 'react-quickstart-definition.json'],
    ['vue', 'vuejs-quickstart-definition.json'],
    ['angular', 'angular-quickstart-definition.json'],
    ['nextjs', 'nextjs-quickstart-definition.json'],
  ])('maps %s to filename %s', async (framework, expectedFilename) => {
    let capturedUrl = '';
    server.use(
      mockLatest(),
      http.get(
        defUrl(framework),
        ({ request }) => {
          capturedUrl = request.url;
          return HttpResponse.json(makeMockRawSpec(framework));
        }
      )
    );
    await fetchQuickstartSpec(framework);
    expect(capturedUrl).toContain(expectedFilename);
  });

  it.each(['React', 'REACT', 'Vue', 'Angular', 'NextJS'])(
    'handles mixed-case framework input "%s"',
    async (framework) => {
      const lower = framework.toLowerCase();
      server.use(mockLatest(), mockDefinition(lower));
      const result = await fetchQuickstartSpec(framework);
      expect(result).toEqual(makeExpectedSpec(lower));
    }
  );

  it.each([undefined, '', 123])('returns null when callbackPath is %s', async (callbackPath) => {
    server.use(
      mockLatest(),
      http.get(defUrl('react'), () =>
        HttpResponse.json({ ...makeMockRawSpec('react'), callbackPath })
      )
    );
    const result = await fetchQuickstartSpec('react');
    expect(result).toBeNull();
  });

  it('returns null when CDN returns an invalid version format', async () => {
    server.use(
      http.get(QUICKSTART_RELEASE_URL, () =>
        HttpResponse.json({ ...MOCK_QUICKSTART_RELEASE_RESPONSE, current: '../../evil' })
      )
    );
    const result = await fetchQuickstartSpec('react');
    expect(result).toBeNull();
  });

  it('returns null when CDN returns a version with extra characters', async () => {
    server.use(
      http.get(QUICKSTART_RELEASE_URL, () =>
        HttpResponse.json({ ...MOCK_QUICKSTART_RELEASE_RESPONSE, current: '1.2.3-beta' })
      )
    );
    const result = await fetchQuickstartSpec('react');
    expect(result).toBeNull();
  });

  it('returns null for unknown framework without network calls', async () => {
    let fetchCalled = false;
    server.use(
      http.get('*', () => {
        fetchCalled = true;
        return HttpResponse.json({});
      })
    );
    const result = await fetchQuickstartSpec('unknown-framework');
    expect(result).toBeNull();
    expect(fetchCalled).toBe(false);
  });

  it('strips download, steps, nextSteps, technologyLabel from the response', async () => {
    server.use(mockLatest(), mockDefinition('react'));
    const spec = (await fetchQuickstartSpec('react')) as any;
    expect(spec).not.toHaveProperty('download');
    expect(spec).not.toHaveProperty('steps');
    expect(spec).not.toHaveProperty('nextSteps');
    expect(spec).not.toHaveProperty('technologyLabel');
  });

  it('returns cached spec within TTL without network calls', async () => {
    server.use(mockLatest(), mockDefinition('react'));
    const first = await fetchQuickstartSpec('react');

    server.use(
      http.get(QUICKSTART_RELEASE_URL, () => HttpResponse.error()),
      http.get(defUrl('react'), () => HttpResponse.error())
    );
    const second = await fetchQuickstartSpec('react');
    expect(second).toEqual(first);
  });

  it('re-fetches after cache TTL expires', async () => {
    const now = Date.now();
    vi.spyOn(Date, 'now').mockReturnValue(now);

    server.use(mockLatest(), mockDefinition('react'));
    await fetchQuickstartSpec('react');

    vi.spyOn(Date, 'now').mockReturnValue(now + CACHE_TTL_MS + 1);

    let latestCalled = false;
    server.use(
      http.get(QUICKSTART_RELEASE_URL, () => {
        latestCalled = true;
        return HttpResponse.json(MOCK_QUICKSTART_RELEASE_RESPONSE);
      }),
      mockDefinition('react')
    );
    await fetchQuickstartSpec('react');
    expect(latestCalled).toBe(true);
  });

  it('returns stale spec when CDN fails after TTL', async () => {
    const now = Date.now();
    vi.spyOn(Date, 'now').mockReturnValue(now);

    server.use(mockLatest(), mockDefinition('react'));
    const fresh = await fetchQuickstartSpec('react');

    vi.spyOn(Date, 'now').mockReturnValue(now + CACHE_TTL_MS + 1);

    server.use(http.get(QUICKSTART_RELEASE_URL, () => new HttpResponse(null, { status: 500 })));
    const stale = await fetchQuickstartSpec('react');
    expect(stale).toEqual(fresh);
  });

  it('returns null on 404 without retrying', async () => {
    let defCalls = 0;
    server.use(
      mockLatest(),
      http.get(defUrl('react'), () => {
        defCalls++;
        return new HttpResponse(null, { status: 404 });
      })
    );
    const result = await fetchQuickstartSpec('react');
    expect(result).toBeNull();
    expect(defCalls).toBe(1);
  });

  it('retries on 5xx and returns null if both fail', async () => {
    let attempts = 0;
    server.use(
      mockLatest(),
      http.get(defUrl('react'), () => {
        attempts++;
        return new HttpResponse(null, { status: 500 });
      })
    );
    const result = await fetchQuickstartSpec('react');
    expect(result).toBeNull();
    expect(attempts).toBe(2);
  });

  it('retries on 5xx and returns spec if retry succeeds', async () => {
    let attempts = 0;
    server.use(
      mockLatest(),
      http.get(defUrl('react'), () => {
        attempts++;
        if (attempts === 1) {
          return new HttpResponse(null, { status: 500 });
        }
        return HttpResponse.json(makeMockRawSpec('react'));
      })
    );
    const result = await fetchQuickstartSpec('react');
    expect(result).toEqual(makeExpectedSpec('react'));
  });

  it('retries on network error and returns spec if retry succeeds', async () => {
    let attempts = 0;
    server.use(
      mockLatest(),
      http.get(defUrl('react'), () => {
        attempts++;
        if (attempts === 1) {
          return HttpResponse.error();
        }
        return HttpResponse.json(makeMockRawSpec('react'));
      })
    );
    const result = await fetchQuickstartSpec('react');
    expect(result).toEqual(makeExpectedSpec('react'));
  });

  it('deduplicates concurrent requests for the same framework into a single CDN call', async () => {
    let latestCalls = 0;
    server.use(
      http.get(QUICKSTART_RELEASE_URL, () => {
        latestCalls++;
        return HttpResponse.json(MOCK_QUICKSTART_RELEASE_RESPONSE);
      }),
      mockDefinition('react')
    );

    const [a, b, c] = await Promise.all([
      fetchQuickstartSpec('react'),
      fetchQuickstartSpec('react'),
      fetchQuickstartSpec('react'),
    ]);

    expect(latestCalls).toBe(1);
    expect(a).toEqual(makeExpectedSpec('react'));
    expect(b).toEqual(a);
    expect(c).toEqual(a);
  });

  it('deduplicates concurrent requests even when they error', async () => {
    let latestCalls = 0;
    server.use(
      http.get(QUICKSTART_RELEASE_URL, () => {
        latestCalls++;
        return new HttpResponse(null, { status: 500 });
      })
    );

    const [a, b] = await Promise.all([fetchQuickstartSpec('react'), fetchQuickstartSpec('react')]);

    // fetchWithOptions retries once on 5xx, so 2 CDN calls total (not 4 from two independent requests)
    expect(latestCalls).toBe(2);
    expect(a).toBeNull();
    expect(b).toBeNull();
  });

  it('allows a new fetch after the inflight promise settles', async () => {
    let latestCalls = 0;
    server.use(
      http.get(QUICKSTART_RELEASE_URL, () => {
        latestCalls++;
        return HttpResponse.json(MOCK_QUICKSTART_RELEASE_RESPONSE);
      }),
      mockDefinition('react')
    );

    await fetchQuickstartSpec('react');

    vi.spyOn(Date, 'now').mockReturnValue(Date.now() + CACHE_TTL_MS + 1);
    await fetchQuickstartSpec('react');

    expect(latestCalls).toBe(2);
  });

  it('fires independent CDN requests for two different frameworks fetched concurrently', async () => {
    let latestCalls = 0;
    server.use(
      http.get(QUICKSTART_RELEASE_URL, () => {
        latestCalls++;
        return HttpResponse.json(MOCK_QUICKSTART_RELEASE_RESPONSE);
      }),
      mockDefinition('react'),
      mockDefinition('angular')
    );

    const [react, angular] = await Promise.all([
      fetchQuickstartSpec('react'),
      fetchQuickstartSpec('angular'),
    ]);

    expect(latestCalls).toBe(2);
    expect(react).toEqual(makeExpectedSpec('react'));
    expect(angular).toEqual(makeExpectedSpec('angular'));
  });

  it('does not re-fetch production.json when serving from cache', async () => {
    let latestCalls = 0;
    server.use(
      http.get(QUICKSTART_RELEASE_URL, () => {
        latestCalls++;
        return HttpResponse.json(MOCK_QUICKSTART_RELEASE_RESPONSE);
      }),
      mockDefinition('react')
    );
    await fetchQuickstartSpec('react');
    expect(latestCalls).toBe(1);

    await fetchQuickstartSpec('react');
    expect(latestCalls).toBe(1);
  });
});
