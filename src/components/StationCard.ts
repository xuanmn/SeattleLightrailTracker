import { Station, StationArrivals, TransitArrival } from '../types/transit';
import { createElement, ICONS } from '../utils/dom';
import { formatClockTime, formatCountdownBadge } from '../utils/time';
import { formatSimpleDestination } from '../utils/format';
import { StationDirectionFilter } from '../services/storage';

export interface StationCardCallbacks {
  onTogglePin: (stationId: string) => void;
  onDirectionFilterChange?: (stationId: string, filter: StationDirectionFilter) => void;
}

export class StationCardComponent {
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

  private directionFilter: StationDirectionFilter = 'both';
  private btnBoth!: HTMLButtonElement;
  private btnDir1!: HTMLButtonElement;
  private btnDir2!: HTMLButtonElement;

  private currentArrivals?: StationArrivals;

  // Cached DOM references for lightweight tick updates (avoids full re-render)
  private countdownChips: HTMLElement[] = [];
  private countdownRows: HTMLElement[] = [];
  private arrivalTimes: number[] = [];

  constructor(
    station: Station,
    isPinned: boolean,
    is24Hour: boolean,
    callbacks: StationCardCallbacks,
    initialDirectionFilter: StationDirectionFilter = 'both'
  ) {
    this.station = station;
    this.isPinned = isPinned;
    this.is24Hour = is24Hour;
    this.callbacks = callbacks;
    this.directionFilter = initialDirectionFilter;
    this.element = this.render();
  }

  public getElement(): HTMLElement {
    return this.element;
  }

  public setPinned(pinned: boolean) {
    this.isPinned = pinned;
    this.starBtn.className = `star-btn ${pinned ? 'pinned' : ''}`;
    this.starBtn.innerHTML = pinned ? ICONS.starFilled : ICONS.star;
    this.starBtn.title = pinned ? 'Remove from favorites' : 'Add to favorites';
  }

  public setTimeFormat(is24Hour: boolean) {
    this.is24Hour = is24Hour;
    if (this.currentArrivals) {
      this.updateArrivals(this.currentArrivals);
    }
  }

  private setDirectionFilter(filter: StationDirectionFilter) {
    this.directionFilter = filter;
    this.updateDirectionFilterUI();
    this.updateApproachTrack();
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

  private setLoading() {
    this.platform1Container.innerHTML = `
      <div class="skeleton-row"></div>
      <div class="skeleton-row"></div>
    `;
    this.platform2Container.innerHTML = `
      <div class="skeleton-row"></div>
      <div class="skeleton-row"></div>
    `;
  }

  public updateArrivals(data: StationArrivals) {
    this.currentArrivals = data;

    // Clear tracked DOM refs before full rebuild
    this.countdownChips = [];
    this.countdownRows = [];
    this.arrivalTimes = [];

    this.renderPlatformArrivals(
      this.platform1Container,
      data.direction1.arrivals,
      data.direction1.platform.terminalDestination
    );
    this.renderPlatformArrivals(
      this.platform2Container,
      data.direction2.arrivals,
      data.direction2.platform.terminalDestination
    );

    this.updateApproachTrack();
  }

  /**
   * Lightweight tick: only updates countdown text and arriving-soon classes.
   * No DOM destruction or creation — just textContent and className patches.
   */
  public tickCountdowns() {
    if (!this.currentArrivals) return;

    const now = Date.now();

    // Update each cached countdown chip only when values change to avoid DOM churn
    for (let i = 0; i < this.countdownChips.length; i++) {
      const chip = this.countdownChips[i];
      const row = this.countdownRows[i];
      const targetTime = this.arrivalTimes[i];
      const badge = formatCountdownBadge(targetTime, now);

      if (chip.textContent !== badge.text) {
        chip.textContent = badge.text;
      }
      chip.classList.toggle('now', badge.isNow);

      if (row) {
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

    const candidateArrivals: TransitArrival[] = [];
    if (this.directionFilter === 'both' || this.directionFilter === 'dir1') {
      candidateArrivals.push(...(this.currentArrivals.direction1.arrivals || []));
    }
    if (this.directionFilter === 'both' || this.directionFilter === 'dir2') {
      candidateArrivals.push(...(this.currentArrivals.direction2.arrivals || []));
    }

    if (candidateArrivals.length === 0) {
      this.approachTrackWrap.classList.remove('active');
      return;
    }

    let closestDiffMs = Infinity;
    let closestArrival: TransitArrival | null = null;

    for (const arr of candidateArrivals) {
      const targetTime = arr.predictedDepartureTime || arr.scheduledDepartureTime;
      const diff = targetTime - now;
      if (diff > -25000 && diff < closestDiffMs) {
        closestDiffMs = diff;
        closestArrival = arr;
      }
    }

    const APPROACH_WINDOW_MS = 5 * 60 * 1000; // 5 minutes

    if (closestArrival && closestDiffMs <= APPROACH_WINDOW_MS) {
      this.approachTrackWrap.classList.add('active');
      const progress = Math.min(
        100,
        Math.max(0, ((APPROACH_WINDOW_MS - Math.max(0, closestDiffMs)) / APPROACH_WINDOW_MS) * 100)
      );
      this.approachBar.style.width = `${progress}%`;

      const isLine2 =
        closestArrival.routeName.includes('2') ||
        closestArrival.destination.includes('Redmond') ||
        closestArrival.destination.includes('Bellevue');

      const isArriving = closestDiffMs <= 45000;
      this.approachBar.className = `station-approach-bar ${isLine2 ? 'line-2-approach' : 'line-1-approach'} ${isArriving ? 'arriving-pulse' : ''}`;
    } else {
      this.approachTrackWrap.classList.remove('active');
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

      const isLine2Arrival =
        arrival.routeName.includes('2') ||
        arrival.destination.includes('Redmond') ||
        arrival.destination.includes('Bellevue');

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

      // Track DOM refs for lightweight tick updates
      this.countdownChips.push(chip);
      this.countdownRows.push(row);
      this.arrivalTimes.push(targetTime);

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

    this.platform1Container = createElement('div', 'platform-departures');
    col1El.appendChild(header1);
    col1El.appendChild(this.platform1Container);

    // Platform 2 Column
    const col2El = createElement('div', 'platform-column');
    const header2 = createElement('div', 'platform-header');
    const dest2 = createElement('div', 'platform-dest');
    const label2 = formatSimpleDestination(p2?.terminalDestination || 'Terminal', this.station.id, false);
    dest2.innerHTML = `${ICONS.arrowDown} <span class="dest-text">${label2}</span>`;
    header2.appendChild(dest2);

    this.platform2Container = createElement('div', 'platform-departures');
    col2El.appendChild(header2);
    col2El.appendChild(this.platform2Container);

    this.platformsEl.appendChild(col1El);
    this.platformsEl.appendChild(col2El);

    card.appendChild(header);

    // Live Approach Track
    this.approachTrackWrap = createElement('div', 'station-approach-track-wrap');
    this.approachBar = createElement('div', 'station-approach-bar');
    const approachTrain = createElement('div', 'station-approach-train');
    this.approachBar.appendChild(approachTrain);
    this.approachTrackWrap.appendChild(this.approachBar);
    card.appendChild(this.approachTrackWrap);

    card.appendChild(this.platformsEl);

    this.setLoading();
    return card;
  }
}
