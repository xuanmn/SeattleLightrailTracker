import { Station, StationArrivals, TransitArrival } from '../types/transit';
import { createElement, ICONS } from '../utils/dom';
import { formatClockTime, formatCountdownBadge } from '../utils/time';
import { formatSimpleDestination } from '../utils/format';
import { StationDirectionFilter } from '../services/storage';

interface StationCardCallbacks {
  onTogglePin: (stationId: string) => void;
  onDirectionFilterChange?: (stationId: string, filter: StationDirectionFilter) => void;
  onBecameVisible?: (stationId: string) => void;
}

export class StationCardComponent {
  private static observedCards = new WeakMap<Element, StationCardComponent>();

  /**
   * Create a single shared IntersectionObserver that can observe all StationCardComponents
   * in a dashboard grid instead of allocating one observer per card.
   */
  public static createSharedObserver(): IntersectionObserver | undefined {
    if (typeof window === 'undefined' || !('IntersectionObserver' in window)) {
      return undefined;
    }
    return new window.IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          StationCardComponent.observedCards.get(entry.target)?.handleIntersection(
            entry.isIntersecting
          );
        }
      },
      { rootMargin: '200px 0px' }
    );
  }

  private element: HTMLElement;
  private station: Station;
  private isPinned: boolean;
  private is24Hour: boolean;
  private callbacks: StationCardCallbacks;
  private starBtn!: HTMLButtonElement;

  private platformsEl!: HTMLElement;
  private platform1Container!: HTMLElement;
  private platform2Container!: HTMLElement;

  private approachTrackWrap!: HTMLElement;
  private approachBar!: HTMLElement;
  private approachTrain!: HTMLElement;

  private observer?: IntersectionObserver;
  private usesSharedObserver: boolean = false;
  public isVisible: boolean = true;

  private directionFilter: StationDirectionFilter = 'both';
  private btnBoth!: HTMLButtonElement;
  private btnDir1!: HTMLButtonElement;
  private btnDir2!: HTMLButtonElement;

  private currentArrivals?: StationArrivals;

  // Cached DOM references for lightweight tick updates (avoids full re-render)
  private countdownChips: HTMLElement[] = [];
  private countdownRows: HTMLElement[] = [];
  private arrivalTimes: number[] = [];

  // Track current trip keys per direction for fast diff (Fix #6)
  private currentDir1TripKey: string = '';
  private currentDir2TripKey: string = '';
  private clockElements: HTMLElement[] = [];
  private statusElements: HTMLElement[] = [];

  constructor(
    station: Station,
    isPinned: boolean,
    is24Hour: boolean,
    callbacks: StationCardCallbacks,
    initialDirectionFilter: StationDirectionFilter = 'both',
    sharedObserver?: IntersectionObserver
  ) {
    this.station = station;
    this.isPinned = isPinned;
    this.is24Hour = is24Hour;
    this.callbacks = callbacks;
    this.directionFilter = initialDirectionFilter;
    this.element = this.render();
    this.setupIntersectionObserver(sharedObserver);
  }

  public getElement(): HTMLElement {
    return this.element;
  }

  public setPinned(pinned: boolean) {
    this.isPinned = pinned;
    this.starBtn.className = `star-btn ${pinned ? 'pinned' : ''}`;
    this.starBtn.innerHTML = pinned ? ICONS.starFilled : ICONS.star;
    this.starBtn.title = pinned ? 'Remove from favorites' : 'Add to favorites';
    this.starBtn.setAttribute('aria-label', `${pinned ? 'Remove' : 'Add'} ${this.station.name} to favorites`);
  }

  public setTimeFormat(is24Hour: boolean) {
    if (this.is24Hour === is24Hour) return;
    this.is24Hour = is24Hour;
    for (let i = 0; i < this.clockElements.length; i++) {
      const clockEl = this.clockElements[i];
      const targetTime = this.arrivalTimes[i];
      if (clockEl && targetTime !== undefined) {
        const clockText = formatClockTime(targetTime, this.is24Hour);
        if (clockEl.textContent !== clockText) {
          clockEl.textContent = clockText;
        }
      }
    }
  }

  public getDirectionFilter(): StationDirectionFilter {
    return this.directionFilter;
  }

  private setDirectionFilter(filter: StationDirectionFilter) {
    this.directionFilter = filter;
    this.updateDirectionFilterUI();
    this.updateApproachTrack(Date.now());
    this.callbacks.onDirectionFilterChange?.(this.station.id, filter);
  }

  private updateDirectionFilterUI() {
    if (!this.platformsEl) return;
    this.platformsEl.className = `station-platforms view-${this.directionFilter}`;

    if (this.btnBoth) {
      this.btnBoth.classList.toggle('active', this.directionFilter === 'both');
    }
    if (this.btnDir1) {
      this.btnDir1.classList.toggle('active', this.directionFilter === 'dir1');
    }
    if (this.btnDir2) {
      this.btnDir2.classList.toggle('active', this.directionFilter === 'dir2');
    }
  }

  private renderPlatformSkeleton(container: HTMLElement) {
    container.innerHTML = `
      <div class="skeleton-row"></div>
      <div class="skeleton-row"></div>
    `;
  }

  private setLoading() {
    this.renderPlatformSkeleton(this.platform1Container);
    this.renderPlatformSkeleton(this.platform2Container);
  }

  private renderPlatformUnavailable(container: HTMLElement) {
    container.innerHTML = '<div class="departures-empty">Live data unavailable</div>';
  }

  public setUnavailable() {
    this.currentArrivals = undefined;
    this.currentDir1TripKey = '';
    this.currentDir2TripKey = '';
    this.countdownChips = [];
    this.countdownRows = [];
    this.arrivalTimes = [];
    this.clockElements = [];
    this.statusElements = [];

    this.renderPlatformUnavailable(this.platform1Container);
    this.renderPlatformUnavailable(this.platform2Container);
    this.updateApproachTrack();
  }

  public updateArrivals(data: StationArrivals) {
    this.currentArrivals = data;

    const dir1Unavailable = Boolean(data.dir1Unavailable);
    const dir2Unavailable = Boolean(data.dir2Unavailable);
    const dir1Fetched = !dir1Unavailable && data.dir1Fetched !== false;
    const dir2Fetched = !dir2Unavailable && data.dir2Fetched !== false;
    const dir1Arrivals = data.direction1?.arrivals || [];
    const dir2Arrivals = data.direction2?.arrivals || [];

    const dir1Key = dir1Unavailable
      ? '__unavailable__'
      : dir1Fetched
        ? dir1Arrivals.map(a => a.tripId).join(',')
        : '__unfetched__';
    const dir2Key = dir2Unavailable
      ? '__unavailable__'
      : dir2Fetched
        ? dir2Arrivals.map(a => a.tripId).join(',')
        : '__unfetched__';

    const sameTrips =
      dir1Key === this.currentDir1TripKey &&
      dir2Key === this.currentDir2TripKey;

    if (sameTrips && this.countdownChips.length > 0) {
      // Same trips in same order — patch values in-place without DOM rebuild
      this.patchArrivalsInPlace(data);
    } else {
      // Trip list changed — full rebuild
      this.currentDir1TripKey = dir1Key;
      this.currentDir2TripKey = dir2Key;

      // Clear tracked DOM refs before full rebuild
      this.countdownChips = [];
      this.countdownRows = [];
      this.arrivalTimes = [];
      this.clockElements = [];
      this.statusElements = [];

      if (dir1Unavailable) {
        this.renderPlatformUnavailable(this.platform1Container);
      } else if (dir1Fetched) {
        this.renderPlatformArrivals(
          this.platform1Container,
          dir1Arrivals,
          data.direction1?.platform?.terminalDestination || ''
        );
      } else {
        this.renderPlatformSkeleton(this.platform1Container);
      }

      if (dir2Unavailable) {
        this.renderPlatformUnavailable(this.platform2Container);
      } else if (dir2Fetched) {
        this.renderPlatformArrivals(
          this.platform2Container,
          dir2Arrivals,
          data.direction2?.platform?.terminalDestination || ''
        );
      } else {
        this.renderPlatformSkeleton(this.platform2Container);
      }
    }

    this.updateApproachTrack(data.lastUpdated);
  }

  /**
   * Patch existing DOM elements in-place when the trip list hasn't changed.
   * Updates countdown, clock, status text, and timing data without DOM destruction.
   */
  private patchArrivalsInPlace(data: StationArrivals) {
    const dir1Fetched = !data.dir1Unavailable && data.dir1Fetched !== false;
    const dir2Fetched = !data.dir2Unavailable && data.dir2Fetched !== false;
    const allArrivals = [
      ...(dir1Fetched ? (data.direction1?.arrivals || []) : []),
      ...(dir2Fetched ? (data.direction2?.arrivals || []) : []),
    ];

    const now = Date.now();

    for (let i = 0; i < allArrivals.length && i < this.countdownChips.length; i++) {
      const arrival = allArrivals[i];
      const targetTime = arrival.predictedDepartureTime || arrival.scheduledDepartureTime;

      // Update cached time data
      this.arrivalTimes[i] = targetTime;

      // Patch countdown chip
      const badge = formatCountdownBadge(targetTime, now);
      const chip = this.countdownChips[i];
      if (chip.textContent !== badge.text) {
        chip.textContent = badge.text;
      }
      if (chip.classList.contains('now') !== badge.isNow) {
        chip.classList.toggle('now', badge.isNow);
      }

      // Patch arriving-soon class on row
      const row = this.countdownRows[i];
      if (row && row.classList.contains('arriving-soon') !== badge.isNow) {
        row.classList.toggle('arriving-soon', badge.isNow);
      }

      // Patch clock time
      const clockEl = this.clockElements[i];
      if (clockEl) {
        const clockText = formatClockTime(targetTime, this.is24Hour);
        if (clockEl.textContent !== clockText) {
          clockEl.textContent = clockText;
        }
      }

      // Patch status pill
      const statusEl = this.statusElements[i];
      if (statusEl) {
        if (statusEl.textContent !== arrival.statusText) {
          statusEl.textContent = arrival.statusText;
        }
        if (statusEl.className !== `status-pill ${arrival.statusType}`) {
          statusEl.className = `status-pill ${arrival.statusType}`;
        }
      }
    }
  }

  /**
   * Lightweight tick: only updates countdown text and arriving-soon classes.
   * No DOM destruction or creation — just textContent and className patches.
   */
  public tickCountdowns(now: number = Date.now()) {
    if (!this.currentArrivals) return;

    // Update each cached countdown chip only when values change to avoid DOM churn
    for (let i = 0; i < this.countdownChips.length; i++) {
      const chip = this.countdownChips[i];
      const row = this.countdownRows[i];
      const targetTime = this.arrivalTimes[i];
      const badge = formatCountdownBadge(targetTime, now);

      if (chip.textContent !== badge.text) {
        chip.textContent = badge.text;
      }

      // Fix #10: Guard classList.toggle with contains() check
      if (chip.classList.contains('now') !== badge.isNow) {
        chip.classList.toggle('now', badge.isNow);
      }

      if (row && row.classList.contains('arriving-soon') !== badge.isNow) {
        row.classList.toggle('arriving-soon', badge.isNow);
      }
    }

    this.updateApproachTrack(now);
  }

  /**
   * Updates the live approach track animation when a train is within 5 minutes.
   */
  private updateApproachTrack(now: number = (this.currentArrivals?.lastUpdated || Date.now())) {
    if (!this.currentArrivals || !this.approachTrackWrap) return;

    let closestDiffMs = Infinity;
    let closestArrival: TransitArrival | null = null;

    const scanArrivals = (arrivals?: TransitArrival[]) => {
      if (!arrivals) return;
      for (let i = 0; i < arrivals.length; i++) {
        const arr = arrivals[i];
        const targetTime = arr.predictedDepartureTime || arr.scheduledDepartureTime;
        const diff = targetTime - now;
        if (diff > -25000 && diff < closestDiffMs) {
          closestDiffMs = diff;
          closestArrival = arr;
        }
      }
    };

    if (this.directionFilter === 'both' || this.directionFilter === 'dir1') {
      scanArrivals(this.currentArrivals.direction1?.arrivals);
    }
    if (this.directionFilter === 'both' || this.directionFilter === 'dir2') {
      scanArrivals(this.currentArrivals.direction2?.arrivals);
    }

    const APPROACH_WINDOW_MS = 5 * 60 * 1000; // 5 minutes

    if (closestArrival && closestDiffMs <= APPROACH_WINDOW_MS) {
      if (!this.approachTrackWrap.classList.contains('active')) {
        this.approachTrackWrap.classList.add('active');
      }
      const progress = Math.min(
        100,
        Math.max(0, ((APPROACH_WINDOW_MS - Math.max(0, closestDiffMs)) / APPROACH_WINDOW_MS) * 100)
      );
      this.approachBar.style.transform = `scaleX(${progress / 100})`;
      this.approachTrain.style.transform = `translateX(${progress}%)`;

      const isLine2 = (closestArrival as TransitArrival).routeName === '2 Line';
      const isArriving = closestDiffMs <= 45000;
      const barClass = `station-approach-bar ${isLine2 ? 'line-2-approach' : 'line-1-approach'}`;
      if (this.approachBar.className !== barClass) {
        this.approachBar.className = barClass;
      }
      if (this.approachTrackWrap.classList.contains('line-2-approach') !== isLine2) {
        this.approachTrackWrap.classList.toggle('line-2-approach', isLine2);
      }
      if (this.approachTrackWrap.classList.contains('arriving-pulse') !== isArriving) {
        this.approachTrackWrap.classList.toggle('arriving-pulse', isArriving);
      }
    } else if (this.approachTrackWrap.classList.contains('active')) {
      this.approachTrackWrap.classList.remove('active', 'line-2-approach', 'arriving-pulse');
      this.approachBar.style.transform = 'scaleX(0)';
      this.approachTrain.style.transform = 'translateX(0%)';
    }
  }

  private renderPlatformArrivals(
    container: HTMLElement,
    arrivals: TransitArrival[],
    defaultDest: string
  ) {
    container.innerHTML = '';

    if (!arrivals || arrivals.length === 0) {
      const empty = createElement('div', 'departures-empty');
      empty.textContent = 'No upcoming trains';
      container.appendChild(empty);
      return;
    }

    const list = createElement('div', 'departures-list');

    arrivals.forEach((arrival) => {
      const targetTime = arrival.predictedDepartureTime || arrival.scheduledDepartureTime;
      const badge = formatCountdownBadge(targetTime);

      const row = createElement('div', `departure-row ${badge.isNow ? 'arriving-soon' : ''}`);

      const info = createElement('div', 'dep-info');
      const dest = createElement('div', 'dep-dest');

      const isLine2Arrival = arrival.routeName === '2 Line';

      const lineBadge = createElement(
        'span',
        `dep-line-tag ${isLine2Arrival ? 'line-2-tag' : 'line-1-tag'}`,
        isLine2Arrival ? '2' : '1'
      );
      lineBadge.title = isLine2Arrival ? '2 Line Train' : '1 Line Train';

      const destText = createElement(
        'span',
        'dep-dest-name',
        arrival.destination || defaultDest
      );

      dest.appendChild(lineBadge);
      dest.appendChild(destText);

      const meta = createElement('div', 'dep-meta');
      const clock = createElement(
        'span',
        'dep-clock',
        formatClockTime(targetTime, this.is24Hour)
      );
      const status = createElement(
        'span',
        `status-pill ${arrival.statusType}`,
        arrival.statusText
      );

      meta.appendChild(clock);
      meta.appendChild(status);
      info.appendChild(dest);
      info.appendChild(meta);

      const chip = createElement(
        'div',
        `countdown-chip ${badge.isNow ? 'now' : ''}`,
        badge.text
      );

      // Track DOM refs for lightweight tick and in-place patch updates
      this.countdownChips.push(chip);
      this.countdownRows.push(row);
      this.arrivalTimes.push(targetTime);
      this.clockElements.push(clock);
      this.statusElements.push(status);

      row.appendChild(info);
      row.appendChild(chip);
      list.appendChild(row);
    });

    container.appendChild(list);
  }

  private render(): HTMLElement {
    const isLine1 = this.station.lines.includes('line-1');
    const card = createElement(
      'div',
      `station-card ${isLine1 ? 'line-1-card' : 'line-2-card'}`
    );
    card.id = `station-${this.station.id}`;

    // Header
    const header = createElement('div', 'station-header');
    const titleGroup = createElement('div', 'station-title-group');

    const linePill = createElement(
      'span',
      `station-line-pill ${isLine1 ? 'line-1-circle' : 'line-2-circle'}`,
      isLine1 ? '1' : '2'
    );

    const nameWrap = createElement('div', 'station-name-wrap');
    const name = createElement('h3', 'station-name', this.station.name);
    if (this.station.shortName) {
      const sub = createElement('span', 'station-subname', this.station.shortName);
      nameWrap.appendChild(name);
      nameWrap.appendChild(sub);
    } else {
      nameWrap.appendChild(name);
    }

    titleGroup.appendChild(linePill);
    titleGroup.appendChild(nameWrap);

    // Header Right Controls
    const actions = createElement('div', 'station-actions');

    // Segmented Direction Switcher
    const segmented = createElement('div', 'direction-segmented-control');
    this.btnBoth = createElement(
      'button',
      `direction-segment-btn ${this.directionFilter === 'both' ? 'active' : ''}`,
      'Both'
    ) as HTMLButtonElement;
    this.btnBoth.type = 'button';
    this.btnBoth.title = 'Show departures in both directions';
    this.btnBoth.onclick = () => this.setDirectionFilter('both');

    const dir1Label = isLine1 ? '↑ North' : '→ East';
    this.btnDir1 = createElement(
      'button',
      `direction-segment-btn ${this.directionFilter === 'dir1' ? 'active' : ''}`,
      dir1Label
    ) as HTMLButtonElement;
    this.btnDir1.type = 'button';
    this.btnDir1.title = isLine1 ? 'Show Northbound only' : 'Show Eastbound only';
    this.btnDir1.onclick = () => this.setDirectionFilter('dir1');

    const dir2Label = isLine1 ? '↓ South' : '← West';
    this.btnDir2 = createElement(
      'button',
      `direction-segment-btn ${this.directionFilter === 'dir2' ? 'active' : ''}`,
      dir2Label
    ) as HTMLButtonElement;
    this.btnDir2.type = 'button';
    this.btnDir2.title = isLine1 ? 'Show Southbound only' : 'Show Westbound only';
    this.btnDir2.onclick = () => this.setDirectionFilter('dir2');

    segmented.appendChild(this.btnBoth);
    segmented.appendChild(this.btnDir1);
    segmented.appendChild(this.btnDir2);

    this.starBtn = createElement(
      'button',
      `star-btn ${this.isPinned ? 'pinned' : ''}`,
      this.isPinned ? ICONS.starFilled : ICONS.star
    ) as HTMLButtonElement;
    this.starBtn.title = this.isPinned ? 'Remove from favorites' : 'Add to favorites';
    this.starBtn.setAttribute('aria-label', `${this.isPinned ? 'Remove' : 'Add'} ${this.station.name} to favorites`);
    this.starBtn.onclick = (e) => {
      e.stopPropagation();
      this.callbacks.onTogglePin(this.station.id);
    };

    actions.appendChild(segmented);
    actions.appendChild(this.starBtn);

    header.appendChild(titleGroup);
    header.appendChild(actions);

    // Body: Platforms Container
    this.platformsEl = createElement('div', `station-platforms view-${this.directionFilter}`);

    const p1 = this.station.platforms.northbound || this.station.platforms.eastbound;
    const p2 = this.station.platforms.southbound || this.station.platforms.westbound;

    // Platform 1 Column
    const col1El = createElement('div', 'platform-column');
    const header1 = createElement('div', 'platform-header');
    const dest1 = createElement('div', 'platform-dest');
    const label1 = formatSimpleDestination(p1?.terminalDestination || 'Terminal', this.station.id, true);
    dest1.innerHTML = `${ICONS.arrowUp} <span class="dest-text">${label1}</span>`;
    header1.appendChild(dest1);

    this.platform1Container = createElement('div');
    col1El.appendChild(header1);
    col1El.appendChild(this.platform1Container);

    // Platform 2 Column
    const col2El = createElement('div', 'platform-column');
    const header2 = createElement('div', 'platform-header');
    const dest2 = createElement('div', 'platform-dest');
    const label2 = formatSimpleDestination(p2?.terminalDestination || 'Terminal', this.station.id, false);
    dest2.innerHTML = `${ICONS.arrowDown} <span class="dest-text">${label2}</span>`;
    header2.appendChild(dest2);

    this.platform2Container = createElement('div');
    col2El.appendChild(header2);
    col2El.appendChild(this.platform2Container);

    this.platformsEl.appendChild(col1El);
    this.platformsEl.appendChild(col2El);

    card.appendChild(header);

    // Live Approach Track
    this.approachTrackWrap = createElement('div', 'station-approach-track-wrap');
    this.approachBar = createElement('div', 'station-approach-bar');
    this.approachBar.style.transform = 'scaleX(0)';
    this.approachTrain = createElement('div', 'station-approach-train');
    this.approachTrain.style.transform = 'translateX(0%)';
    this.approachTrackWrap.appendChild(this.approachBar);
    this.approachTrackWrap.appendChild(this.approachTrain);
    card.appendChild(this.approachTrackWrap);

    card.appendChild(this.platformsEl);

    this.setLoading();
    return card;
  }

  private handleIntersection(isIntersecting: boolean) {
    const wasVisible = this.isVisible;
    this.isVisible = isIntersecting;
    if (this.isVisible && !wasVisible) {
      this.tickCountdowns();
      this.callbacks.onBecameVisible?.(this.station.id);
    }
  }

  private setupIntersectionObserver(sharedObserver?: IntersectionObserver) {
    if (sharedObserver) {
      this.usesSharedObserver = true;
      this.observer = sharedObserver;
      StationCardComponent.observedCards.set(this.element, this);
      this.observer.observe(this.element);
      return;
    }

    if ('IntersectionObserver' in window) {
      this.observer = new window.IntersectionObserver(
        (entries) => {
          for (const entry of entries) {
            this.handleIntersection(entry.isIntersecting);
          }
        },
        { rootMargin: '200px 0px' }
      );
      this.observer.observe(this.element);
    }
  }

  public destroy() {
    StationCardComponent.observedCards.delete(this.element);
    if (this.observer) {
      if (this.usesSharedObserver) {
        this.observer.unobserve(this.element);
      } else {
        this.observer.disconnect();
      }
      this.observer = undefined;
    }
  }
}
