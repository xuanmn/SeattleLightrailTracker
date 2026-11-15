import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  ST_ALERTS_FEED_URL,
  transformGtfsAlerts,
  sanitizeAlertUrl,
  fetchServiceAlerts,
  clearAlertsCache,
  type RawGtfsAlertsFeed,
} from '../src/services/alerts-api';

describe('sanitizeAlertUrl', () => {
  it('allows https and http URLs', () => {
    expect(sanitizeAlertUrl('https://www.soundtransit.org/ride-with-us/service-alerts')).toBe(
      'https://www.soundtransit.org/ride-with-us/service-alerts'
    );
    expect(sanitizeAlertUrl('http://example.com/alerts?id=1')).toBe('http://example.com/alerts?id=1');
  });

  it('rejects javascript, data, empty, and malformed URLs', () => {
    expect(sanitizeAlertUrl('javascript:alert(1)')).toBeNull();
    expect(sanitizeAlertUrl('data:text/html,<script>alert(1)</script>')).toBeNull();
    expect(sanitizeAlertUrl('')).toBeNull();
    expect(sanitizeAlertUrl('   ')).toBeNull();
    expect(sanitizeAlertUrl(undefined)).toBeNull();
    expect(sanitizeAlertUrl('not a valid url')).toBeNull();
  });
});

