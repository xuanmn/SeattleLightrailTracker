import type { AlertSeverity, ServiceAlert, TransitLineId } from '../types/transit';
import { ST_ALERTS_WEB_URL } from '../services/alerts-api';
import { createElement, ICONS } from '../utils/dom';
import { formatAlertTimestamp, formatClockTime } from '../utils/time';

export interface AlertsViewCallbacks {
  onBackToStations: () => void;
  onRetry: () => void;
}

export interface AlertsRenderState {
  alerts: ServiceAlert[];
  activeLine: TransitLineId;
  updatedAt: number | null;
  isLoading: boolean;
  error: string | null;
  timeFormat24Hour: boolean;
  nowEpochMs?: number;
}

const SEVERITY_RANK: Record<AlertSeverity, number> = {
  SEVERE: 0,
  WARNING: 1,
  INFO: 2,
};

const SEVERITY_LABELS: Record<AlertSeverity, string> = {
  SEVERE: 'Major Disruption',
  WARNING: 'Service Alert',
  INFO: 'Service Notice',
};

const LINE_LABELS: Record<TransitLineId, string> = {
  'line-1': '1 Line',
  'line-2': '2 Line',
};

const EFFECT_LABELS: Record<string, string> = {
  NO_SERVICE: 'Service Suspended',
  REDUCED_SERVICE: 'Reduced Service',
  SIGNIFICANT_DELAYS: 'Significant Delays',
  DETOUR: 'Shuttle / Detour',
  ADDITIONAL_SERVICE: 'Additional Service',
  MODIFIED_SERVICE: 'Modified Service',
  STOP_MOVED: 'Stop Relocated',
  ACCESSIBILITY_ISSUE: 'Elevator / Access',
};

const IGNORED_ENUM_VALUES = new Set([
  'UNKNOWN_EFFECT',
  'UNKNOWN_CAUSE',
  'OTHER_EFFECT',
  'OTHER_CAUSE',
]);

/** Create an element with plain text assigned safely via textContent (never innerHTML). */
function createTextElement<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className: string,
  text?: string
): HTMLElementTagNameMap[K] {
  const el = createElement(tag, className);
  if (text !== undefined) {
    el.textContent = text;
  }
  return el;
}

function formatEffectLabel(raw: string): string {
  const cleaned = raw.trim().toUpperCase();
  if (!cleaned || IGNORED_ENUM_VALUES.has(cleaned)) {
    return '';
  }
  if (EFFECT_LABELS[cleaned]) {
    return EFFECT_LABELS[cleaned];
  }
  return cleaned
    .toLowerCase()
    .split('_')
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

function createExternalLink(href: string, text: string, className: string): HTMLAnchorElement {
  const link = createTextElement('a', className, text);
  link.href = href;
  link.target = '_blank';
  link.rel = 'noopener noreferrer';
  return link;
}

function sortAlertsForLine(alerts: ServiceAlert[], activeLine: TransitLineId): ServiceAlert[] {
  return [...alerts].sort((a, b) => {
    const severityDiff = SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity];
    if (severityDiff !== 0) return severityDiff;

    const aMatchesLine = a.lines.includes(activeLine) ? 0 : 1;
    const bMatchesLine = b.lines.includes(activeLine) ? 0 : 1;
    if (aMatchesLine !== bMatchesLine) return aMatchesLine - bMatchesLine;

    return (b.activeStartMs ?? 0) - (a.activeStartMs ?? 0);
  });
}

function buildDescriptionElements(text: string): HTMLElement[] {
  const elements: HTMLElement[] = [];
  const rawBlocks = text
    .split(/\n\s*\n+/)
    .map((block) => block.trim())
    .filter(Boolean);

  for (const block of rawBlocks) {
    const lines = block
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean);

    let listEl: HTMLUListElement | HTMLOListElement | null = null;
    let listType: 'ul' | 'ol' | null = null;
    let proseLines: string[] = [];

    const flushProse = () => {
      if (proseLines.length === 0) return;
      const p = document.createElement('p');
      p.textContent = proseLines.join(' ');
      elements.push(p);
      proseLines = [];
    };

    const flushList = () => {
      if (!listEl) return;
      elements.push(listEl);
      listEl = null;
      listType = null;
    };

    for (const line of lines) {
      const unorderedMatch = line.match(/^(?:\*|-|•)\s*(.+)$/);
      const orderedMatch = line.match(/^\d+[.)]\s+(.+)$/);

      if (unorderedMatch) {
        flushProse();
        if (listType !== 'ul') {
          flushList();
          listEl = createElement('ul', 'alert-card-list');
          listType = 'ul';
        }
        const li = document.createElement('li');
        li.textContent = unorderedMatch[1].trim();
        listEl!.appendChild(li);
      } else if (orderedMatch) {
        flushProse();
        if (listType !== 'ol') {
          flushList();
          listEl = createElement('ol', 'alert-card-list alert-card-list--ordered');
          listType = 'ol';
        }
        const li = document.createElement('li');
        li.textContent = orderedMatch[1].trim();
        listEl!.appendChild(li);
      } else {
        flushList();
        proseLines.push(line);
      }
    }

    flushProse();
    flushList();
  }

  return elements;
}

