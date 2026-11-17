import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { AlertsViewComponent } from '../src/components/AlertsView';
import { ST_ALERTS_FEED_URL, ST_ALERTS_WEB_URL, clearAlertsCache } from '../src/services/alerts-api';
import { clearArrivalsCache } from '../src/services/oba-api';
import { clearStorageCache } from '../src/services/storage';
import type { ServiceAlert } from '../src/types/transit';

function makeAlert(overrides: Partial<ServiceAlert> = {}): ServiceAlert {
  return {
    id: 'alert-1',
    severity: 'WARNING',
    effect: 'SIGNIFICANT_DELAYS',
    cause: 'MAINTENANCE',
    lines: ['line-1'],
    header: '1 Line experiencing 15-minute delays',
    description: 'Single-tracking near SODO station.\n\nAllow extra travel time.',
    url: 'https://www.soundtransit.org/alerts/1',
    activeStartMs: Date.UTC(2026, 10, 15, 19, 0, 0),
    activeEndMs: null,
    ...overrides,
  };
}

describe('AlertsViewComponent', () => {
  it('renders a loading skeleton when isLoading is true and updatedAt is null', () => {
    const view = new AlertsViewComponent({
      onBackToStations: vi.fn(),
      onRetry: vi.fn(),
    });

    view.update({
      alerts: [],
      activeLine: 'line-1',
      updatedAt: null,
      isLoading: true,
      error: null,
      timeFormat24Hour: false,
    });

    const el = view.getElement();
    expect(el.querySelector('.alerts-loading-skeleton')).not.toBeNull();
    expect(el.querySelector('.alerts-empty-card')).toBeNull();
    expect(el.querySelector('.alerts-error-card')).toBeNull();
  });

  it('renders the good-service empty card with official Sound Transit link and Back to Stations action', () => {
    const onBackToStations = vi.fn();
    const view = new AlertsViewComponent({
      onBackToStations,
      onRetry: vi.fn(),
    });

    const updatedAt = Date.UTC(2026, 10, 15, 20, 15, 0);
    view.update({
      alerts: [],
      activeLine: 'line-1',
      updatedAt,
      isLoading: false,
      error: null,
      timeFormat24Hour: false,
    });

    const el = view.getElement();
    const emptyCard = el.querySelector('.alerts-empty-card');
    expect(emptyCard).not.toBeNull();
    expect(el.textContent).toContain('No active Link service alerts');

    const officialLink = el.querySelector<HTMLAnchorElement>(`a[href="${ST_ALERTS_WEB_URL}"]`);
    expect(officialLink).not.toBeNull();
    expect(officialLink?.target).toBe('_blank');
    expect(officialLink?.rel).toContain('noopener');

    const backBtn = el.querySelector<HTMLButtonElement>('.alerts-back-btn');
    expect(backBtn).not.toBeNull();
    backBtn?.click();
    expect(onBackToStations).toHaveBeenCalledTimes(1);
  });

  it('renders an error card with Retry action and Sound Transit link when error is set without cached data', () => {
    const onRetry = vi.fn();
    const view = new AlertsViewComponent({
      onBackToStations: vi.fn(),
      onRetry,
    });

    view.update({
      alerts: [],
      activeLine: 'line-2',
      updatedAt: null,
      isLoading: false,
      error: 'Unable to load alerts right now.',
      timeFormat24Hour: false,
    });

    const el = view.getElement();
    const errorCard = el.querySelector('.alerts-error-card');
    expect(errorCard).not.toBeNull();
    expect(errorCard?.getAttribute('role')).toBe('alert');
    expect(el.textContent).toContain('Unable to load alerts right now.');

    const retryBtn = el.querySelector<HTMLButtonElement>('.alerts-retry-btn');
    expect(retryBtn).not.toBeNull();
    retryBtn?.click();
    expect(onRetry).toHaveBeenCalledTimes(1);

    const officialLink = el.querySelector<HTMLAnchorElement>(`a[href="${ST_ALERTS_WEB_URL}"]`);
    expect(officialLink).not.toBeNull();
  });

  it('orders alerts by severity and activeLine, escapes HTML payloads, splits paragraphs, and renders optional safe links', () => {
    const view = new AlertsViewComponent({
      onBackToStations: vi.fn(),
      onRetry: vi.fn(),
    });

    const xssAlert = makeAlert({
      id: 'warn-line2-matching',
      severity: 'WARNING',
      lines: ['line-2'],
      header: '<script>window.__xss = true</script> 2 Line delay',
      description: '<b>First paragraph</b>.\n\n<img src=x onerror=alert(1)> Second paragraph.',
      url: null,
    });
    const warningLine1 = makeAlert({
      id: 'warn-line1-other',
      severity: 'WARNING',
      lines: ['line-1'],
      header: '1 Line elevator outage',
      description: 'Use north stairs.',
      url: 'https://www.soundtransit.org/alerts/elevator',
    });
    const severeAlert = makeAlert({
      id: 'severe-line1',
      severity: 'SEVERE',
      lines: ['line-1', 'line-2'],
      header: 'Major disruption',
      description: 'Shuttle buses operating.',
      url: 'https://www.soundtransit.org/alerts/major',
    });

    view.update({
      alerts: [warningLine1, xssAlert, severeAlert],
      activeLine: 'line-2',
      updatedAt: Date.UTC(2026, 10, 15, 20, 30, 0),
      isLoading: false,
      error: null,
      timeFormat24Hour: false,
    });

    const el = view.getElement();
    const cards = Array.from(el.querySelectorAll<HTMLElement>('.alert-card'));
    expect(cards.map((c) => c.dataset.alertId)).toEqual([
      'severe-line1',
      'warn-line2-matching',
      'warn-line1-other',
    ]);

    expect(cards[0].classList.contains('severity-severe')).toBe(true);
    expect(cards[1].classList.contains('severity-warning')).toBe(true);

    // XSS payload must be escaped as literal text, never parsed as HTML elements
    expect(cards[1].querySelector('script')).toBeNull();
    expect(cards[1].querySelector('b')).toBeNull();
    expect(cards[1].querySelector('img')).toBeNull();
    expect(cards[1].textContent).toContain('<script>window.__xss = true</script> 2 Line delay');

    const paragraphs = cards[1].querySelectorAll('.alert-card-description p');
    expect(paragraphs).toHaveLength(2);
    expect(paragraphs[0].textContent).toBe('<b>First paragraph</b>.');
    expect(paragraphs[1].textContent).toBe('<img src=x onerror=alert(1)> Second paragraph.');

    // Line badges on severe alert
    const lineBadges = Array.from(cards[0].querySelectorAll('.alert-line-badge')).map((b) =>
      b.textContent?.trim()
    );
    expect(lineBadges).toEqual(['1 Line', '2 Line']);

    // Link present only when alert.url is non-null
    expect(cards[1].querySelector('.alert-card-link')).toBeNull();
    const externalLink = cards[0].querySelector<HTMLAnchorElement>('.alert-card-link');
    expect(externalLink).not.toBeNull();
    expect(externalLink?.href).toBe('https://www.soundtransit.org/alerts/major');
    expect(externalLink?.target).toBe('_blank');
    expect(externalLink?.rel).toBe('noopener noreferrer');
  });

  it('filters noisy OTHER_EFFECT tags, maps ACCESSIBILITY_ISSUE, deduplicates identical descriptions, and includes dates on multi-day windows', () => {
    const refNow = Date.UTC(2026, 10, 17, 17, 0, 0);
    const view = new AlertsViewComponent({
      onBackToStations: vi.fn(),
      onRetry: vi.fn(),
    });

    view.update({
      alerts: [
        makeAlert({
          id: 'garage-long',
          effect: 'OTHER_EFFECT',
          lines: ['line-1'],
          header: 'Northgate Parking Garage reduced capacity',
          description: 'Northgate Parking Garage reduced capacity',
          activeStartMs: Date.UTC(2026, 10, 3, 13, 0, 0),
          activeEndMs: Date.UTC(2027, 0, 30, 0, 0, 0),
        }),
        makeAlert({
          id: 'elevator-long',
          effect: 'ACCESSIBILITY_ISSUE',
          lines: ['line-1', 'line-2'],
          header: 'UW Station Elevator 2 unavailable',
          description: 'Block one.\n\nBlock two.\n\nBlock three extra step.\n\nBlock four extra step.',
          activeStartMs: refNow - 60 * 60 * 1000,
          activeEndMs: null,
        }),
      ],
      activeLine: 'line-1',
      updatedAt: refNow,
      isLoading: false,
      error: null,
      timeFormat24Hour: false,
      nowEpochMs: refNow,
    });

    const el = view.getElement();
    const cards = el.querySelectorAll<HTMLElement>('.alert-card');
    expect(cards).toHaveLength(2);

    const garageCard = el.querySelector<HTMLElement>('[data-alert-id="garage-long"]')!;
    const elevatorCard = el.querySelector<HTMLElement>('[data-alert-id="elevator-long"]')!;

    // OTHER_EFFECT is suppressed; identical header/description is not duplicated
    expect(garageCard.textContent).not.toContain('Other Effect');
    expect(garageCard.querySelector('.alert-card-description')).toBeNull();
    expect(garageCard.querySelector('.alert-card-window')?.textContent).toMatch(/Nov 3.*Jan 29, 2027/);

    // ACCESSIBILITY_ISSUE maps to Elevator / Access; >2 blocks collapse into native <details>
    expect(elevatorCard.querySelector('.alert-effect-tag')?.textContent).toBe('Elevator / Access');
    const inlineParas = elevatorCard.querySelectorAll('.alert-card-description > p');
    expect(inlineParas).toHaveLength(2);
    const moreDetails = elevatorCard.querySelector('details.alert-more-details');
    expect(moreDetails).not.toBeNull();
    expect(moreDetails?.querySelectorAll('p')).toHaveLength(2);
  });

  it('omits secondary filter and header bar while still prioritizing activeLine and linking to soundtransit.org in footer', () => {
    const view = new AlertsViewComponent({
      onBackToStations: vi.fn(),
      onRetry: vi.fn(),
    });

    view.update({
      alerts: [
        makeAlert({ id: 'a-line1', lines: ['line-1'], header: '1 Line advisory' }),
        makeAlert({ id: 'a-line2', lines: ['line-2'], header: '2 Line advisory' }),
      ],
      activeLine: 'line-2',
      updatedAt: Date.UTC(2026, 10, 17, 17, 0, 0),
      isLoading: false,
      error: null,
      timeFormat24Hour: false,
    });

    const el = view.getElement();
    expect(el.querySelector('.alerts-view-header')).toBeNull();
    expect(el.querySelector('.alerts-filter-group')).toBeNull();
    expect(el.querySelector('.alerts-refresh-btn')).toBeNull();

    const cards = Array.from(el.querySelectorAll<HTMLElement>('.alert-card'));
    expect(cards.map((c) => c.dataset.alertId)).toEqual(['a-line2', 'a-line1']);
    expect(el.querySelector<HTMLAnchorElement>('.alerts-footer-link')?.href).toBe(
      ST_ALERTS_WEB_URL
    );
  });
});