describe('transformGtfsAlerts', () => {
  const nowMs = Date.UTC(2026, 10, 15, 20, 0, 0); // 2026-11-15T20:00:00Z
  const nowSec = Math.floor(nowMs / 1000);

  it('filters to Link Light Rail routes and maps route IDs cleanly', () => {
    const raw: RawGtfsAlertsFeed = {
      header: { timestamp: nowSec },
      entity: [
        {
          id: 'link-both',
          alert: {
            severity_level: 'SEVERE',
            effect: 'REDUCED_SERVICE',
            cause: 'MAINTENANCE',
            active_period: [{ start: nowSec - 600 }],
            informed_entity: [
              { route_id: '2LINE' },
              { route_id: '100479' },
              { route_id: '1-SHUTTLE' },
              { route_id: '2-SHUTTLE' },
              { route_id: 'SNDR_TL' },
            ],
            header_text: {
              translation: [
                { language: 'es', text: 'Servicio reducido' },
                { language: 'en', text: '1 Line & 2 Line reduced service\r\n' },
              ],
            },
            description_text: {
              translation: [{ language: 'en', text: 'Trains running every 20 minutes.\r\n\r\nShuttle active.' }],
            },
            url: {
              translation: [{ language: 'en', text: 'https://www.soundtransit.org/alerts/link-both' }],
            },
          },
        },
        {
          id: 'sounder-only',
          alert: {
            severity_level: 'WARNING',
            effect: 'DETOUR',
            cause: 'OTHER_CAUSE',
            active_period: [{ start: nowSec - 600 }],
            informed_entity: [{ route_id: 'SNDR_TL' }],
            header_text: { translation: [{ language: 'en', text: 'Sounder alert' }] },
          },
        },
        {
          id: 'bus-only',
          alert: {
            severity_level: 'INFO',
            active_period: [{ start: nowSec - 600 }],
            informed_entity: [{ route_id: '590' }],
            header_text: { translation: [{ language: 'en', text: 'Bus 590 reroute' }] },
          },
        },
      ],
    };

    const alerts = transformGtfsAlerts(raw, nowMs);
    expect(alerts).toHaveLength(1);
    expect(alerts[0]).toEqual({
      id: 'link-both',
      severity: 'SEVERE',
      effect: 'REDUCED_SERVICE',
      cause: 'MAINTENANCE',
      lines: ['line-1', 'line-2'],
      header: '1 Line & 2 Line reduced service',
      description: 'Trains running every 20 minutes.\n\nShuttle active.',
      url: 'https://www.soundtransit.org/alerts/link-both',
      activeStartMs: (nowSec - 600) * 1000,
      activeEndMs: null,
    });
  });

  it('filters active_period intervals in Unix seconds against nowEpochMs', () => {
    const raw: RawGtfsAlertsFeed = {
      entity: [
        {
          id: 'expired',
          alert: {
            severity_level: 'WARNING',
            active_period: [{ start: nowSec - 3600, end: nowSec - 60 }],
            informed_entity: [{ route_id: '100479' }],
            header_text: { translation: [{ language: 'en', text: 'Expired alert' }] },
          },
        },
        {
          id: 'future',
          alert: {
            severity_level: 'WARNING',
            active_period: [{ start: nowSec + 300, end: nowSec + 3600 }],
            informed_entity: [{ route_id: '100479' }],
            header_text: { translation: [{ language: 'en', text: 'Future alert' }] },
          },
        },
        {
          id: 'open-ended',
          alert: {
            severity_level: 'INFO',
            active_period: [{ start: nowSec - 120 }],
            informed_entity: [{ route_id: '2LINE' }],
            header_text: { translation: [{ language: 'en', text: 'Open ended alert' }] },
          },
        },
        {
          id: 'multi-period-second-active',
          alert: {
            severity_level: 'INFO',
            active_period: [
              { start: nowSec - 7200, end: nowSec - 3600 },
              { start: nowSec - 300, end: nowSec + 300 },
            ],
            informed_entity: [{ route_id: '1-SHUTTLE' }],
            header_text: { translation: [{ language: 'en', text: 'Second period active' }] },
          },
        },
      ],
    };

    const alerts = transformGtfsAlerts(raw, nowMs);
    expect(alerts.map((a) => a.id)).toEqual(['open-ended', 'multi-period-second-active']);
    expect(alerts[0].activeStartMs).toBe((nowSec - 120) * 1000);
    expect(alerts[0].activeEndMs).toBeNull();
    expect(alerts[1].activeStartMs).toBe((nowSec - 300) * 1000);
    expect(alerts[1].activeEndMs).toBe((nowSec + 300) * 1000);
  });

  it('sorts by severity (SEVERE > WARNING > INFO) then newest activeStartMs descending', () => {
    const raw: RawGtfsAlertsFeed = {
      entity: [
        {
          id: 'info-new',
          alert: {
            severity_level: 'INFO',
            active_period: [{ start: nowSec - 10 }],
            informed_entity: [{ route_id: '100479' }],
            header_text: { translation: [{ language: 'en', text: 'Info new' }] },
          },
        },
        {
          id: 'warning-old',
          alert: {
            severity_level: 'WARNING',
            active_period: [{ start: nowSec - 500 }],
            informed_entity: [{ route_id: '100479' }],
            header_text: { translation: [{ language: 'en', text: 'Warning old' }] },
          },
        },
        {
          id: 'severe-only',
          alert: {
            severity_level: 'SEVERE',
            active_period: [{ start: nowSec - 1000 }],
            informed_entity: [{ route_id: '2LINE' }],
            header_text: { translation: [{ language: 'en', text: 'Severe alert' }] },
          },
        },
        {
          id: 'warning-new',
          alert: {
            severity_level: 'WARNING',
            active_period: [{ start: nowSec - 50 }],
            informed_entity: [{ route_id: '100479' }],
            header_text: { translation: [{ language: 'en', text: 'Warning new' }] },
          },
        },
      ],
    };

    const alerts = transformGtfsAlerts(raw, nowMs);
    expect(alerts.map((a) => a.id)).toEqual([
      'severe-only',
      'warning-new',
      'warning-old',
      'info-new',
    ]);
  });

  it('sanitizes unsafe alert URLs to null and normalizes unknown severity to INFO', () => {
    const raw: RawGtfsAlertsFeed = {
      entity: [
        {
          id: 'unsafe-url',
          alert: {
            severity_level: 'UNKNOWN_SEVERITY',
            active_period: [{ start: nowSec - 10 }],
            informed_entity: [{ route_id: '2-SHUTTLE' }],
            header_text: { translation: [{ text: 'Fallback non-en text' }] },
            url: { translation: [{ language: 'en', text: 'javascript:alert(1)' }] },
          },
        },
      ],
    };

    const alerts = transformGtfsAlerts(raw, nowMs);
    expect(alerts[0].severity).toBe('INFO');
    expect(alerts[0].header).toBe('Fallback non-en text');
    expect(alerts[0].lines).toEqual(['line-2']);
    expect(alerts[0].url).toBeNull();
  });
});

