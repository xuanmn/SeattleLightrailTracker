import type { AlertSeverity, ServiceAlert, Station, TransitLineId } from '../types/transit';
import { getStationById } from '../data/stations';
import { ST_ALERTS_WEB_URL } from '../services/alerts-api';
import { createElement, ICONS } from '../utils/dom';
import { formatAlertTimestamp } from '../utils/time';

interface AlertsViewCallbacks {
  onBackToStations: () => void;
  onRetry: () => void;
}

interface AlertsRenderState {
  alerts: ServiceAlert[];
  activeLine: TransitLineId;
  updatedAt: number | null;
  isLoading: boolean;
  error: string | null;
  timeFormat24Hour: boolean;
  nowEpochMs?: number;
  pinnedStationIds?: ReadonlySet<string>;
}

const MAX_VISIBLE_STATION_PILLS = 8;

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
  'OTHER_EFFECT',
  'NO_EFFECT',
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
    let expectedOrderNum = 1;
    let proseLines: string[] = [];

    const flushProse = () => {
      if (proseLines.length === 0) return;
      const p = document.createElement('p');
      p.textContent = proseLines.join('\n');
      elements.push(p);
      proseLines = [];
    };

    const flushList = () => {
      if (!listEl) return;
      elements.push(listEl);
      listEl = null;
      listType = null;
      expectedOrderNum = 1;
    };

    for (const line of lines) {
      const unorderedMatch = line.match(/^(?:\*(?!\*)\s*|-\s+|•\s+)(.+)$/);
      const orderedMatch = line.match(/^(\d{1,2})[.)]\s+(.+)$/);

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
        const itemNum = Number(orderedMatch[1]);
        if (listType !== 'ol') {
          flushList();
          const ol = createElement('ol', 'alert-card-list alert-card-list--ordered');
          if (itemNum !== 1) {
            ol.start = itemNum;
          }
          expectedOrderNum = itemNum;
          listEl = ol;
          listType = 'ol';
        }
        const li = document.createElement('li');
        if (itemNum !== expectedOrderNum) {
          li.value = itemNum;
        }
        expectedOrderNum = itemNum + 1;
        li.textContent = orderedMatch[2].trim();
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
  private lastRenderKey: string = '';

  constructor(callbacks: AlertsViewCallbacks) {
    this.callbacks = callbacks;
    this.rootEl = createElement('section', 'alerts-view');
    this.rootEl.setAttribute('aria-label', 'Link service alerts');
  }

  public getElement(): HTMLElement {
    return this.rootEl;
  }

  private buildRenderKey(
    ordered: ServiceAlert[],
    state: AlertsRenderState,
    nowEpochMs: number
  ): string {
    const showLoadingSkeleton = state.isLoading && state.updatedAt === null;
    const pinned = state.pinnedStationIds;
    const alertsKey = ordered
      .map((alert) => {
        const stationKey = alert.stationIds
          .map((id) => (pinned?.has(id) ? `*${id}` : id))
          .join(',');
        return [
          alert.id,
          alert.severity,
          alert.effect,
          alert.lines.join(','),
          stationKey,
          alert.header,
          alert.description,
          alert.url ?? '',
          formatActiveWindow(alert, state.timeFormat24Hour, nowEpochMs),
        ].join('\u001f');
      })
      .join('\u001e');

    const isRetryingStale =
      state.isLoading && Boolean(state.error) && state.updatedAt !== null;

    return [
      state.activeLine,
      state.updatedAt !== null ? '1' : '0',
      showLoadingSkeleton ? '1' : '0',
      isRetryingStale ? '1' : '0',
      state.error ?? '',
      state.timeFormat24Hour ? '24' : '12',
      alertsKey,
    ].join('\u001d');
  }

  public update(state: AlertsRenderState): void {
    const nowEpochMs = state.nowEpochMs ?? Date.now();
    const ordered = sortAlertsForLine(state.alerts, state.activeLine);
    const nextRenderKey = this.buildRenderKey(ordered, state, nowEpochMs);
    if (this.lastRenderKey === nextRenderKey && this.rootEl.childNodes.length > 0) {
      return;
    }
    this.lastRenderKey = nextRenderKey;

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
      const isRetryingStale = state.isLoading;
      const staleNote = createElement('div', 'alerts-stale-note');
      staleNote.setAttribute('role', 'status');
      const noteText = createTextElement(
        'span',
        'alerts-stale-note-text',
        `Could not refresh alerts (${state.error}). Showing cached notices.`
      );
      const retryBtn = createTextElement(
        'button',
        'alerts-stale-retry-btn',
        isRetryingStale ? 'Retrying…' : 'Retry'
      );
      retryBtn.type = 'button';
      retryBtn.disabled = isRetryingStale;
      if (isRetryingStale) {
        retryBtn.setAttribute('aria-busy', 'true');
      } else {
        retryBtn.addEventListener('click', () => this.callbacks.onRetry());
      }
      staleNote.append(noteText, retryBtn);
      fragment.appendChild(staleNote);
    }

    if (ordered.length === 0) {
      fragment.appendChild(this.renderEmptyCard());
    } else {
      fragment.appendChild(this.renderAlertList(ordered, state, nowEpochMs));
    }

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

  private renderEmptyCard(): HTMLElement {
    const card = createElement('div', 'alerts-empty-card');

    const dot = createElement('span', 'alerts-good-dot');
    dot.setAttribute('aria-hidden', 'true');

    const titleRow = createElement('div', 'alerts-empty-title-row');
    const title = createTextElement('h3', 'alerts-state-title', 'No active Link service alerts');
    titleRow.append(dot, title);

    const message = createTextElement(
      'p',
      'alerts-state-message',
      '1 Line and 2 Line have no reported disruptions right now.'
    );

    const actions = createElement('div', 'alerts-state-actions');
    const backBtn = createTextElement('button', 'alerts-back-btn', 'Back to Stations');
    backBtn.type = 'button';
    backBtn.addEventListener('click', () => this.callbacks.onBackToStations());

    actions.appendChild(backBtn);
    card.append(titleRow, message, actions);
    return card;
  }

  private renderAlertList(
    ordered: ServiceAlert[],
    state: AlertsRenderState,
    nowEpochMs: number
  ): HTMLElement {
    const list = createElement('ul', 'alerts-list');

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

      const trimmedHeader = alert.header.trim();
      const headline = createTextElement(
        'h3',
        'alert-card-title',
        trimmedHeader || 'Link Service Alert'
      );
      item.appendChild(headline);

      const stationsRow = this.renderAffectedStations(alert.stationIds, state.pinnedStationIds);
      if (stationsRow) {
        item.appendChild(stationsRow);
      }

      const windowText = formatActiveWindow(alert, state.timeFormat24Hour, nowEpochMs);
      if (windowText) {
        item.appendChild(createTextElement('p', 'alert-card-window', windowText));
      }

      const trimmedDesc = alert.description.trim();
      if (trimmedDesc && trimmedDesc.toLowerCase() !== trimmedHeader.toLowerCase()) {
        const blockElements = buildDescriptionElements(trimmedDesc);
        if (blockElements.length > 0) {
          const desc = createElement('div', 'alert-card-description');
          for (const blockEl of blockElements) {
            desc.appendChild(blockEl);
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

  private renderAffectedStations(
    stationIds: string[],
    pinnedStationIds?: ReadonlySet<string>
  ): HTMLElement | null {
    if (!stationIds || stationIds.length === 0) return null;

    const resolved: Station[] = [];
    for (const id of stationIds) {
      const station = getStationById(id);
      if (station) resolved.push(station);
    }
    if (resolved.length === 0) return null;

    let visibleStations: Station[];
    let hiddenStations: Station[] = [];

    if (resolved.length <= MAX_VISIBLE_STATION_PILLS) {
      visibleStations = resolved;
    } else {
      const pinnedStations = resolved.filter((s) => pinnedStationIds?.has(s.id));
      const unpinnedStations = resolved.filter((s) => !pinnedStationIds?.has(s.id));
      const remainingSlots = Math.max(0, MAX_VISIBLE_STATION_PILLS - pinnedStations.length);
      visibleStations = [...pinnedStations, ...unpinnedStations.slice(0, remainingSlots)];
      hiddenStations = unpinnedStations.slice(remainingSlots);
    }

    const row = createElement('div', 'alert-card-stations');

    const label = createElement('span', 'alert-stations-label');
    label.setAttribute('aria-hidden', 'true');
    const pinIcon = createElement('span', 'alert-stations-icon');
    pinIcon.innerHTML = ICONS.mapPin;
    label.append(pinIcon, document.createTextNode('Affected:'));

    const pillList = createElement('ul', 'alert-station-pills');
    pillList.setAttribute('aria-label', 'Affected stations');
    for (const station of visibleStations) {
      const isPinned = Boolean(pinnedStationIds?.has(station.id));
      const pill = createElement(
        'li',
        isPinned ? 'alert-station-pill is-pinned' : 'alert-station-pill'
      );
      pill.dataset.stationId = station.id;

      if (isPinned) {
        pill.title = 'Saved in My Stations';
        const star = createElement('span', 'alert-station-star');
        star.setAttribute('aria-hidden', 'true');
        star.innerHTML = ICONS.starFilled;
        const nameEl = createTextElement('span', '', station.name);
        const srNote = createTextElement('span', 'sr-only', ' (saved station)');
        pill.append(star, nameEl, srNote);
      } else {
        pill.textContent = station.name;
      }

      pillList.appendChild(pill);
    }

    if (hiddenStations.length > 0) {
      const morePill = createTextElement(
        'li',
        'alert-station-pill alert-station-pill--more',
        `+${hiddenStations.length} more`
      );
      morePill.title = hiddenStations.map((s) => s.name).join(', ');
      pillList.appendChild(morePill);
    }

    row.append(label, pillList);
    return row;
  }
}
