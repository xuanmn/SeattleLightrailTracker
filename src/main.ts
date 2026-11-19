import './styles/theme.css';
import './styles/layout.css';
import './styles/board.css';
import './styles/alerts.css';
// map.css is imported by the lazily loaded SystemMapModal chunk

import { AlertsViewComponent } from './components/AlertsView';
import type { FaqModal } from './components/FaqModal';
import { HeaderComponent } from './components/Header';
import type { SettingsModal } from './components/SettingsModal';
import { StationCardComponent } from './components/StationCard';
import type { StationPickerModal } from './components/StationPickerModal';
import type { SystemMapModal } from './components/SystemMapModal';
import { getStationById, getStationsByLine, LINE_CONFIG } from './data/stations';
import { fetchServiceAlerts } from './services/alerts-api';
import { fetchArrivalsForStation } from './services/oba-api';
import { PollScheduler } from './services/pollScheduler';
import {
  getActiveLine,
  getPinnedStationIds,
  getSettings,
  getStationDirectionFilters,
  setActiveLine,
  setStationDirectionFilter,
  StationDirectionFilter,
  togglePinnedStation,
} from './services/storage';
import {
  AppSettings,
  ServiceAlert,
  Station,
  StationArrivals,
  TransitArrival,
  TransitLineId,
} from './types/transit';

type DashboardViewMode = 'pinned' | 'all' | 'alerts';
import { createLazySingleton, runWithConcurrency } from './utils/concurrency';
import { createElement, ICONS } from './utils/dom';
import { formatClockTime } from './utils/time';

const SYNC_INTERVAL_MS = 60 * 1000; // Fixed 60-second real-time sync cycle
const MAX_CONCURRENT_STATION_FETCHES = 6; // Each station fetches 2 platforms

const NETWORK_INTERRUPTED_MESSAGE =
  'Network connection interrupted. Unable to reach live transit servers while reconnecting...';
const OFFLINE_MESSAGE =
  "You're offline. Showing last known departures — they'll refresh as soon as you reconnect.";

export class TransitTrackerApp {
  private appEl: HTMLElement;
  private header!: HeaderComponent;
  private pickerModal?: StationPickerModal;

  private getSettingsModal = createLazySingleton(async (): Promise<SettingsModal> => {
    const { SettingsModal } = await import('./components/SettingsModal');
    return new SettingsModal({
      onSettingsSaved: (newSettings) => this.handleSettingsSaved(newSettings),
    });
  });

  private getFaqModal = createLazySingleton(async (): Promise<FaqModal> => {
    const { FaqModal } = await import('./components/FaqModal');
    return new FaqModal();
  });

  private getMapModal = createLazySingleton(async (): Promise<SystemMapModal> => {
    const { SystemMapModal } = await import('./components/SystemMapModal');
    return new SystemMapModal();
  });

  private getPickerModal = createLazySingleton(async (): Promise<StationPickerModal> => {
    const { StationPickerModal } = await import('./components/StationPickerModal');
    this.pickerModal = new StationPickerModal({
      onTogglePin: (stationId) => this.handleTogglePin(stationId),
      isStationPinned: (stationId) => this.pinnedIds.has(stationId),
    });
    return this.pickerModal;
  });

  private activeLine: TransitLineId = 'line-1';
  private viewMode: DashboardViewMode = 'pinned'; // Default to showing only user's chosen favorite stations
  private settings: AppSettings;
  private pinnedIds: Set<string> = new Set();
  private cardComponents: Map<string, StationCardComponent> = new Map();
  private cardObserver?: IntersectionObserver = StationCardComponent.createSharedObserver();
  private arrivalsData: Map<string, StationArrivals> = new Map();
  private dirFetchTimestamps: Map<string, { dir1At: number; dir2At: number }> = new Map();
  private inFlightStationFetches: Set<string> = new Set();

  private activeAlerts: ServiceAlert[] = [];
  private alertsUpdatedAt: number | null = null;
  private alertsError: string | null = null;
  private isFetchingAlerts: boolean = false;
  private alertsAbortController?: AbortController;
  private lastAlertsPillKey: string = '';
  private isDestroyed: boolean = false;

  private stationsGridEl!: HTMLElement;
  private lineTitleEl!: HTMLElement;
  private lineSubtitleEl!: HTMLElement;
  private staleBannerEl!: HTMLElement;
  private alertsView!: AlertsViewComponent;
  private viewModePillWrap!: HTMLElement;
  private toastEl!: HTMLElement;

  private pollScheduler!: PollScheduler;
  private countdownTickTimer?: number;
  private toastTimeout?: number;
  private isFetching: boolean = false;
  private hasPendingFetch: boolean = false;
  private pendingFetchIsManual: boolean = false;
  private activeFetchId: number = 0;
  private fetchController?: AbortController;
  private myStationsBtn?: HTMLButtonElement;
  private allStationsBtn?: HTMLButtonElement;
  private alertsBtn?: HTMLButtonElement;