describe('TransitTrackerApp Service Alerts Integration', () => {
  beforeEach(() => {
    document.body.innerHTML = '<div id="app"></div>';
    localStorage.clear();
    localStorage.setItem('seattle_transit_pinned_stations', JSON.stringify(['westlake']));
    clearStorageCache();
    clearArrivalsCache();
    clearAlertsCache();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  function mockNetwork(options: {
    alertsEntities?: unknown[];
    alertsFail?: boolean;
  }) {
    const nowSec = Math.floor(Date.now() / 1000);
    const fetchMock = vi.fn(async (url: string) => {
      if (String(url) === ST_ALERTS_FEED_URL) {
        if (options.alertsFail) {
          return { ok: false, status: 503, statusText: 'Service Unavailable' };
        }
        return {
          ok: true,
          status: 200,
          json: async () => ({
            header: { timestamp: nowSec },
            entity: options.alertsEntities ?? [],
          }),
        };
      }

      return {
        ok: true,
        status: 200,
        json: async () => ({
          code: 200,
          data: {
            entry: {
              stopId: '40_1121',
              arrivalsAndDepartures: [
                {
                  tripId: 'T1',
                  routeId: '40_100479',
                  routeShortName: '1 Line',
                  tripHeadsign: 'Lynnwood City Center',
                  scheduledDepartureTime: Date.now() + 5 * 60 * 1000,
                  predictedDepartureTime: Date.now() + 5 * 60 * 1000,
                  predicted: true,
                },
              ],
            },
          },
        }),
      };
    });

    vi.stubGlobal('fetch', fetchMock);
    return fetchMock;
  }

  it('keeps Alerts tab quiet and disruption banner hidden when 0 alerts exist, and opens empty state on click', async () => {
    mockNetwork({ alertsEntities: [] });

    const { TransitTrackerApp } = await import('../src/main');
    const app = new TransitTrackerApp();
    await new Promise((r) => setTimeout(r, 25));

    const alertsTabBtn = document.querySelector<HTMLButtonElement>('.alerts-tab-btn');
    expect(alertsTabBtn).not.toBeNull();
    expect(alertsTabBtn?.classList.contains('has-warning')).toBe(false);
    expect(alertsTabBtn?.classList.contains('has-severe')).toBe(false);
    expect(alertsTabBtn?.querySelector('.alert-count-badge')).toBeNull();
    expect(alertsTabBtn?.getAttribute('aria-label')).toBe('Alerts');

    const banner = document.querySelector<HTMLElement>('.disruption-banner');
    expect(banner?.classList.contains('hidden')).toBe(true);

    alertsTabBtn?.click();
    const stationsGrid = document.querySelector<HTMLElement>('.stations-grid');
    expect(stationsGrid?.classList.contains('hidden')).toBe(true);
    expect(document.querySelector('.alerts-empty-card')?.textContent).toContain(
      'No active Link service alerts'
    );

    const viewButtons = document.querySelectorAll<HTMLButtonElement>('.toolbar-controls .view-mode-btn');
    viewButtons[0]?.click(); // ★ My Stations
    expect(stationsGrid?.classList.contains('hidden')).toBe(false);

    app.destroy();
  });

  it('highlights Alerts tab and displays clickable disruption banner when WARNING and SEVERE alerts are active', async () => {
    const nowSec = Math.floor(Date.now() / 1000);
    mockNetwork({
      alertsEntities: [
        {
          id: 'severe-1',
          alert: {
            severity_level: 'SEVERE',
            active_period: [{ start: nowSec - 120 }],
            informed_entity: [{ route_id: '100479' }],
            header_text: { translation: [{ language: 'en', text: 'Signal issue at SODO' }] },
          },
        },
        {
          id: 'warn-1',
          alert: {
            severity_level: 'WARNING',
            active_period: [{ start: nowSec - 60 }],
            informed_entity: [{ route_id: '2LINE' }],
            header_text: { translation: [{ language: 'en', text: '2 Line escalator maintenance' }] },
          },
        },
      ],
    });

    const { TransitTrackerApp } = await import('../src/main');
    const app = new TransitTrackerApp();
    await new Promise((r) => setTimeout(r, 25));

    const alertsTabBtn = document.querySelector<HTMLButtonElement>('.alerts-tab-btn');
    expect(alertsTabBtn?.classList.contains('has-severe')).toBe(true);
    expect(alertsTabBtn?.classList.contains('has-warning')).toBe(false);
    expect(alertsTabBtn?.querySelector('.alert-count-badge')?.textContent).toBe('2');
    expect(alertsTabBtn?.getAttribute('aria-label')).toBe('Alerts, 2 active');

    const banner = document.querySelector<HTMLButtonElement>('.disruption-banner');
    expect(banner).not.toBeNull();
    expect(banner?.classList.contains('hidden')).toBe(false);
    expect(banner?.classList.contains('severity-severe')).toBe(true);
    expect(banner?.textContent).toContain('Signal issue at SODO');

    banner?.click();
    expect(document.querySelector('.stations-grid')?.classList.contains('hidden')).toBe(true);
    expect(banner?.classList.contains('hidden')).toBe(true);
    expect(document.querySelectorAll('.alert-card')).toHaveLength(2);

    app.destroy();
  });

  it('restores station cards and pauses/resumes 1s ticker cleanly across view and line switches', async () => {
    const setIntervalSpy = vi.spyOn(window, 'setInterval');
    const clearIntervalSpy = vi.spyOn(window, 'clearInterval');

    const nowSec = Math.floor(Date.now() / 1000);
    mockNetwork({
      alertsEntities: [
        {
          id: 'warn-1',
          alert: {
            severity_level: 'WARNING',
            active_period: [{ start: nowSec - 60 }],
            informed_entity: [{ route_id: '100479' }],
            header_text: { translation: [{ language: 'en', text: '1 Line single-tracking' }] },
          },
        },
      ],
    });

    const { TransitTrackerApp } = await import('../src/main');
    const app = new TransitTrackerApp();
    await new Promise((r) => setTimeout(r, 25));

    expect(document.querySelector('#station-westlake')?.textContent).toContain('Lynnwood City Center');
    const initial1sIntervals = setIntervalSpy.mock.calls.filter((c) => c[1] === 1000).length;
    expect(initial1sIntervals).toBeGreaterThanOrEqual(1);

    const alertsTabBtn = document.querySelector<HTMLButtonElement>('.alerts-tab-btn');
    alertsTabBtn?.click();
    expect(clearIntervalSpy).toHaveBeenCalled();

    // Return to My Stations
    const viewButtons = document.querySelectorAll<HTMLButtonElement>('.toolbar-controls .view-mode-btn');
    viewButtons[0]?.click();
    expect(document.querySelector('.stations-grid')?.classList.contains('hidden')).toBe(false);
    expect(document.querySelector('#station-westlake')?.textContent).toContain('Lynnwood City Center');

    // Open Alerts again then switch to Line 2
    alertsTabBtn?.click();
    const line2Btn = document.querySelector<HTMLButtonElement>('[data-line="line-2"]');
    line2Btn?.click();
    expect(document.querySelector('.alerts-tab-btn')?.classList.contains('has-warning')).toBe(true);

    app.destroy();
  });

  it('isolates alerts feed failures from healthy station arrival cards and supports retry in AlertsView', async () => {
    mockNetwork({ alertsFail: true });

    const { TransitTrackerApp } = await import('../src/main');
    const app = new TransitTrackerApp();
    await new Promise((r) => setTimeout(r, 25));

    // OBA arrivals succeeded -> station card shows departures, and main staleBannerEl stays hidden
    expect(document.querySelector('#station-westlake')?.textContent).toContain('Lynnwood City Center');
    expect(document.querySelector('.status-banner')?.classList.contains('hidden')).toBe(true);

    const alertsTabBtn = document.querySelector<HTMLButtonElement>('.alerts-tab-btn');
    alertsTabBtn?.click();
    expect(document.querySelector('.alerts-error-card')).not.toBeNull();
    expect(document.querySelector('.alerts-retry-btn')).not.toBeNull();

    app.destroy();
  });

  it('surfaces an error card when the alerts feed times out rather than showing false good service', async () => {
    vi.useFakeTimers();
    try {
      const fetchMock = vi.fn((url: string, init?: RequestInit) => {
        if (String(url) === ST_ALERTS_FEED_URL) {
          return new Promise((_resolve, reject) => {
            init?.signal?.addEventListener('abort', () => {
              reject(new DOMException('Aborted', 'AbortError'));
            });
          });
        }
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ({
            code: 200,
            data: { entry: { stopId: '40_1121', arrivalsAndDepartures: [] } },
          }),
        });
      });
      vi.stubGlobal('fetch', fetchMock);

      const { TransitTrackerApp } = await import('../src/main');
      const app = new TransitTrackerApp();

      // Advance past alerts 6s request timeout
      await vi.advanceTimersByTimeAsync(6000);

      document.querySelector<HTMLButtonElement>('.alerts-tab-btn')?.click();
      expect(document.querySelector('.alerts-error-card')).not.toBeNull();
      expect(document.querySelector('.alerts-empty-card')).toBeNull();

      app.destroy();
    } finally {
      vi.useRealTimers();
    }
  });

  it('keeps loading skeleton visible when an older in-flight alerts request is superseded', async () => {
    let resolveSecond!: () => void;
    let rejectFirstOnAbort!: (reason?: unknown) => void;
    let alertAttempt = 0;

    const fetchMock = vi.fn((url: string, init?: RequestInit) => {
      if (String(url) === ST_ALERTS_FEED_URL) {
        alertAttempt++;
        if (alertAttempt === 1) {
          // Fails on first try so user gets Retry button
          return Promise.resolve({ ok: false, status: 503, statusText: 'Service Unavailable' });
        }
        if (alertAttempt === 2) {
          return new Promise((_resolve, reject) => {
            rejectFirstOnAbort = reject;
            init?.signal?.addEventListener('abort', () => {
              // Simulate a microtask delay before settling after abort
              queueMicrotask(() => reject(new DOMException('Aborted', 'AbortError')));
            });
          });
        }
        return new Promise((resolve) => {
          resolveSecond = () =>
            resolve({
              ok: true,
              status: 200,
              json: async () => ({
                header: { timestamp: Math.floor(Date.now() / 1000) },
                entity: [],
              }),
            });
        });
      }
      return Promise.resolve({
        ok: true,
        status: 200,
        json: async () => ({
          code: 200,
          data: { entry: { stopId: '40_1121', arrivalsAndDepartures: [] } },
        }),
      });
    });
    vi.stubGlobal('fetch', fetchMock);

    const { TransitTrackerApp } = await import('../src/main');
    const app = new TransitTrackerApp();
    await new Promise((r) => setTimeout(r, 15));

    // Open Alerts view (attempt 1 failed -> shows error card + Retry)
    document.querySelector<HTMLButtonElement>('.alerts-tab-btn')?.click();
    const retryBtn = document.querySelector<HTMLButtonElement>('.alerts-retry-btn');
    expect(retryBtn).not.toBeNull();

    // Start attempt 2 (hangs), wait one tick so attempt 2 is actively waiting, then supersede with attempt 3
    retryBtn?.click();
    expect(document.querySelector('.alerts-loading-skeleton')).not.toBeNull();
    await new Promise((r) => setTimeout(r, 5));

    const triggerRetry = (app as unknown as { fetchAlerts: (b: boolean) => Promise<void> }).fetchAlerts(true);
    // Wait until attempt 2's abort rejection microtask settles while attempt 3 stays pending
    await new Promise((r) => setTimeout(r, 5));

    // Loading skeleton must STILL be visible while attempt 3 is in flight!
    expect(document.querySelector('.alerts-loading-skeleton')).not.toBeNull();
    expect(document.querySelector('.alerts-empty-card')).toBeNull();

    expect(typeof resolveSecond).toBe('function');
    resolveSecond();
    await triggerRetry;
    expect(document.querySelector('.alerts-empty-card')).not.toBeNull();

    void rejectFirstOnAbort;
    app.destroy();
  });

  it('updates top toolbar header cleanly for Alerts view and restores line title on return', async () => {
    mockNetwork({ alertsEntities: [] });

    const { TransitTrackerApp } = await import('../src/main');
    const app = new TransitTrackerApp();
    await new Promise((r) => setTimeout(r, 25));

    const titleEl = document.querySelector('.dashboard-toolbar .section-title');
    expect(titleEl?.textContent).toContain('1 Line Live Departures');

    document.querySelector<HTMLButtonElement>('.alerts-tab-btn')?.click();
    expect(titleEl?.textContent).toContain('Service Alerts');
    expect(titleEl?.textContent).not.toContain('Live Departures');
    // AlertsView should not render a duplicate h2 title under the toolbar header
    expect(document.querySelector('.alerts-view-title')).toBeNull();

    document.querySelectorAll<HTMLButtonElement>('.toolbar-controls .view-mode-btn')[0]?.click();
    expect(titleEl?.textContent).toContain('1 Line Live Departures');

    app.destroy();
  });

  it('prioritizes transit disruptions over facility advisories in the banner and allows dismissing for the session', async () => {
    const nowSec = Math.floor(Date.now() / 1000);
    mockNetwork({
      alertsEntities: [
        {
          id: 'elevator-out',
          alert: {
            severity_level: 'WARNING',
            effect: 'ACCESSIBILITY_ISSUE',
            active_period: [{ start: nowSec - 10 }],
            informed_entity: [{ route_id: '100479' }],
            header_text: { translation: [{ language: 'en', text: 'Westlake Elevator 305 unavailable' }] },
          },
        },
        {
          id: 'delay-1',
          alert: {
            severity_level: 'WARNING',
            effect: 'SIGNIFICANT_DELAYS',
            active_period: [{ start: nowSec - 120 }],
            informed_entity: [{ route_id: '100479' }],
            header_text: { translation: [{ language: 'en', text: '1 Line trains delayed 15 minutes' }] },
          },
        },
      ],
    });

    const { TransitTrackerApp } = await import('../src/main');
    const app = new TransitTrackerApp();
    await new Promise((r) => setTimeout(r, 25));

    const banner = document.querySelector<HTMLElement>('.disruption-banner');
    expect(banner?.classList.contains('hidden')).toBe(false);
    expect(banner?.textContent).toContain('1 Line trains delayed 15 minutes');

    const dismissBtn = document.querySelector<HTMLButtonElement>('.disruption-banner-dismiss');
    expect(dismissBtn).not.toBeNull();
    dismissBtn?.click();

    expect(banner?.classList.contains('hidden')).toBe(true);
    // Alerts tab pill retains its active count badge after banner dismissal
    expect(document.querySelector('.alerts-tab-btn .alert-count-badge')?.textContent).toBe('2');

    app.destroy();
  });

  it('refreshes alerts once automatically when opening the Alerts tab', async () => {
    const fetchMock = mockNetwork({ alertsEntities: [] });

    const { TransitTrackerApp } = await import('../src/main');
    const app = new TransitTrackerApp();
    await new Promise((r) => setTimeout(r, 25));

    const alertsCallsBefore = fetchMock.mock.calls.filter(
      (call) => String(call[0]) === ST_ALERTS_FEED_URL
    ).length;
    expect(alertsCallsBefore).toBe(1);

    document.querySelector<HTMLButtonElement>('.alerts-tab-btn')?.click();
    await new Promise((r) => setTimeout(r, 25));

    const alertsCallsAfter = fetchMock.mock.calls.filter(
      (call) => String(call[0]) === ST_ALERTS_FEED_URL
    ).length;
    expect(alertsCallsAfter).toBe(2);

    app.destroy();
  });
});
