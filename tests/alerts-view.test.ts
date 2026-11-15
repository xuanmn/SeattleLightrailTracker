import { describe, it, expect, vi } from 'vitest';
import { AlertsViewComponent } from '../src/components/AlertsView';
import { ST_ALERTS_WEB_URL } from '../src/services/alerts-api';
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
});