  constructor() {
    const root = document.getElementById('app');
    if (!root) throw new Error('Root #app element not found');
    this.appEl = root;

    this.settings = getSettings();
    this.activeLine = getActiveLine();
    this.pinnedIds = new Set(getPinnedStationIds());
    document.body.dataset.activeLine = this.activeLine;

    this.initUI();
    this.setupVisibilityListener();
    this.syncSecondTicker();

    this.pollScheduler = new PollScheduler({
      intervalMs: SYNC_INTERVAL_MS,
      // A reconnect bypasses short-lived caches so riders leaving a tunnel get fresh data
      onPoll: (reason) => {
        const bypassCache = reason === 'reconnect';
        this.fetchVisibleArrivals(bypassCache);
        void this.fetchAlerts(bypassCache);
      },
      onConnectivityChange: (isOnline) => {
        if (!isOnline) this.showStatusBanner(OFFLINE_MESSAGE);
      },
    });
    this.pollScheduler.start();
  }

  private initUI() {
    this.appEl.innerHTML = '';

    // Toast Container
    this.toastEl = createElement('div', 'app-toast');
    this.toastEl.id = 'app-toast';
    this.toastEl.setAttribute('role', 'status');
    this.toastEl.setAttribute('aria-live', 'polite');
    document.body.appendChild(this.toastEl);

    // Header with lazy modal loading
    this.header = new HeaderComponent(this.activeLine, {
      onLineChange: (line) => this.switchLine(line),
      onSettingsClick: () =>
        this.openLazyModal(() => this.getSettingsModal(), (modal) => modal.open()),
      onFaqClick: () =>
        this.openLazyModal(() => this.getFaqModal(), (modal) => modal.open()),
      onMapClick: () =>
        this.openLazyModal(() => this.getMapModal(), (modal) => modal.open()),
    });
    this.appEl.appendChild(this.header.getElement());

    // Main Container
    const main = createElement('main', 'main-content');
    const container = createElement('div', 'app-container');

    // Status / Stale Banner (hidden by default)
    this.staleBannerEl = createElement('div', 'status-banner hidden');
    this.staleBannerEl.setAttribute('role', 'status');
    this.staleBannerEl.setAttribute('aria-live', 'polite');
    container.appendChild(this.staleBannerEl);

    // Dashboard Toolbar
    const toolbar = createElement('div', 'dashboard-toolbar');
    const heading = createElement('div', 'toolbar-heading');
    this.lineTitleEl = createElement('h2', 'section-title');
    this.lineSubtitleEl = createElement('div', 'section-subtitle');
    heading.appendChild(this.lineTitleEl);
    heading.appendChild(this.lineSubtitleEl);

    const controls = createElement('div', 'toolbar-controls');

    // View Mode Toggle Pills (My Stations / All Stations / Alerts)
    this.viewModePillWrap = createElement('div', 'line-switcher');
    this.renderViewModePills();
    controls.appendChild(this.viewModePillWrap);

    toolbar.appendChild(heading);
    toolbar.appendChild(controls);
    container.appendChild(toolbar);

    // Shared View Transition Stage for Station Grid & Alerts View
    const viewStage = createElement('div', 'dashboard-view-stage');

    // Stations Grid
    this.stationsGridEl = createElement('div', 'stations-grid');
    viewStage.appendChild(this.stationsGridEl);

    // Service Alerts View (hidden by default)
    this.alertsView = new AlertsViewComponent({
      onBackToStations: () => this.setViewMode('pinned'),
      onRetry: () => void this.fetchAlerts(true),
    });
    this.alertsView.getElement().classList.add('hidden');
    viewStage.appendChild(this.alertsView.getElement());

    container.appendChild(viewStage);

    main.appendChild(container);
    this.appEl.appendChild(main);

    this.updateToolbarHeader();
    this.renderStationCards();
    this.syncAlertsUI();
  }

  private performViewTransition(updateFn: () => void): Promise<void> {
    const doc = document as Document & {
      startViewTransition?: (callback: () => void) => { finished?: Promise<unknown> };
    };
    const prefersReducedMotion =
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    if (typeof doc.startViewTransition === 'function' && !prefersReducedMotion) {
      const transition = doc.startViewTransition(updateFn);
      return Promise.resolve(transition?.finished)
        .then(() => undefined)
        .catch(() => undefined);
    }

    updateFn();
    return Promise.resolve();
  }