describe('fetchServiceAlerts', () => {
  beforeEach(() => {
    clearAlertsCache();
    vi.useFakeTimers();
    vi.setSystemTime(new Date(Date.UTC(2026, 10, 15, 20, 0, 0)));
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('fetches ST_ALERTS_FEED_URL, caches for 25s, and supports bypassCache', async () => {
    const nowSec = Math.floor(Date.now() / 1000);
    const payload: RawGtfsAlertsFeed = {
      header: { timestamp: nowSec },
      entity: [
        {
          id: 'a1',
          alert: {
            severity_level: 'WARNING',
            active_period: [{ start: nowSec - 60 }],
            informed_entity: [{ route_id: '100479' }],
            header_text: { translation: [{ language: 'en', text: '1 Line delay' }] },
          },
        },
      ],
    };

    const fetchMock = vi.fn().mockImplementation(async () => ({
      ok: true,
      status: 200,
      json: async () => payload,
    }));
    vi.stubGlobal('fetch', fetchMock);

    const first = await fetchServiceAlerts();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]?.[0]).toBe(ST_ALERTS_FEED_URL);
    expect(first.alerts).toHaveLength(1);
    expect(first.updatedAt).toBe(nowSec * 1000);

    // Within 25s TTL: cached
    vi.advanceTimersByTime(10_000);
    const second = await fetchServiceAlerts();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(second.alerts).toHaveLength(1);

    // bypassCache forces network fetch
    const third = await fetchServiceAlerts(true);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(third.alerts).toHaveLength(1);

    // After 25s TTL: expired cache fetches again
    vi.advanceTimersByTime(26_000);
    await fetchServiceAlerts();
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('deduplicates concurrent in-flight requests and handles partial aborts safely', async () => {
    const nowSec = Math.floor(Date.now() / 1000);
    let resolveFetch!: () => void;
    const fetchGate = new Promise<void>((resolve) => {
      resolveFetch = resolve;
    });

    const fetchMock = vi.fn().mockImplementation((_url: string, init?: RequestInit) => {
      return fetchGate.then(() => {
        if (init?.signal?.aborted) {
          throw new DOMException('Aborted', 'AbortError');
        }
        return {
          ok: true,
          status: 200,
          json: async () => ({
            header: { timestamp: nowSec },
            entity: [],
          }),
        };
      });
    });
    vi.stubGlobal('fetch', fetchMock);

    const ac1 = new AbortController();
    const ac2 = new AbortController();

    const p1 = fetchServiceAlerts(false, ac1.signal);
    const p2 = fetchServiceAlerts(false, ac2.signal);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    ac1.abort();
    await expect(p1).rejects.toMatchObject({ name: 'AbortError' });

    resolveFetch();
    const feed2 = await p2;
    expect(feed2.alerts).toEqual([]);
  });

  it('rejects cleanly on HTTP error without caching the failure', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: false, status: 503, statusText: 'Service Unavailable' })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ header: { timestamp: Math.floor(Date.now() / 1000) }, entity: [] }),
      });
    vi.stubGlobal('fetch', fetchMock);

    await expect(fetchServiceAlerts()).rejects.toThrow(/503/);
    const recovered = await fetchServiceAlerts();
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(recovered.alerts).toEqual([]);
  });

  it('rejects with a non-AbortError timeout error after 6000ms without caching', async () => {
    const fetchMock = vi.fn().mockImplementation(
      (_url: string, init?: RequestInit) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => {
            reject(new DOMException('Aborted', 'AbortError'));
          });
        })
    );
    vi.stubGlobal('fetch', fetchMock);

    const promise = fetchServiceAlerts();
    const assertion = promise.catch((err) => err);
    await vi.advanceTimersByTimeAsync(6000);

    const err = await assertion;
    expect(err).toBeInstanceOf(Error);
    expect(err.name).not.toBe('AbortError');
    expect(err.message).toMatch(/timed out/i);
  });
});
