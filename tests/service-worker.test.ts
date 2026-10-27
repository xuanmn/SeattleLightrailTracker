import { describe, it, expect, vi } from 'vitest';
// @ts-ignore - node builtin available in the vitest runtime
import { readFileSync } from 'node:fs';
import { injectSwManifest } from '../scripts/sw-manifest';

declare const process: { cwd(): string };

const SW_SOURCE: string = readFileSync(process.cwd() + '/public/sw.js', 'utf-8');
const SW_URL = 'https://example.test/app/sw.js';

/* ------------------------------------------------------------------ */
/* Minimal Service Worker runtime fakes                                */
/* ------------------------------------------------------------------ */

class FakeResponse {
  constructor(
    public body: string = '',
    public status: number = 200,
    public type: string = 'basic'
  ) {}
  get ok() {
    return this.status >= 200 && this.status < 300;
  }
  clone() {
    return new FakeResponse(this.body, this.status, this.type);
  }
  async text() {
    return this.body;
  }
  static error() {
    return new FakeResponse('', 0, 'error');
  }
}

interface FakeRequest {
  url: string;
  method: string;
  mode: string;
}

type FetchImpl = (input: string | FakeRequest) => Promise<FakeResponse>;

const toUrl = (input: string | FakeRequest) =>
  new URL(typeof input === 'string' ? input : input.url, SW_URL).href;

function createCacheStorage(fetchImpl: FetchImpl) {
  const stores = new Map<string, Map<string, FakeResponse>>();

  const open = async (name: string) => {
    if (!stores.has(name)) stores.set(name, new Map());
    const store = stores.get(name)!;
    return {
      match: async (req: string | FakeRequest) => store.get(toUrl(req))?.clone(),
      put: async (req: string | FakeRequest, res: FakeResponse) => {
        store.set(toUrl(req), res);
      },
      addAll: async (reqs: string[]) => {
        for (const req of reqs) {
          const res = await fetchImpl(toUrl(req));
          if (!res.ok) throw new TypeError(`addAll failed for ${req}`);
          store.set(toUrl(req), res);
        }
      },
    };
  };

  return {
    stores,
    api: {
      open,
      keys: async () => [...stores.keys()],
      delete: async (name: string) => stores.delete(name),
    },
  };
}

function loadServiceWorker(source: string, fetchImpl: FetchImpl) {
  const listeners: Record<string, (event: unknown) => void> = {};
  const self = {
    location: new URL(SW_URL),
    addEventListener: (type: string, fn: (event: unknown) => void) => {
      listeners[type] = fn;
    },
    skipWaiting: vi.fn(async () => undefined),
    clients: { claim: vi.fn(async () => undefined) },
  };
  const fetchSpy = vi.fn(fetchImpl);
  const caches = createCacheStorage(fetchSpy);

  // eslint-disable-next-line @typescript-eslint/no-implied-eval
  new Function('self', 'caches', 'fetch', 'Response', source)(self, caches.api, fetchSpy, FakeResponse);

  const runLifecycle = async (type: 'install' | 'activate') => {
    let pending: Promise<unknown> = Promise.resolve();
    listeners[type]({ waitUntil: (p: Promise<unknown>) => (pending = p) });
    await pending;
  };

  const dispatchFetch = (url: string, mode = 'no-cors') => {
    let response: Promise<FakeResponse> | undefined;
    const request: FakeRequest = { url: new URL(url, SW_URL).href, method: 'GET', mode };
    listeners.fetch({
      request,
      respondWith: (p: Promise<FakeResponse>) => (response = Promise.resolve(p)),
      waitUntil: () => undefined,
    });
    return response;
  };

  return { listeners, caches, fetchSpy, runLifecycle, dispatchFetch };
}

const okFetch: FetchImpl = async (input) => new FakeResponse(`network:${toUrl(input)}`);
const failingFetch: FetchImpl = async () => {
  throw new TypeError('Failed to fetch');
};

const BUILT_SW = injectSwManifest(SW_SOURCE, {
  buildId: 'abc123def456',
  assets: ['./assets/index-AAAA.js', './assets/index-BBBB.css', './assets/SystemMapModal-CCCC.js'],
});

/* ------------------------------------------------------------------ */

describe('injectSwManifest (build-time precache manifest)', () => {
  it('stamps the build id and hashed asset list into the service worker', () => {
    expect(BUILT_SW).toContain(`const BUILD_ID = 'abc123def456';`);
    expect(BUILT_SW).toContain(
      `const BUILD_ASSETS = ["./assets/index-AAAA.js","./assets/index-BBBB.css","./assets/SystemMapModal-CCCC.js"];`
    );
    expect(BUILT_SW).not.toContain(`const BUILD_ID = 'dev';`);
  });

  it('fails loudly if the placeholders are missing so a broken SW is never shipped', () => {
    expect(() => injectSwManifest('self.addEventListener("fetch", () => {});', { buildId: 'x', assets: [] })).toThrow(
      /placeholder/i
    );
  });
});