  private renderViewModePills() {
    if (!this.myStationsBtn || !this.allStationsBtn || !this.alertsBtn) {
      this.viewModePillWrap.innerHTML = '';

      this.myStationsBtn = createElement(
        'button',
        'view-mode-btn'
      ) as HTMLButtonElement;
      this.myStationsBtn.type = 'button';
      this.myStationsBtn.textContent = '★ My Stations';
      this.myStationsBtn.onclick = () => this.setViewMode('pinned');

      this.allStationsBtn = createElement(
        'button',
        'view-mode-btn'
      ) as HTMLButtonElement;
      this.allStationsBtn.type = 'button';
      this.allStationsBtn.textContent = 'All Stations';
      this.allStationsBtn.onclick = () => this.setViewMode('all');

      this.alertsBtn = createElement(
        'button',
        'view-mode-btn alerts-tab-btn'
      ) as HTMLButtonElement;
      this.alertsBtn.type = 'button';
      this.alertsBtn.textContent = 'Alerts';
      this.alertsBtn.setAttribute('aria-label', 'Alerts');
      this.alertsBtn.onclick = () => this.setViewMode('alerts');

      this.viewModePillWrap.appendChild(this.myStationsBtn);
      this.viewModePillWrap.appendChild(this.allStationsBtn);
      this.viewModePillWrap.appendChild(this.alertsBtn);
    }

    const activeLineClass = this.activeLine === 'line-1' ? 'line-1-active' : 'line-2-active';
    const inactiveLineClass = this.activeLine === 'line-1' ? 'line-2-active' : 'line-1-active';

    const syncButtonState = (btn: HTMLButtonElement, isActive: boolean) => {
      btn.classList.toggle('active', isActive);
      btn.classList.toggle(activeLineClass, isActive);
      btn.classList.remove(inactiveLineClass);
      btn.setAttribute('aria-pressed', String(isActive));
    };

    syncButtonState(this.myStationsBtn, this.viewMode === 'pinned');
    syncButtonState(this.allStationsBtn, this.viewMode === 'all');
    syncButtonState(this.alertsBtn, this.viewMode === 'alerts');
    this.renderAlertsButtonIndicator();
  }

  private setViewMode(nextMode: DashboardViewMode) {
    if (this.viewMode === nextMode) return;
    if (this.fetchController) {
      this.fetchController.abort();
      this.fetchController = undefined;
    }

    const previousMode = this.viewMode;
    this.viewMode = nextMode;

    if (nextMode === 'alerts') {
      this.stopSecondTicker();
      const transitionDone = this.performViewTransition(() => {
        this.stationsGridEl.classList.add('hidden');
        this.alertsView.getElement().classList.remove('hidden');
        this.updateToolbarHeader();
        this.renderViewModePills();
        this.syncAlertsView();
      });
      void transitionDone.then(() => {
        if (this.isDestroyed || this.viewMode !== 'alerts' || this.isFetchingAlerts) {
          return;
        }
        if (this.alertsUpdatedAt !== null) {
          void this.fetchAlerts(true);
        } else if (!this.alertsError) {
          void this.fetchAlerts(false);
        }
      });
      return;
    }

    void this.performViewTransition(() => {
      if (previousMode === 'alerts') {
        this.alertsView.getElement().classList.add('hidden');
        this.stationsGridEl.classList.remove('hidden');
      }
      this.updateToolbarHeader();
      this.renderViewModePills();
      this.renderStationCards();
      this.syncSecondTicker();
    });
    this.fetchVisibleArrivals();
  }

  private switchLine(line: TransitLineId) {
    if (this.activeLine === line) return;
    if (this.fetchController) {
      this.fetchController.abort();
      this.fetchController = undefined;
    }
    // Keep arrivalsData across line switch (Fix #3) — it's keyed by station ID
    // so Line 2 data doesn't collide with Line 1 data.
    this.activeLine = line;
    document.body.dataset.activeLine = line;
    setActiveLine(line);
    this.header.setActiveLine(line);
    void this.performViewTransition(() => {
      this.updateToolbarHeader();
      this.renderViewModePills();
      if (this.viewMode === 'alerts') {
        this.syncAlertsView();
      } else {
        this.renderStationCards();
      }
    });
    if (this.viewMode !== 'alerts') {
      this.fetchVisibleArrivals(true);
    }
  }

  private updateToolbarHeader() {
    if (this.viewMode === 'alerts') {
      const iconWrap = createElement('span', 'toolbar-alert-icon');
      iconWrap.setAttribute('aria-hidden', 'true');
      iconWrap.innerHTML = ICONS.alertTriangle;
      const titleText = document.createTextNode('Service Alerts');
      this.lineTitleEl.replaceChildren(iconWrap, titleText);

      this.lineSubtitleEl.textContent =
        this.alertsUpdatedAt !== null
          ? `Sound Transit Link feed · Updated ${formatClockTime(
              this.alertsUpdatedAt,
              this.settings.timeFormat24Hour
            )}`
          : 'Sound Transit Link GTFS-RT alerts feed';
      return;
    }

    const config = LINE_CONFIG[this.activeLine];
    this.lineTitleEl.innerHTML = `
      <span class="station-line-pill ${this.activeLine === 'line-1' ? 'line-1-circle' : 'line-2-circle'}">
        ${this.activeLine === 'line-1' ? '1' : '2'}
      </span>
      ${config.name} Live Departures
    `;
    this.lineSubtitleEl.textContent = `${config.terminusNorth} ⇄ ${config.terminusSouth}`;
  }

  private showToast(message: string, isAdded: boolean) {
    if (this.toastTimeout) {
      clearTimeout(this.toastTimeout);
    }

    const iconHtml = isAdded
      ? `<span class="toast-star filled">${ICONS.starFilled}</span>`
      : `<span class="toast-star">${ICONS.star}</span>`;

    this.toastEl.innerHTML = `${iconHtml}<span>${message}</span>`;
    this.toastEl.className = 'app-toast visible';

    this.toastTimeout = window.setTimeout(() => {
      this.toastEl.classList.remove('visible');
    }, 2400);
  }