function formatActiveWindow(
  alert: ServiceAlert,
  is24Hour: boolean,
  nowEpochMs: number
): string {
  const parts: string[] = [];
  if (alert.activeStartMs !== null) {
    parts.push(`Since ${formatAlertTimestamp(alert.activeStartMs, is24Hour, nowEpochMs)}`);
  }
  if (alert.activeEndMs !== null) {
    parts.push(`Until ${formatAlertTimestamp(alert.activeEndMs, is24Hour, nowEpochMs)}`);
  }
  return parts.join(' · ');
}

export class AlertsViewComponent {
  private rootEl: HTMLElement;
  private callbacks: AlertsViewCallbacks;

  constructor(callbacks: AlertsViewCallbacks) {
    this.callbacks = callbacks;
    this.rootEl = createElement('section', 'alerts-view');
    this.rootEl.setAttribute('aria-label', 'Link service alerts');
  }

  public getElement(): HTMLElement {
    return this.rootEl;
  }

  public update(state: AlertsRenderState): void {
    const nowEpochMs = state.nowEpochMs ?? Date.now();
    const fragment = document.createDocumentFragment();

    if (state.isLoading && state.updatedAt === null) {
      fragment.appendChild(this.renderLoadingSkeleton());
      this.rootEl.replaceChildren(fragment);
      return;
    }

    if (state.error && state.updatedAt === null) {
      fragment.appendChild(this.renderErrorCard(state.error));
      this.rootEl.replaceChildren(fragment);
      return;
    }

    if (state.error && state.updatedAt !== null) {
      const staleNote = createTextElement(
        'div',
        'alerts-stale-note',
        `Could not refresh alerts (${state.error}). Showing cached notices.`
      );
      staleNote.setAttribute('role', 'status');
      fragment.appendChild(staleNote);
    }

    if (state.alerts.length === 0) {
      fragment.appendChild(this.renderEmptyCard(state));
    } else {
      fragment.appendChild(this.renderAlertList(state.alerts, state, nowEpochMs));
    }

    fragment.appendChild(this.renderFooter(state));
    this.rootEl.replaceChildren(fragment);
  }

  private renderLoadingSkeleton(): HTMLElement {
    const wrap = createElement('div', 'alerts-loading-skeleton');
    wrap.setAttribute('aria-label', 'Loading service alerts');

    for (let i = 0; i < 2; i++) {
      const card = createElement('div', 'alert-skeleton-card');
      card.append(
        createElement('div', 'alert-skeleton-line alert-skeleton-line--short'),
        createElement('div', 'alert-skeleton-line alert-skeleton-line--title'),
        createElement('div', 'alert-skeleton-line alert-skeleton-line--body'),
        createElement('div', 'alert-skeleton-line alert-skeleton-line--body')
      );
      wrap.appendChild(card);
    }
    return wrap;
  }

  private renderErrorCard(errorMessage: string): HTMLElement {
    const card = createElement('div', 'alerts-error-card');
    card.setAttribute('role', 'alert');

    const icon = createElement('span', 'alerts-state-icon');
    icon.setAttribute('aria-hidden', 'true');
    icon.innerHTML = ICONS.alertTriangle;

    const title = createTextElement('h3', 'alerts-state-title', 'Service alerts unavailable');
    const message = createTextElement('p', 'alerts-state-message', errorMessage);

    const actions = createElement('div', 'alerts-state-actions');
    const retryBtn = createTextElement('button', 'alerts-retry-btn', 'Retry');
    retryBtn.type = 'button';
    retryBtn.addEventListener('click', () => this.callbacks.onRetry());

    const officialLink = createExternalLink(
      ST_ALERTS_WEB_URL,
      'Check soundtransit.org',
      'alerts-official-link'
    );

    actions.append(retryBtn, officialLink);
    card.append(icon, title, message, actions);
    return card;
  }

