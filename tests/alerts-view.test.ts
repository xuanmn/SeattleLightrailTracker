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
    stationIds: [],
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

    // ACCESSIBILITY_ISSUE maps to Elevator / Access; all blocks render inline without click-to-expand truncation
    expect(elevatorCard.querySelector('.alert-effect-tag')?.textContent).toBe('Elevator / Access');
    const inlineParas = elevatorCard.querySelectorAll('.alert-card-description > p');
    expect(inlineParas).toHaveLength(4);
    expect(elevatorCard.querySelector('details.alert-more-details')).toBeNull();
    expect(elevatorCard.textContent).toContain('Block four extra step.');
  });

  it('preserves prose newlines, parses Sound Transit bullets cleanly without corrupting hyphens, keeps ordered list start numbers, and escapes XSS in lists', () => {
    const view = new AlertsViewComponent({
      onBackToStations: vi.fn(),
      onRetry: vi.fn(),
    });

    view.update({
      alerts: [
        makeAlert({
          id: 'structured-text',
          header: 'Northgate & Elevator updates',
          description: [
            'Line one\nLine two',
            '*On Monday, work pauses.\n- Regular bullet with <script>alert(1)</script>',
            '-- Important note --\n-1 Line shuttle bay B\n**Bold header**\n2026. Year stays prose.',
            '3. Continue to Exit C2.\n5. Take elevator up.',
          ].join('\n\n'),
          effect: 'NO_EFFECT',
        }),
      ],
      activeLine: 'line-1',
      updatedAt: Date.UTC(2026, 10, 17, 17, 0, 0),
      isLoading: false,
      error: null,
      timeFormat24Hour: false,
    });

    const el = view.getElement();
    expect(el.querySelector('.alert-effect-tag')).toBeNull();
    const desc = el.querySelector('.alert-card-description')!;
    expect(desc.querySelector('script')).toBeNull();

    const paras = desc.querySelectorAll('p');
    expect(paras).toHaveLength(2);
    expect(paras[0].textContent).toBe('Line one\nLine two');
    expect(paras[1].textContent).toBe(
      '-- Important note --\n-1 Line shuttle bay B\n**Bold header**\n2026. Year stays prose.'
    );

    const ulItems = desc.querySelectorAll(':scope > ul > li');
    expect(Array.from(ulItems).map((li) => li.textContent)).toEqual([
      'On Monday, work pauses.',
      'Regular bullet with <script>alert(1)</script>',
    ]);

    const ol = desc.querySelector(':scope > ol') as HTMLOListElement;
    expect(ol).not.toBeNull();
    expect(ol.start).toBe(3);
    const olItems = Array.from(ol.querySelectorAll<HTMLLIElement>(':scope > li'));
    expect(olItems.map((li) => li.textContent)).toEqual([
      'Continue to Exit C2.',
      'Take elevator up.',
    ]);
    expect(olItems[1].value).toBe(5);
  });

  it('omits secondary filter and header bar, prioritizes activeLine, and exposes footer Refresh and soundtransit.org link', () => {
    const onRefresh = vi.fn();
    const view = new AlertsViewComponent({
      onBackToStations: vi.fn(),
      onRetry: vi.fn(),
      onRefresh,
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

    const refreshBtn = el.querySelector<HTMLButtonElement>('.alerts-view-footer .alerts-refresh-btn');
    expect(refreshBtn).not.toBeNull();
    expect(refreshBtn?.disabled).toBe(false);
    refreshBtn?.click();
    expect(onRefresh).toHaveBeenCalledTimes(1);

    const cards = Array.from(el.querySelectorAll<HTMLElement>('.alert-card'));
    expect(cards.map((c) => c.dataset.alertId)).toEqual(['a-line2', 'a-line1']);
    expect(el.querySelector<HTMLAnchorElement>('.alerts-footer-link')?.href).toBe(
      ST_ALERTS_WEB_URL
    );
  });

  it('renders affected station pills with pinned highlights, omits row for line-wide alerts, and caps long lists while preserving pinned stops', () => {
    const view = new AlertsViewComponent({
      onBackToStations: vi.fn(),
      onRetry: vi.fn(),
      onRefresh: vi.fn(),
    });

    const baseNow = Date.UTC(2026, 10, 18, 20, 0, 0);
    view.update({
      alerts: [
        makeAlert({
          id: 'station-alert',
          header: 'Nightly single-tracking between Northgate and Capitol Hill',
          stationIds: ['northgate', 'roosevelt', 'u-district', 'university-of-washington', 'capitol-hill'],
        }),
        makeAlert({
          id: 'linewide-alert',
          header: 'Systemwide real-time accuracy notice',
          stationIds: [],
        }),
        makeAlert({
          id: 'many-stations-alert',
          header: 'Corridor maintenance',
          stationIds: [
            'lynnwood-city-center',
            'mountlake-terrace',
            'shoreline-north-185th',
            'shoreline-south-148th',
            'pinehurst',
            'northgate',
            'roosevelt',
            'u-district',
            'westlake',
            'seatac-airport',
          ],
        }),
      ],
      activeLine: 'line-1',
      updatedAt: baseNow,
      isLoading: false,
      error: null,
      timeFormat24Hour: false,
      nowEpochMs: baseNow,
      pinnedStationIds: new Set(['northgate', 'seatac-airport']),
    });

    const el = view.getElement();

    // Multi-station alert renders accessible list semantics and marks pinned station
    const stationCard = el.querySelector<HTMLElement>('[data-alert-id="station-alert"]')!;
    const stationsRow = stationCard.querySelector<HTMLElement>('.alert-card-stations')!;
    const stationsList = stationCard.querySelector<HTMLUListElement>('.alert-station-pills')!;
    const stationsLabel = stationCard.querySelector<HTMLElement>('.alert-stations-label')!;
    expect(stationsRow.getAttribute('aria-label')).toBeNull();
    expect(stationsList.getAttribute('aria-label')).toBe('Affected stations');
    expect(stationsLabel.getAttribute('aria-hidden')).toBe('true');

    const pills = Array.from(stationCard.querySelectorAll<HTMLElement>('.alert-station-pill'));
    expect(pills.map((p) => p.dataset.stationId)).toEqual([
      'northgate',
      'roosevelt',
      'u-district',
      'university-of-washington',
      'capitol-hill',
    ]);
    expect(pills[0].classList.contains('is-pinned')).toBe(true);
    expect(pills[0].textContent).toContain('Northgate');
    expect(pills[1].classList.contains('is-pinned')).toBe(false);

    // Line-wide alert omits affected stations row
    const linewideCard = el.querySelector<HTMLElement>('[data-alert-id="linewide-alert"]')!;
    expect(linewideCard.querySelector('.alert-card-stations')).toBeNull();

    // Overflow (> 8 stations) always preserves pinned stops (including seatac-airport at index 9) and appends +N more with hidden station names in title
    const manyCard = el.querySelector<HTMLElement>('[data-alert-id="many-stations-alert"]')!;
    const manyPills = Array.from(manyCard.querySelectorAll<HTMLElement>('.alert-station-pill'));
    expect(manyPills.some((p) => p.dataset.stationId === 'seatac-airport' && p.classList.contains('is-pinned'))).toBe(true);
    expect(manyPills.some((p) => p.dataset.stationId === 'northgate' && p.classList.contains('is-pinned'))).toBe(true);
    const morePill = manyCard.querySelector<HTMLElement>('.alert-station-pill--more');
    expect(morePill?.textContent).toBe('+2 more');
    expect(morePill?.title).toBe('U District, Westlake');
  });

  it('skips rebuilding DOM nodes on background/manual isLoading toggles while patching Refresh button state, and invalidates on pin/format/midnight changes', () => {
    const view = new AlertsViewComponent({
      onBackToStations: vi.fn(),
      onRetry: vi.fn(),
      onRefresh: vi.fn(),
    });

    const baseNow = Date.UTC(2026, 10, 18, 20, 0, 0);
    const state = {
      alerts: [
        makeAlert({
          id: 'stable-1',
          header: 'Stable advisory',
          stationIds: ['northgate'],
          activeStartMs: baseNow - 3600_000,
        }),
      ],
      activeLine: 'line-1' as const,
      updatedAt: baseNow,
      isLoading: false,
      error: null,
      timeFormat24Hour: false,
      nowEpochMs: baseNow,
      pinnedStationIds: new Set<string>(),
    };

    view.update(state);
    const firstListNode = view.getElement().querySelector('.alerts-list');
    const refreshBtn = view.getElement().querySelector<HTMLButtonElement>('.alerts-refresh-btn');
    expect(firstListNode).not.toBeNull();
    expect(refreshBtn?.disabled).toBe(false);

    // Unchanged state and isLoading toggles preserve alert list DOM while toggling Refresh button state in-place
    view.update({
      ...state,
      isLoading: true,
      alerts: [
        makeAlert({
          id: 'stable-1',
          header: 'Stable advisory',
          stationIds: ['northgate'],
          activeStartMs: baseNow - 3600_000,
        }),
      ],
    });
    expect(view.getElement().querySelector('.alerts-list')).toBe(firstListNode);
    const loadingRefreshBtn = view.getElement().querySelector<HTMLButtonElement>('.alerts-refresh-btn');
    expect(loadingRefreshBtn?.disabled).toBe(true);
    expect(loadingRefreshBtn?.classList.contains('is-loading')).toBe(true);
    expect(loadingRefreshBtn?.getAttribute('aria-busy')).toBe('true');
    expect(loadingRefreshBtn?.textContent).toContain('Refreshing…');

    view.update({
      ...state,
      isLoading: false,
      alerts: [
        makeAlert({
          id: 'stable-1',
          header: 'Stable advisory',
          stationIds: ['northgate'],
          activeStartMs: baseNow - 3600_000,
        }),
      ],
    });
    expect(view.getElement().querySelector('.alerts-list')).toBe(firstListNode);
    const idleRefreshBtn = view.getElement().querySelector<HTMLButtonElement>('.alerts-refresh-btn');
    expect(idleRefreshBtn?.disabled).toBe(false);
    expect(idleRefreshBtn?.getAttribute('aria-busy')).toBe('false');
    expect(idleRefreshBtn?.textContent).toContain('Refresh');

    // Pinning an affected station invalidates and highlights the pill
    view.update({
      ...state,
      pinnedStationIds: new Set(['northgate']),
    });
    const afterPinChange = view.getElement().querySelector('.alerts-list');
    expect(afterPinChange).not.toBe(firstListNode);
    expect(view.getElement().querySelector('.alert-station-pill.is-pinned')?.textContent).toContain('Northgate');

    // Changing 24-hour clock format invalidates and re-renders
    view.update({ ...state, pinnedStationIds: new Set(['northgate']), timeFormat24Hour: true });
    const afterFormatChange = view.getElement().querySelector('.alerts-list');
    expect(afterFormatChange).not.toBe(afterPinChange);

    // Crossing midnight invalidates rendered relative dates and re-renders
    view.update({
      ...state,
      pinnedStationIds: new Set(['northgate']),
      timeFormat24Hour: true,
      nowEpochMs: baseNow + 24 * 60 * 60 * 1000,
    });
    expect(view.getElement().querySelector('.alerts-list')).not.toBe(afterFormatChange);
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
    failNextAlert?: () => boolean;
  }) {
    const nowSec = Math.floor(Date.now() / 1000);
    const fetchMock = vi.fn(async (url: string) => {
      if (String(url) === ST_ALERTS_FEED_URL) {
        if (options.alertsFail || options.failNextAlert?.()) {
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

  it('keeps Alerts tab quiet without a homepage banner when 0 alerts exist, and opens empty state on click', async () => {
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

    expect(document.querySelector('.disruption-banner')).toBeNull();
    expect(document.querySelector('.dashboard-view-stage .stations-grid')).not.toBeNull();
    expect(document.querySelector('.dashboard-view-stage .alerts-view')).not.toBeNull();

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

  it('highlights Alerts tab without rendering a homepage banner when WARNING and SEVERE alerts are active, preserving pill badge DOM on click', async () => {
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
    const badgeBeforeClick = alertsTabBtn?.querySelector('.alert-count-badge');
    expect(badgeBeforeClick?.textContent).toBe('2');
    expect(alertsTabBtn?.getAttribute('aria-label')).toBe('Alerts, 2 active');

    // No disruption banner on the homepage
    expect(document.querySelector('.disruption-banner')).toBeNull();

    alertsTabBtn?.click();
    expect(document.querySelector('.stations-grid')?.classList.contains('hidden')).toBe(true);
    expect(document.querySelectorAll('.alert-card')).toHaveLength(2);
    // Pill child node should be preserved across active toggle so CSS transitions run smoothly
    expect(alertsTabBtn?.querySelector('.alert-count-badge')).toBe(badgeBeforeClick);

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

  it('skips automatic fetch on Alerts tab open before the next :00 sync, supports manual footer Refresh, and refreshes after transition once :00 arrives', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(Date.UTC(2026, 10, 21, 10, 0, 0)));

    let finishTransition!: () => void;
    let currentFinished = Promise.resolve();
    const startViewTransitionSpy = vi.fn((cb: () => void) => {
      cb();
      currentFinished = new Promise<void>((resolve) => {
        finishTransition = resolve;
      });
      return { finished: currentFinished };
    });
    const docWithTransition = document as unknown as {
      startViewTransition?: (cb: () => void) => { finished: Promise<void> };
    };
    const originalStartViewTransition = docWithTransition.startViewTransition;
    docWithTransition.startViewTransition = startViewTransitionSpy;

    let app: InstanceType<(typeof import('../src/main'))['TransitTrackerApp']> | undefined;
    try {
      const fetchMock = mockNetwork({ alertsEntities: [] });
      const { TransitTrackerApp } = await import('../src/main');
      app = new TransitTrackerApp();
      await vi.advanceTimersByTimeAsync(25);

      const countAlertCalls = () =>
        fetchMock.mock.calls.filter((call) => String(call[0]) === ST_ALERTS_FEED_URL).length;

      expect(countAlertCalls()).toBe(1);

      // Opening Alerts before the next :00 boundary should NOT trigger an automatic re-fetch
      document.querySelector<HTMLButtonElement>('.alerts-tab-btn')?.click();
      finishTransition();
      await vi.advanceTimersByTimeAsync(25);
      expect(countAlertCalls()).toBe(1);

      // Manual footer Refresh button triggers an immediate fresh fetch
      const refreshBtn = document.querySelector<HTMLButtonElement>('.alerts-refresh-btn');
      expect(refreshBtn).not.toBeNull();
      refreshBtn?.click();
      await vi.advanceTimersByTimeAsync(25);
      expect(countAlertCalls()).toBe(2);

      // Return to My Stations through 10:59:00 -> NO background alerts poll yet
      document.querySelectorAll<HTMLButtonElement>('.toolbar-controls .view-mode-btn')[0]?.click();
      finishTransition();
      await vi.advanceTimersByTimeAsync(59 * 60 * 1000);
      expect(countAlertCalls()).toBe(2);

      // Cross the 11:00:00 top-of-hour sync boundary -> hourly background alerts poll fires once
      await vi.advanceTimersByTimeAsync(2 * 60 * 1000);
      expect(countAlertCalls()).toBe(3);

      // Jump clock forward past 12:00:00 (simulating resumed session), then open Alerts -> waits for transition.finished
      const nowBeforePause = Date.now();
      vi.setSystemTime(nowBeforePause + 60 * 60 * 1000);
      document.querySelector<HTMLButtonElement>('.alerts-tab-btn')?.click();
      await vi.advanceTimersByTimeAsync(10);
      expect(countAlertCalls()).toBe(3);

      finishTransition();
      await vi.advanceTimersByTimeAsync(25);
      expect(countAlertCalls()).toBe(4);
    } finally {
      app?.destroy();
      vi.useRealTimers();
      if (originalStartViewTransition === undefined) {
        delete docWithTransition.startViewTransition;
      } else {
        docWithTransition.startViewTransition = originalStartViewTransition;
      }
    }
  });

  it('syncs hourly alerts polling to :00 boundaries without multi-hour drift, handles reconnect/error recovery near :00, and skips the upcoming hour within 15 minutes', async () => {
    vi.useFakeTimers();
    // Start off-the-hour at 10:25:37.200 UTC
    vi.setSystemTime(new Date(Date.UTC(2026, 10, 21, 10, 25, 37, 200)));

    let app: InstanceType<(typeof import('../src/main'))['TransitTrackerApp']> | undefined;
    let shouldFailAlert = false;
    try {
      const fetchMock = mockNetwork({
        alertsEntities: [],
        failNextAlert: () => {
          if (!shouldFailAlert) return false;
          shouldFailAlert = false;
          return true;
        },
      });
      const { TransitTrackerApp } = await import('../src/main');
      app = new TransitTrackerApp();
      await vi.advanceTimersByTimeAsync(25);

      const countAlertCalls = () =>
        fetchMock.mock.calls.filter((call) => String(call[0]) === ST_ALERTS_FEED_URL).length;

      // Call 1 at startup (10:25:37) -> gap to 11:00 is ~34m (>= 15m), so next sync is 11:00
      expect(countAlertCalls()).toBe(1);

      // Advance 34m -> 10:59:37: still before 11:00:00
      await vi.advanceTimersByTimeAsync(34 * 60 * 1000);
      expect(countAlertCalls()).toBe(1);

      // Advance 1m -> 11:00:37: syncs on 11:00 hour boundary (Call 2)
      await vi.advanceTimersByTimeAsync(60 * 1000);
      expect(countAlertCalls()).toBe(2);

      // Verify zero multi-hour drift: 11:59:37 still quiet, 12:00:37 fires right on 12:00 (Call 3)
      await vi.advanceTimersByTimeAsync(59 * 60 * 1000);
      expect(countAlertCalls()).toBe(2);
      await vi.advanceTimersByTimeAsync(60 * 1000);
      expect(countAlertCalls()).toBe(3);

      // Advance to 12:46:37 (within 15m of 13:00) and click manual Refresh (Call 4)
      await vi.advanceTimersByTimeAsync(46 * 60 * 1000);
      document.querySelector<HTMLButtonElement>('.alerts-tab-btn')?.click();
      document.querySelector<HTMLButtonElement>('.alerts-refresh-btn')?.click();
      await vi.advanceTimersByTimeAsync(25);
      expect(countAlertCalls()).toBe(4);

      // Return to My Stations and cross 13:00:37 -> SKIPPED because 12:46:37 is within 15m of 13:00
      document.querySelectorAll<HTMLButtonElement>('.toolbar-controls .view-mode-btn')[0]?.click();
      await vi.advanceTimersByTimeAsync(14 * 60 * 1000); // 13:00:37
      expect(countAlertCalls()).toBe(4);

      // Stays synced through 13:59:37, then fires right on 14:00:37 (Call 5)
      await vi.advanceTimersByTimeAsync(59 * 60 * 1000);
      expect(countAlertCalls()).toBe(4);
      await vi.advanceTimersByTimeAsync(60 * 1000);
      expect(countAlertCalls()).toBe(5);

      // Online reconnect at 14:50:37 fetches immediately (Call 6) AND skips 15:00:37 until 16:00:37
      await vi.advanceTimersByTimeAsync(50 * 60 * 1000); // 14:50:37
      window.dispatchEvent(new Event('offline'));
      window.dispatchEvent(new Event('online'));
      await vi.advanceTimersByTimeAsync(25);
      expect(countAlertCalls()).toBe(6);

      await vi.advanceTimersByTimeAsync(10 * 60 * 1000); // 15:00:37 -> skipped
      expect(countAlertCalls()).toBe(6);

      // Visibility sleep/wake resume across an active 15:55:37 failure (5m before 16:00)
      await vi.advanceTimersByTimeAsync(55 * 60 * 1000); // 15:55:37
      shouldFailAlert = true;
      window.dispatchEvent(new Event('offline'));
      window.dispatchEvent(new Event('online'));
      await vi.advanceTimersByTimeAsync(25);
      expect(countAlertCalls()).toBe(7);

      // 5 minutes later at 16:00:37, error retry MUST fire (NOT skipped by 15m window), recovering to Call 8!
      await vi.advanceTimersByTimeAsync(5 * 60 * 1000);
      expect(countAlertCalls()).toBe(8);

      // Sleep across 17:00 and wake on visibility resume at 17:47:00 -> fetches immediately (Call 9) and skips 18:00
      Object.defineProperty(document, 'hidden', { configurable: true, value: true });
      document.dispatchEvent(new Event('visibilitychange'));
      vi.setSystemTime(Date.UTC(2026, 10, 21, 17, 47, 0));
      Object.defineProperty(document, 'hidden', { configurable: true, value: false });
      document.dispatchEvent(new Event('visibilitychange'));
      await vi.advanceTimersByTimeAsync(25);
      expect(countAlertCalls()).toBe(9);

      // Crossing 18:00:00 skips because resume fetch occurred at 17:47:00 (within 15m of 18:00), then fires at 19:00:00 (Call 10)
      await vi.advanceTimersByTimeAsync(13 * 60 * 1000); // 18:00:00
      expect(countAlertCalls()).toBe(9);
      await vi.advanceTimersByTimeAsync(60 * 60 * 1000); // 19:00:00
      expect(countAlertCalls()).toBe(10);
    } finally {
      Object.defineProperty(document, 'hidden', { configurable: true, value: false });
      app?.destroy();
      vi.useRealTimers();
    }
  });

  it('does not trigger alerts refresh mid-transition when a stale Alerts transition is superseded by a line switch', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(Date.UTC(2026, 10, 21, 10, 0, 0)));

    const pendingTransitions: { resolve: () => void; reject: (err: unknown) => void }[] = [];
    const startViewTransitionSpy = vi.fn((cb: () => void) => {
      cb();
      let resolve!: () => void;
      let reject!: (err: unknown) => void;
      const finished = new Promise<void>((res, rej) => {
        resolve = res;
        reject = rej;
      });
      pendingTransitions.push({ resolve, reject });
      return { finished };
    });

    const docWithTransition = document as unknown as {
      startViewTransition?: (cb: () => void) => { finished: Promise<void> };
    };
    const originalStartViewTransition = docWithTransition.startViewTransition;
    docWithTransition.startViewTransition = startViewTransitionSpy;

    try {
      const fetchMock = mockNetwork({ alertsEntities: [] });
      const { TransitTrackerApp } = await import('../src/main');
      const app = new TransitTrackerApp();
      await vi.advanceTimersByTimeAsync(25);

      const countAlertCalls = () =>
        fetchMock.mock.calls.filter((call) => String(call[0]) === ST_ALERTS_FEED_URL).length;

      expect(countAlertCalls()).toBe(1);

      // Jump clock forward by 1 hour so opening Alerts would normally refresh on finish
      vi.setSystemTime(Date.now() + 60 * 60 * 1000);

      // Click Alerts (transition #1 starts), then immediately switch to Line 2 (transition #2 supersedes #1)
      document.querySelector<HTMLButtonElement>('.alerts-tab-btn')?.click();
      document.querySelectorAll<HTMLButtonElement>('.app-header .line-btn')[1]?.click();
      expect(pendingTransitions).toHaveLength(2);

      // Browser skips/aborts transition #1 while transition #2 is still animating
      pendingTransitions[0].reject(new DOMException('Transition skipped', 'AbortError'));
      await vi.advanceTimersByTimeAsync(15);

      // Superseded transition #1 MUST NOT fire fetchAlerts while transition #2 is still running
      expect(countAlertCalls()).toBe(1);

      pendingTransitions[1].resolve();
      await vi.advanceTimersByTimeAsync(15);

      app.destroy();
    } finally {
      vi.useRealTimers();
      if (originalStartViewTransition === undefined) {
        delete docWithTransition.startViewTransition;
      } else {
        docWithTransition.startViewTransition = originalStartViewTransition;
      }
    }
  });

  it('displays live affected station pills in the Alerts tab and highlights user pinned stations', async () => {
    const nowSec = Math.floor(Date.now() / 1000);
    mockNetwork({
      alertsEntities: [
        {
          id: 'westlake-stop-alert',
          alert: {
            severity_level: 'WARNING',
            effect: 'ACCESSIBILITY_ISSUE',
            active_period: [{ start: nowSec - 60 }],
            informed_entity: [
              { route_id: '100479', stop_id: '1121' }, // Westlake (pinned in beforeEach)
              { route_id: '100479', stop_id: '99603' }, // Capitol Hill (not pinned)
            ],
            header_text: {
              translation: [{ language: 'en', text: 'Elevator maintenance at downtown stations' }],
            },
          },
        },
      ],
    });

    const { TransitTrackerApp } = await import('../src/main');
    const app = new TransitTrackerApp();
    await new Promise((r) => setTimeout(r, 25));

    document.querySelector<HTMLButtonElement>('.alerts-tab-btn')?.click();

    const pills = Array.from(document.querySelectorAll<HTMLElement>('.alert-station-pill'));
    expect(pills.map((p) => p.dataset.stationId)).toEqual(['capitol-hill', 'westlake']);
    expect(pills[0].classList.contains('is-pinned')).toBe(false);
    expect(pills[1].classList.contains('is-pinned')).toBe(true);
    expect(pills[1].textContent).toContain('Westlake');

    // Return to My Stations, unpin Westlake via card star button, then reopen Alerts -> highlight updates live
    document.querySelectorAll<HTMLButtonElement>('.toolbar-controls .view-mode-btn')[0]?.click();
    document.querySelector<HTMLButtonElement>('#station-westlake .star-btn')?.click();
    document.querySelector<HTMLButtonElement>('.alerts-tab-btn')?.click();

    const updatedWestlakePill = document.querySelector<HTMLElement>(
      '.alert-station-pill[data-station-id="westlake"]'
    );
    expect(updatedWestlakePill?.classList.contains('is-pinned')).toBe(false);

    app.destroy();
  });

  it('retries failed alerts after 5 minutes (not 1 hour), recovers on stale tab open or online reconnect, and never aborts an in-flight alerts fetch on interval ticks', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(Date.UTC(2026, 10, 21, 10, 0, 0)));

    let alertCallNum = 0;
    let resolveSlowFetch!: () => void;
    let slowFetchAborted = false;

    const fetchMock = vi.fn((url: string, init?: RequestInit) => {
      if (String(url) === ST_ALERTS_FEED_URL) {
        alertCallNum++;
        // Call 1 (startup): transient 503 failure
        if (alertCallNum === 1) {
          return Promise.resolve({ ok: false, status: 503, statusText: 'Service Unavailable' });
        }
        // Call 2 (5-min retry): slow in-flight request that spans a 60s PollScheduler tick
        if (alertCallNum === 2) {
          return new Promise((resolve, reject) => {
            init?.signal?.addEventListener('abort', () => {
              slowFetchAborted = true;
              reject(new DOMException('Aborted', 'AbortError'));
            });
            resolveSlowFetch = () =>
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
            header: { timestamp: Math.floor(Date.now() / 1000) },
            entity: [],
          }),
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

    try {
      const { TransitTrackerApp } = await import('../src/main');
      const app = new TransitTrackerApp();
      await vi.advanceTimersByTimeAsync(25);
      expect(alertCallNum).toBe(1);

      // Opening Alerts immediately after startup failure shows error card without hammering endpoint
      document.querySelector<HTMLButtonElement>('.alerts-tab-btn')?.click();
      await vi.advanceTimersByTimeAsync(25);
      expect(document.querySelector('.alerts-error-card')).not.toBeNull();
      expect(alertCallNum).toBe(1);

      // 4 minutes pass: still within 5-minute error retry cooldown
      await vi.advanceTimersByTimeAsync(4 * 60 * 1000);
      expect(alertCallNum).toBe(1);

      // Advance 1 more minute (crossing the 5-minute error retry mark at t=300s): retry starts (call 2)
      await vi.advanceTimersByTimeAsync(60 * 1000);
      expect(alertCallNum).toBe(2);

      // While call 2 is still in flight (< 6s timeout), a visibility resume poll fires -> MUST NOT abort call 2
      Object.defineProperty(document, 'hidden', { configurable: true, value: true });
      document.dispatchEvent(new Event('visibilitychange'));
      Object.defineProperty(document, 'hidden', { configurable: true, value: false });
      document.dispatchEvent(new Event('visibilitychange'));
      await vi.advanceTimersByTimeAsync(100);
      expect(slowFetchAborted).toBe(false);
      expect(alertCallNum).toBe(2);

      // Resolve slow call 2 -> Alerts view recovers cleanly
      resolveSlowFetch();
      await vi.advanceTimersByTimeAsync(25);
      expect(document.querySelector('.alerts-empty-card')).not.toBeNull();

      // Browser offline -> online reconnect bypasses the 1-hour alerts cooldown
      window.dispatchEvent(new Event('offline'));
      window.dispatchEvent(new Event('online'));
      await vi.advanceTimersByTimeAsync(25);
      expect(alertCallNum).toBe(3);

      app.destroy();
    } finally {
      Object.defineProperty(document, 'hidden', { configurable: true, value: false });
      vi.useRealTimers();
    }
  });
});