  private getVisibleStations(): Station[] {
    const lineStations = getStationsByLine(this.activeLine);

    if (this.viewMode === 'pinned') {
      // Return only stations the user has pinned for this line
      return lineStations.filter((s) => this.pinnedIds.has(s.id));
    }

    // In "All Line Stations" view, maintain the natural geographic route order (North -> South)
    return lineStations;
  }

  /**
   * DOM-recycling station card renderer (Fix #1).
   * Diffs the new station list against existing cardComponents,
   * reusing cards that persist and only creating/destroying those that changed.
   */
  private renderStationCards() {
    const stations = this.getVisibleStations();

    if (stations.length === 0) {
      // Tear down all existing cards and show empty state
      this.cardComponents.forEach((card) => card.destroy());
      this.cardComponents.clear();
      this.stopSecondTicker();
      this.stationsGridEl.innerHTML = '';
      this.renderEmptyDashboard();
      return;
    }

    const newIds = new Set(stations.map(s => s.id));
    const savedDirectionFilters = getStationDirectionFilters();

    // 1. Remove cards that are no longer in the visible set
    for (const [id, card] of this.cardComponents) {
      if (!newIds.has(id)) {
        card.destroy();
        card.getElement().remove();
        this.cardComponents.delete(id);
      }
    }

    // 2. Create new cards for stations not yet rendered, and reorder all into correct position
    stations.forEach((station) => {
      let cardComp = this.cardComponents.get(station.id);

      if (!cardComp) {
        // New card
        const isPinned = this.pinnedIds.has(station.id);
        const initialFilter = savedDirectionFilters[station.id] || 'both';

        cardComp = new StationCardComponent(
          station,
          isPinned,
          this.settings.timeFormat24Hour,
          {
            onTogglePin: (id) => this.handleTogglePin(id),
            onDirectionFilterChange: (id, filter) => this.handleDirectionFilterChange(id, filter),
            onBecameVisible: (id) => this.handleStationBecameVisible(id),
          },
          initialFilter,
          this.cardObserver
        );

        this.cardComponents.set(station.id, cardComp);

        // If we already have cached arrivals data for this station, populate it
        const cached = this.arrivalsData.get(station.id);
        if (cached) {
          cardComp.updateArrivals(cached);
          cardComp.tickCountdowns();
        }
      }

      // Append in correct order (appendChild moves existing nodes)
      this.stationsGridEl.appendChild(cardComp.getElement());
    });

    // 3. Remove the empty-dashboard-card if it was previously rendered
    const emptyCard = this.stationsGridEl.querySelector('.empty-dashboard-card');
    if (emptyCard) emptyCard.remove();

    this.syncSecondTicker();
  }

  private handleDirectionFilterChange(stationId: string, filter: StationDirectionFilter) {
    setStationDirectionFilter(stationId, filter);
    this.ensureStationDirectionsFresh(stationId, filter);
  }

  private handleStationBecameVisible(stationId: string) {
    const filter = this.cardComponents.get(stationId)?.getDirectionFilter() ?? 'both';
    this.ensureStationDirectionsFresh(stationId, filter);
  }

  private pruneExpiredArrivals(arrivals: TransitArrival[], now: number): TransitArrival[] {
    return arrivals.filter(
      (a) => (a.predictedDepartureTime || a.scheduledDepartureTime) >= now - 60 * 1000
    );
  }

  private ensureStationDirectionsFresh(stationId: string, filter: StationDirectionFilter) {
    const station = getStationById(stationId);
    if (!station) return;

    const timestamps = this.dirFetchTimestamps.get(stationId);
    const now = Date.now();
    const needDir1 =
      (filter === 'both' || filter === 'dir1') &&
      (!timestamps?.dir1At || now - timestamps.dir1At > SYNC_INTERVAL_MS);
    const needDir2 =
      (filter === 'both' || filter === 'dir2') &&
      (!timestamps?.dir2At || now - timestamps.dir2At > SYNC_INTERVAL_MS);

    if (needDir1 || needDir2) {
      // Immediately prune expired departures on stale unpolled directions so departed trains
      // never flash as ARRIVING while the refresh is in flight (or if offline in a tunnel).
      const prev = this.arrivalsData.get(stationId);
      if (prev) {
        let nextDir1 = prev.direction1;
        let nextDir2 = prev.direction2;
        let nextDir1Fetched = prev.dir1Fetched !== false;
        let nextDir2Fetched = prev.dir2Fetched !== false;
        let nextDir1Unavailable = prev.dir1Unavailable;
        let nextDir2Unavailable = prev.dir2Unavailable;
        let changed = false;

        if (needDir1) {
          if (nextDir1Unavailable) {
            nextDir1Unavailable = false;
            nextDir1Fetched = false;
            changed = true;
          } else if (nextDir1Fetched) {
            const pruned1 = this.pruneExpiredArrivals(prev.direction1.arrivals, now);
            if (pruned1.length !== prev.direction1.arrivals.length) {
              nextDir1 = { ...prev.direction1, arrivals: pruned1 };
              changed = true;
            }
            if (pruned1.length === 0) {
              nextDir1Fetched = false;
              changed = true;
            }
          }
        }

        if (needDir2) {
          if (nextDir2Unavailable) {
            nextDir2Unavailable = false;
            nextDir2Fetched = false;
            changed = true;
          } else if (nextDir2Fetched) {
            const pruned2 = this.pruneExpiredArrivals(prev.direction2.arrivals, now);
            if (pruned2.length !== prev.direction2.arrivals.length) {
              nextDir2 = { ...prev.direction2, arrivals: pruned2 };
              changed = true;
            }
            if (pruned2.length === 0) {
              nextDir2Fetched = false;
              changed = true;
            }
          }
        }

        if (changed) {
          const updated: StationArrivals = {
            ...prev,
            lastUpdated: now,
            dir1Fetched: nextDir1Fetched,
            dir2Fetched: nextDir2Fetched,
            dir1Unavailable: nextDir1Unavailable,
            dir2Unavailable: nextDir2Unavailable,
            direction1: nextDir1,
            direction2: nextDir2,
          };
          this.arrivalsData.set(stationId, updated);
          this.cardComponents.get(stationId)?.updateArrivals(updated);
        }
      }

      const fetchFilter: StationDirectionFilter =
        needDir1 && needDir2 ? 'both' : needDir1 ? 'dir1' : 'dir2';
      this.fetchSingleStation(station, fetchFilter);
    }
  }