  private renderEmptyCard(state: AlertsRenderState): HTMLElement {
    const card = createElement('div', 'alerts-empty-card');

    const dot = createElement('span', 'alerts-good-dot');
    dot.setAttribute('aria-hidden', 'true');

    const titleRow = createElement('div', 'alerts-empty-title-row');
    const title = createTextElement('h3', 'alerts-state-title', 'No active Link service alerts');
    titleRow.append(dot, title);

    const lastChecked =
      state.updatedAt !== null
        ? ` Last checked at ${formatClockTime(state.updatedAt, state.timeFormat24Hour)}.`
        : '';
    const message = createTextElement(
      'p',
      'alerts-state-message',
      `1 Line and 2 Line have no reported disruptions right now.${lastChecked}`
    );

    const actions = createElement('div', 'alerts-state-actions');
    const backBtn = createTextElement('button', 'alerts-back-btn', 'Back to Stations');
    backBtn.type = 'button';
    backBtn.addEventListener('click', () => this.callbacks.onBackToStations());

    const officialLink = createExternalLink(
      ST_ALERTS_WEB_URL,
      'View Sound Transit alerts page',
      'alerts-official-link'
    );

    actions.append(backBtn, officialLink);
    card.append(titleRow, message, actions);
    return card;
  }

  private renderAlertList(
    alerts: ServiceAlert[],
    state: AlertsRenderState,
    nowEpochMs: number
  ): HTMLElement {
    const list = createElement('ul', 'alerts-list');
    const ordered = sortAlertsForLine(alerts, state.activeLine);

    for (const alert of ordered) {
      const item = createElement(
        'li',
        `alert-card severity-${alert.severity.toLowerCase()}`
      );
      item.dataset.alertId = alert.id;

      const metaRow = createElement('div', 'alert-card-meta');

      const severityBadge = createTextElement(
        'span',
        `alert-severity-badge severity-${alert.severity.toLowerCase()}`,
        SEVERITY_LABELS[alert.severity]
      );
      metaRow.appendChild(severityBadge);

      for (const line of alert.lines) {
        metaRow.appendChild(
          createTextElement('span', `alert-line-badge ${line}`, LINE_LABELS[line])
        );
      }

      const effectLabel = formatEffectLabel(alert.effect);
      if (effectLabel) {
        metaRow.appendChild(createTextElement('span', 'alert-effect-tag', effectLabel));
      }

      item.appendChild(metaRow);

      const headline = createTextElement(
        'h3',
        'alert-card-title',
        alert.header || 'Link Service Alert'
      );
      item.appendChild(headline);

      const windowText = formatActiveWindow(alert, state.timeFormat24Hour, nowEpochMs);
      if (windowText) {
        item.appendChild(createTextElement('p', 'alert-card-window', windowText));
      }

      const trimmedDesc = alert.description.trim();
      const trimmedHeader = alert.header.trim();
      if (trimmedDesc && trimmedDesc.toLowerCase() !== trimmedHeader.toLowerCase()) {
        const blockElements = buildDescriptionElements(trimmedDesc);
        if (blockElements.length > 0) {
          const desc = createElement('div', 'alert-card-description');
          const visibleBlocks = blockElements.slice(0, 2);
          const extraBlocks = blockElements.slice(2);

          for (const blockEl of visibleBlocks) {
            desc.appendChild(blockEl);
          }

          if (extraBlocks.length > 0) {
            const details = createElement('details', 'alert-more-details');
            const summary = createTextElement(
              'summary',
              'alert-more-summary',
              `More details (${extraBlocks.length} more)`
            );
            const extraWrap = createElement('div', 'alert-more-body');
            for (const blockEl of extraBlocks) {
              extraWrap.appendChild(blockEl);
            }
            details.append(summary, extraWrap);
            desc.appendChild(details);
          }

          item.appendChild(desc);
        }
      }

      if (alert.url) {
        const footer = createElement('div', 'alert-card-footer');
        footer.appendChild(
          createExternalLink(alert.url, 'Official update', 'alert-card-link')
        );
        item.appendChild(footer);
      }

      list.appendChild(item);
    }

    return list;
  }

  private renderFooter(state: AlertsRenderState): HTMLElement {
    const footer = createElement('div', 'alerts-view-footer');
    const updated =
      state.updatedAt !== null
        ? ` · Updated ${formatClockTime(state.updatedAt, state.timeFormat24Hour)}`
        : '';
    const note = createTextElement(
      'span',
      'alerts-source-note',
      `Source: Sound Transit GTFS-RT alerts feed${updated}.`
    );
    const link = createExternalLink(
      ST_ALERTS_WEB_URL,
      'Full Sound Transit advisory board',
      'alerts-footer-link'
    );
    footer.append(note, link);
    return footer;
  }
}