describe('Service worker lifecycle', () => {
  it('precaches the app shell plus every hashed build asset on install', async () => {
    const sw = loadServiceWorker(BUILT_SW, okFetch);
    await sw.runLifecycle('install');

    const [cacheName] = [...sw.caches.stores.keys()];
    const cached = [...sw.caches.stores.get(cacheName)!.keys()];

    expect(cached).toContain('https://example.test/app/index.html');
    expect(cached).toContain('https://example.test/app/assets/index-AAAA.js');
    expect(cached).toContain('https://example.test/app/assets/index-BBBB.css');
    expect(cached).toContain('https://example.test/app/assets/SystemMapModal-CCCC.js');
  });

  it('versions the cache by build id so each deploy gets a fresh cache', async () => {
    const sw = loadServiceWorker(BUILT_SW, okFetch);
    await sw.runLifecycle('install');
    expect([...sw.caches.stores.keys()][0]).toContain('abc123def456');
  });

  it('deletes caches from previous builds on activate', async () => {
    const sw = loadServiceWorker(BUILT_SW, okFetch);
    await sw.caches.api.open('link-tracker-v1.3.0');
    await sw.caches.api.open('link-tracker-v1.4.0-oldbuild');
    await sw.runLifecycle('install');
    await sw.runLifecycle('activate');

    const remaining = [...sw.caches.stores.keys()];
    expect(remaining).toHaveLength(1);
    expect(remaining[0]).toContain('abc123def456');
  });
});

describe('Service worker fetch routing', () => {
  it('serves hashed bundles straight from cache without touching the network', async () => {
    const sw = loadServiceWorker(BUILT_SW, okFetch);
    await sw.runLifecycle('install');
    sw.fetchSpy.mockClear();

    const res = await sw.dispatchFetch('./assets/index-AAAA.js');
    expect(res?.body).toBe('network:https://example.test/app/assets/index-AAAA.js');
    expect(sw.fetchSpy).not.toHaveBeenCalled();
  });

  it('fetches and caches a hashed bundle that is not yet cached', async () => {
    const sw = loadServiceWorker(BUILT_SW, okFetch);
    const res = await sw.dispatchFetch('./assets/FaqModal-DDDD.js');
    expect(res?.status).toBe(200);
    expect(sw.fetchSpy).toHaveBeenCalledTimes(1);

    sw.fetchSpy.mockClear();
    await sw.dispatchFetch('./assets/FaqModal-DDDD.js');
    expect(sw.fetchSpy).not.toHaveBeenCalled();
  });

  it('returns a network error response (not undefined) for an uncached bundle while offline', async () => {
    const sw = loadServiceWorker(BUILT_SW, failingFetch);
    const res = await sw.dispatchFetch('./assets/FaqModal-DDDD.js');
    expect(res).toBeDefined();
    expect(res?.type).toBe('error');
  });

  it('returns a network error response (not undefined) for an uncached static file while offline', async () => {
    const sw = loadServiceWorker(BUILT_SW, failingFetch);
    const res = await sw.dispatchFetch('./icons/unknown.png');
    expect(res).toBeDefined();
    expect(res?.type).toBe('error');
  });

  it('returns a network error response (not undefined) for an uncached font while offline', async () => {
    const sw = loadServiceWorker(BUILT_SW, failingFetch);
    const res = await sw.dispatchFetch('https://fonts.gstatic.com/s/inter/v1/font.woff2');
    expect(res).toBeDefined();
    expect(res?.type).toBe('error');
  });

  it('never intercepts live OneBusAway API requests', () => {
    const sw = loadServiceWorker(BUILT_SW, okFetch);
    const res = sw.dispatchFetch('https://api.pugetsound.onebusaway.org/api/where/arrivals.json');
    expect(res).toBeUndefined();
  });

  it('clears the navigation fallback timeout once the network navigation succeeds', async () => {
    vi.useFakeTimers();
    try {
      const sw = loadServiceWorker(BUILT_SW, okFetch);
      await sw.runLifecycle('install');

      const res = await sw.dispatchFetch('./index.html', 'navigate');
      expect(res?.status).toBe(200);

      // Spy on caches.open AFTER navigation has already resolved
      const openSpy = vi.spyOn(sw.caches.api, 'open');
      await vi.advanceTimersByTimeAsync(5000);

      // The 3s fallback timer should have been cleared and must not open the cache later
      expect(openSpy).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });
});