  private renderEmptyDashboard() {
    const config = LINE_CONFIG[this.activeLine];
    const emptyCard = createElement('div', 'empty-dashboard-card');

    const iconClass = this.activeLine === 'line-1' ? 'line-1-icon' : 'line-2-icon';
    const icon = createElement('div', `empty-dashboard-icon ${iconClass}`, ICONS.star);
    const title = createElement(
      'h3',
      'empty-dashboard-title',
      `No favorite stations on ${config.name}`
    );
    const desc = createElement(
      'p',
      'empty-dashboard-desc',
      'Choose the stations you use daily to keep your departure board fast and clean.'
    );

    const lineClass = this.activeLine === 'line-1' ? 'line-1-btn' : 'line-2-btn';
    const btn = createElement(
      'button',
      `empty-dashboard-btn ${lineClass}`,
      `${ICONS.plus} Add & Remove Stations`
    );
    btn.onclick = () =>
      this.openLazyModal(() => this.getPickerModal(), (modal) => modal.open(this.activeLine));

    emptyCard.appendChild(icon);
    emptyCard.appendChild(title);
    emptyCard.appendChild(desc);
    emptyCard.appendChild(btn);

    this.stationsGridEl.appendChild(emptyCard);
  }

  private handleTogglePin(stationId: string) {
    const isNowPinned = togglePinnedStation(stationId);
    if (isNowPinned) {
      this.pinnedIds.add(stationId);
    } else {
      this.pinnedIds.delete(stationId);
    }

    const station = getStationById(stationId);
    const stationName = station?.name || 'Station';

    if (this.viewMode === 'pinned') {
      // In "My Saved Stations" mode, surgical removal of unpinned card avoids rebuilding the entire grid
      if (!isNowPinned) {
        const card = this.cardComponents.get(stationId);
        if (card) {
          card.destroy();
          card.getElement().remove();
          this.cardComponents.delete(stationId);
        }
        if (this.cardComponents.size === 0) {
          this.stopSecondTicker();
          this.renderEmptyDashboard();
        }
      } else {
        this.renderStationCards();
        // Only fetch for the newly pinned station if its card is mounted on the active line
        if (station && this.cardComponents.has(station.id)) {
          this.fetchSingleStation(station);
        }
      }
    } else {
      // In "All Line Stations" mode, update ONLY the card's star button in-place without jarring jumps or closing accordion!
      const card = this.cardComponents.get(stationId);
      if (card) {
        card.setPinned(isNowPinned);
      }
    }

    this.showToast(
      isNowPinned ? `Saved "${stationName}" to Favorites` : `Removed "${stationName}" from Favorites`,
      isNowPinned
    );

    this.pickerModal?.refreshPinnedState(stationId);
  }

  private handleSettingsSaved(newSettings: AppSettings) {
    const timeFormatChanged = this.settings.timeFormat24Hour !== newSettings.timeFormat24Hour;
    this.settings = newSettings;

    if (timeFormatChanged) {
      this.cardComponents.forEach((card) => {
        card.setTimeFormat(newSettings.timeFormat24Hour);
      });
      if (this.viewMode === 'alerts') {
        this.updateToolbarHeader();
      }
      this.syncAlertsView();
    }
  }

  private showStatusBanner(message: string) {
    this.staleBannerEl.textContent = message;
    this.staleBannerEl.classList.remove('hidden');
  }

  private async openLazyModal<T>(
    loader: () => Promise<T>,
    openFn: (modal: T) => void
  ): Promise<void> {
    try {
      const modal = await loader();
      openFn(modal);
    } catch (err) {
      console.warn('Failed loading modal chunk:', err);
      this.showStatusBanner(
        navigator.onLine === false ? OFFLINE_MESSAGE : NETWORK_INTERRUPTED_MESSAGE
      );
    }
  }

  private readonly handleVisibilityChange = () => {
    if (document.hidden) {
      // Pause 1-second DOM ticks to save battery and CPU
      this.stopSecondTicker();
    } else {
      // Resume ticker when user refocuses tab
      this.syncSecondTicker();
      if (this.viewMode !== 'alerts') {
        const now = Date.now();
        this.cardComponents.forEach((card) => {
          if (card.isVisible) {
            card.tickCountdowns(now);
          }
        });
      }
    }
  };

  private setupVisibilityListener() {
    // Network polling pauses/resumes via PollScheduler; this only manages the 1-second countdown ticker.
    document.addEventListener('visibilitychange', this.handleVisibilityChange);
  }

  private mergeStationArrivals(
    station: Station,
    filter: StationDirectionFilter,
    result: Awaited<ReturnType<typeof fetchArrivalsForStation>>
  ): StationArrivals {
    const now = Date.now();
    const prev = this.arrivalsData.get(station.id);
    const prevTs = this.dirFetchTimestamps.get(station.id);
    const fetched1 = filter === 'both' || filter === 'dir1';
    const fetched2 = filter === 'both' || filter === 'dir2';

    this.dirFetchTimestamps.set(station.id, {
      dir1At: fetched1 ? now : (prevTs?.dir1At ?? 0),
      dir2At: fetched2 ? now : (prevTs?.dir2At ?? 0),
    });

    const preservedDir1 =
      !fetched1 && prev?.dir1Fetched
        ? { ...prev.direction1, arrivals: this.pruneExpiredArrivals(prev.direction1.arrivals, now) }
        : result.direction1;
    const preservedDir2 =
      !fetched2 && prev?.dir2Fetched
        ? { ...prev.direction2, arrivals: this.pruneExpiredArrivals(prev.direction2.arrivals, now) }
        : result.direction2;

    const data: StationArrivals = {
      station,
      lastUpdated: now,
      dir1Fetched: fetched1 || Boolean(prev?.dir1Fetched),
      dir2Fetched: fetched2 || Boolean(prev?.dir2Fetched),
      dir1Unavailable: fetched1 ? false : prev?.dir1Unavailable,
      dir2Unavailable: fetched2 ? false : prev?.dir2Unavailable,
      direction1: fetched1 ? result.direction1 : preservedDir1,
      direction2: fetched2 ? result.direction2 : preservedDir2,
    };
    this.arrivalsData.set(station.id, data);
    return data;
  }

  private handleStationFetchFailure(station: Station, failedFilter: StationDirectionFilter) {
    const card = this.cardComponents.get(station.id);
    const prev = this.arrivalsData.get(station.id);

    if (!prev) {
      card?.setUnavailable();
      return;
    }

    const fail1 = (failedFilter === 'both' || failedFilter === 'dir1') && !prev.dir1Fetched;
    const fail2 = (failedFilter === 'both' || failedFilter === 'dir2') && !prev.dir2Fetched;
    if (fail1 || fail2) {
      const updated: StationArrivals = {
        ...prev,
        dir1Unavailable: fail1 ? true : prev.dir1Unavailable,
        dir2Unavailable: fail2 ? true : prev.dir2Unavailable,
      };
      this.arrivalsData.set(station.id, updated);
      card?.updateArrivals(updated);
    }
  }

  private async fetchVisibleArrivals(isManual: boolean = false) {
    if (this.viewMode === 'alerts') return;
    if (this.isFetching) {
      this.hasPendingFetch = true;
      if (isManual) this.pendingFetchIsManual = true;
      return;
    }
    this.isFetching = true;
    const currentFetchId = ++this.activeFetchId;

    if (this.fetchController) {
      this.fetchController.abort();
    }
    this.fetchController = new AbortController();
    const currentSignal = this.fetchController.signal;

    const allStations = this.getVisibleStations();
    if (allStations.length === 0) {
      this.isFetching = false;
      return;
    }

    // In "All Stations" view, only poll stations whose cards are currently visible (or within buffer)
    // In "My Stations" view, keep all cards polled since it's already a small set (<= 10 cards)
    const stations = this.viewMode === 'all'
      ? allStations.filter((station) => {
          const card = this.cardComponents.get(station.id);
          return card ? card.isVisible : true;
        })
      : allStations;

    if (stations.length === 0) {
      this.isFetching = false;
      return;
    }

    let failedFetches = 0;
    const isCurrent = () => this.activeFetchId === currentFetchId && !currentSignal.aborted;

    try {
      // Sliding-window pool: a slow platform no longer holds back the remaining stations
      await runWithConcurrency(
        stations,
        MAX_CONCURRENT_STATION_FETCHES,
        async (station) => {
          try {
            const filter = this.cardComponents.get(station.id)?.getDirectionFilter() ?? 'both';
            const result = await fetchArrivalsForStation(station, isManual, currentSignal, filter);
            // If a newer fetch was initiated while this one was running, discard old response
            if (!isCurrent()) return;

            const data = this.mergeStationArrivals(station, filter, result);

            const card = this.cardComponents.get(station.id);
            if (card) {
              card.updateArrivals(data);
            }
          } catch (err) {
            if (!isCurrent()) return;
            failedFetches++;
            console.warn(`Failed fetching arrivals for ${station.name}:`, err);
            const filter = this.cardComponents.get(station.id)?.getDirectionFilter() ?? 'both';
            this.handleStationFetchFailure(station, filter);
          }
        },
        isCurrent
      );

      if (isCurrent()) {
        if (failedFetches === stations.length && stations.length > 0) {
          this.showStatusBanner(
            navigator.onLine === false ? OFFLINE_MESSAGE : NETWORK_INTERRUPTED_MESSAGE
          );
        } else {
          this.staleBannerEl.classList.add('hidden');
        }
      }
    } catch {
      if (isManual && isCurrent()) {
        this.showStatusBanner(NETWORK_INTERRUPTED_MESSAGE);
      }
    } finally {
      this.isFetching = false;
      if (this.hasPendingFetch) {
        this.hasPendingFetch = false;
        const manual = this.pendingFetchIsManual;
        this.pendingFetchIsManual = false;
        this.fetchVisibleArrivals(manual);
      }
    }
  }

  /**
   * Fetch arrivals for a single station and update its card.
   * Used for surgical updates (e.g. when a new station is pinned, scrolled into view,
   * or switched to a previously unfetched direction) to avoid re-fetching all visible stations.
   */
  private async fetchSingleStation(station: Station, explicitFilter?: StationDirectionFilter) {
    const filter =
      explicitFilter ??
      this.cardComponents.get(station.id)?.getDirectionFilter() ??
      getStationDirectionFilters()[station.id] ??
      'both';
    const fetchKey = `${station.id}:${filter}`;
    if (this.inFlightStationFetches.has(fetchKey)) return;
    this.inFlightStationFetches.add(fetchKey);

    try {
      const result = await fetchArrivalsForStation(station, false, undefined, filter);
      const data = this.mergeStationArrivals(station, filter, result);

      const card = this.cardComponents.get(station.id);
      if (card) {
        card.updateArrivals(data);
      }
    } catch (err) {
      console.warn(`Failed fetching arrivals for ${station.name}:`, err);
      this.handleStationFetchFailure(station, filter);
    } finally {
      this.inFlightStationFetches.delete(fetchKey);
    }
  }

  private stopSecondTicker() {
    if (this.countdownTickTimer !== undefined) {
      clearInterval(this.countdownTickTimer);
      this.countdownTickTimer = undefined;
    }
  }

  private async fetchAlerts(bypassCache: boolean = false): Promise<void> {
    if (this.alertsAbortController) {
      this.alertsAbortController.abort();
    }
    const controller = new AbortController();
    this.alertsAbortController = controller;
    this.isFetchingAlerts = true;
    this.syncAlertsView();

    try {
      const feed = await fetchServiceAlerts(bypassCache, controller.signal);
      if (this.alertsAbortController !== controller || controller.signal.aborted) {
        return;
      }
      this.activeAlerts = feed.alerts;
      this.alertsUpdatedAt = feed.updatedAt;
      this.alertsError = null;
    } catch (err) {
      if (
        this.alertsAbortController !== controller ||
        controller.signal.aborted
      ) {
        return;
      }
      this.alertsError =
        err instanceof Error && err.message
          ? err.message
          : 'Unable to reach Sound Transit service alerts feed.';
    } finally {
      if (this.alertsAbortController === controller) {
        this.alertsAbortController = undefined;
        this.isFetchingAlerts = false;
        this.syncAlertsUI();
      }
    }
  }

  private syncAlertsUI() {
    if (this.viewMode === 'alerts') {
      this.updateToolbarHeader();
    }
    this.renderAlertsButtonIndicator();
    this.syncAlertsView();
  }

  private renderAlertsButtonIndicator() {
    if (!this.alertsBtn) return;

    const count = this.activeAlerts.length;
    const hasSevere = this.activeAlerts.some((alert) => alert.severity === 'SEVERE');
    const hasWarning = count > 0 && !hasSevere;
    const nextPillKey = `${count}|${hasSevere ? '1' : '0'}|${hasWarning ? '1' : '0'}`;

    this.alertsBtn.classList.toggle('has-severe', hasSevere);
    this.alertsBtn.classList.toggle('has-warning', hasWarning);
    this.alertsBtn.setAttribute(
      'aria-label',
      count > 0 ? `Alerts, ${count} active` : 'Alerts'
    );

    if (this.lastAlertsPillKey === nextPillKey) {
      return;
    }
    this.lastAlertsPillKey = nextPillKey;

    const label = document.createElement('span');
    label.textContent = 'Alerts';

    if (count > 0) {
      const dot = createElement('span', 'alert-indicator-dot');
      dot.setAttribute('aria-hidden', 'true');

      const badge = createElement('span', 'alert-count-badge');
      badge.textContent = String(count);

      this.alertsBtn.replaceChildren(dot, label, badge);
    } else {
      this.alertsBtn.replaceChildren(label);
    }
  }

  private syncAlertsView() {
    if (!this.alertsView) return;
    this.alertsView.update({
      alerts: this.activeAlerts,
      activeLine: this.activeLine,
      updatedAt: this.alertsUpdatedAt,
      isLoading: this.isFetchingAlerts,
      error: this.alertsError,
      timeFormat24Hour: this.settings.timeFormat24Hour,
    });
  }

  private syncSecondTicker() {
    if (this.viewMode === 'alerts' || this.cardComponents.size === 0 || document.hidden) {
      this.stopSecondTicker();
      return;
    }
    if (this.countdownTickTimer !== undefined) return;

    // Ticks every second to smoothly update countdown values and approach bar
    // Only runs when at least one station card is mounted and the tab is visible
    this.countdownTickTimer = window.setInterval(() => {
      const now = Date.now();
      this.cardComponents.forEach((card) => {
        if (card.isVisible) {
          card.tickCountdowns(now);
        }
      });
    }, 1000);
  }

  public destroy() {
    this.isDestroyed = true;
    this.pollScheduler.stop();
    this.stopSecondTicker();
    if (this.toastTimeout) {
      clearTimeout(this.toastTimeout);
      this.toastTimeout = undefined;
    }
    if (this.fetchController) {
      this.fetchController.abort();
      this.fetchController = undefined;
    }
    if (this.alertsAbortController) {
      this.alertsAbortController.abort();
      this.alertsAbortController = undefined;
    }
    document.removeEventListener('visibilitychange', this.handleVisibilityChange);
    this.cardComponents.forEach((card) => card.destroy());
    this.cardComponents.clear();
    this.cardObserver?.disconnect();
    this.toastEl.remove();
  }
}

// Error Boundary: Bootstrap application safely with recovery fallback
function initApp(): void {
  try {
    new TransitTrackerApp();
  } catch (err) {
    console.error('App initialization failed:', err);
    const root = document.getElementById('app');
    if (root) {
      root.innerHTML = `
        <div style="padding: 2.5rem 1.5rem; text-align: center; color: #f8fafc; max-width: 480px; margin: 4rem auto; background: #151d2a; border-radius: 16px; border: 1px solid rgba(255,255,255,0.1); font-family: 'Inter', -apple-system, sans-serif;">
          <div style="font-size: 2.5rem; margin-bottom: 1rem;">⚠️</div>
          <h2 style="font-family: 'Outfit', sans-serif; font-size: 1.5rem; margin-bottom: 0.5rem; color: #f8fafc;">Unable to load tracker</h2>
          <p style="color: #94a3b8; font-size: 0.95rem; line-height: 1.5; margin-bottom: 1.5rem;">An unexpected error occurred while initializing the application. You can try reloading the page or resetting your saved settings.</p>
          <div style="display: flex; gap: 0.75rem; justify-content: center; flex-wrap: wrap;">
            <button onclick="location.reload()" style="background: #008542; color: #fff; border: none; border-radius: 8px; padding: 0.65rem 1.25rem; font-weight: 600; cursor: pointer; font-size: 0.9rem;">Reload Page</button>
            <button onclick="localStorage.clear();location.reload()" style="background: rgba(255,255,255,0.08); color: #f8fafc; border: 1px solid rgba(255,255,255,0.2); border-radius: 8px; padding: 0.65rem 1.25rem; font-weight: 500; cursor: pointer; font-size: 0.9rem;">Reset &amp; Reload</button>
          </div>
        </div>`;
    }
  }
}

if (!import.meta.env.VITEST) {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      initApp();
    });
  } else {
    initApp();
  }
}

/**
 * Register Service Worker for offline PWA support in production builds, and clear
 * any lingering SW/cache in local Vite dev so live HMR modules are never shadowed.
 */
if ('serviceWorker' in navigator && !import.meta.env.VITEST) {
  if (import.meta.env.DEV) {
    navigator.serviceWorker
      .getRegistrations()
      .then((registrations) => Promise.all(registrations.map((reg) => reg.unregister())))
      .catch(() => undefined);
    if ('caches' in window) {
      caches
        .keys()
        .then((keys) =>
          Promise.all(
            keys
              .filter((key) => key.startsWith('link-tracker-'))
              .map((key) => caches.delete(key))
          )
        )
        .catch(() => undefined);
    }
  } else if (
    window.location.protocol === 'https:' ||
    window.location.hostname === 'localhost' ||
    window.location.hostname === '127.0.0.1'
  ) {
    window.addEventListener('load', () => {
      const swUrl = new URL('./sw.js', window.location.href).href;
      navigator.serviceWorker.register(swUrl)
        .then((registration) => {
          registration.addEventListener('updatefound', () => {
            const newWorker = registration.installing;
            if (newWorker) {
              newWorker.addEventListener('statechange', () => {
                if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                  console.info('New Seattle Light Rail Tracker update available.');
                }
              });
            }
          });
        })
        .catch((err) => {
          console.warn('PWA Service Worker registration failed:', err);
        });
    });
  }
}

