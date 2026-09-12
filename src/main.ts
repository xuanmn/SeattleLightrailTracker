import './styles/theme.css';
import './styles/layout.css';
import './styles/board.css';
import './styles/map.css';

import { FaqModal } from './components/FaqModal';
import { HeaderComponent } from './components/Header';
import { SettingsModal } from './components/SettingsModal';
import { StationCardComponent } from './components/StationCard';
import { StationPickerModal } from './components/StationPickerModal';
import { SystemMapModal } from './components/SystemMapModal';
import { getStationById, getStationsByLine, LINE_CONFIG } from './data/stations';
import { fetchArrivalsForStation } from './services/oba-api';
import {
  getActiveLine,
  getPinnedStationIds,
  getSettings,
  getStationDirectionFilters,
  setActiveLine,
  setStationDirectionFilter,
  togglePinnedStation,
} from './services/storage';
import { AppSettings, Station, StationArrivals, TransitLineId } from './types/transit';
import { createElement, ICONS } from './utils/dom';

const SYNC_INTERVAL_MS = 60 * 1000; // Fixed 60-second real-time sync cycle

class TransitTrackerApp {
  private appEl: HTMLElement;
  private header!: HeaderComponent;
  private pickerModal!: StationPickerModal;
  private settingsModal!: SettingsModal;
  private faqModal!: FaqModal;
  private mapModal!: SystemMapModal;

  private activeLine: TransitLineId = 'line-1';
  private showOnlyPinned: boolean = true; // Default to showing only user's chosen favorite stations
  private settings: AppSettings;
  private pinnedIds: string[] = [];
  private cardComponents: Map<string, StationCardComponent> = new Map();
  private arrivalsData: Map<string, StationArrivals> = new Map();

  private stationsGridEl!: HTMLElement;
  private lineTitleEl!: HTMLElement;
  private lineSubtitleEl!: HTMLElement;
  private staleBannerEl!: HTMLElement;
  private viewModePillWrap!: HTMLElement;
  private toastEl!: HTMLElement;

  private pollIntervalTimer?: number;
  private countdownTickTimer?: number;
  private toastTimeout?: number;
  private isFetching: boolean = false;
  private hasPendingFetch: boolean = false;
  private activeFetchId: number = 0;

  constructor() {
    const root = document.getElementById('app');
    if (!root) throw new Error('Root #app element not found');
    this.appEl = root;

    this.settings = getSettings();
    this.activeLine = getActiveLine();
    this.pinnedIds = getPinnedStationIds();
    document.body.dataset.activeLine = this.activeLine;

    this.initUI();
    this.setupVisibilityListener();
    this.startPolling();
    this.startSecondTicker();
  }

  private initUI() {
    this.appEl.innerHTML = '';

    // Modals
    this.pickerModal = new StationPickerModal({
      onTogglePin: (stationId) => this.handleTogglePin(stationId),
      isStationPinned: (stationId) => this.pinnedIds.includes(stationId),
    });

    this.settingsModal = new SettingsModal({
      onSettingsSaved: (newSettings) => this.handleSettingsSaved(newSettings),
    });

    this.faqModal = new FaqModal();
    this.mapModal = new SystemMapModal();

    // Toast Container
    this.toastEl = createElement('div', 'app-toast');
    this.toastEl.id = 'app-toast';
    document.body.appendChild(this.toastEl);

    // Header
    this.header = new HeaderComponent(this.activeLine, {
      onLineChange: (line) => this.switchLine(line),
      onSettingsClick: () => this.settingsModal.open(),
      onFaqClick: () => this.faqModal.open(),
      onMapClick: () => this.mapModal.open(),
    });
    this.appEl.appendChild(this.header.getElement());

    // Main Container
    const main = createElement('main', 'main-content');
    const container = createElement('div', 'app-container');

    // Status / Stale Banner (hidden by default)
    this.staleBannerEl = createElement('div', 'status-banner hidden');
    container.appendChild(this.staleBannerEl);

    // Dashboard Toolbar
    const toolbar = createElement('div', 'dashboard-toolbar');
    const heading = createElement('div', 'toolbar-heading');
    this.lineTitleEl = createElement('h2', 'section-title');
    this.lineSubtitleEl = createElement('div', 'section-subtitle');
    heading.appendChild(this.lineTitleEl);
    heading.appendChild(this.lineSubtitleEl);

    const controls = createElement('div', 'toolbar-controls');

    // View Mode Toggle Pills (My Stations vs All Stations)
    this.viewModePillWrap = createElement('div', 'line-switcher');
    this.renderViewModePills();
    controls.appendChild(this.viewModePillWrap);

    toolbar.appendChild(heading);
    toolbar.appendChild(controls);
    container.appendChild(toolbar);

    // Stations Grid
    this.stationsGridEl = createElement('div', 'stations-grid');
    container.appendChild(this.stationsGridEl);

    main.appendChild(container);
    this.appEl.appendChild(main);

    this.updateToolbarHeader();
    this.renderStationCards();
  }

  private performViewTransition(updateFn: () => void) {
    if (
      'startViewTransition' in document &&
      !window.matchMedia('(prefers-reduced-motion: reduce)').matches
    ) {
      (document as unknown as { startViewTransition: (fn: () => void) => void }).startViewTransition(updateFn);
    } else {
      updateFn();
    }
  }

  private renderViewModePills() {
    this.viewModePillWrap.innerHTML = '';

    const myBtn = createElement(
      'button',
      `view-mode-btn ${this.showOnlyPinned ? 'active' : ''}`
    );
    myBtn.innerHTML = `★ My Stations`;
    if (this.showOnlyPinned) {
      myBtn.classList.add(this.activeLine === 'line-1' ? 'line-1-active' : 'line-2-active');
    }
    myBtn.onclick = () => {
      this.showOnlyPinned = true;
      this.performViewTransition(() => {
        this.renderViewModePills();
        this.renderStationCards();
      });
      this.fetchVisibleArrivals();
    };

    const allBtn = createElement(
      'button',
      `view-mode-btn ${!this.showOnlyPinned ? 'active' : ''}`
    );
    allBtn.innerHTML = `All Stations`;
    if (!this.showOnlyPinned) {
      allBtn.classList.add(this.activeLine === 'line-1' ? 'line-1-active' : 'line-2-active');
    }
    allBtn.onclick = () => {
      this.showOnlyPinned = false;
      this.performViewTransition(() => {
        this.renderViewModePills();
        this.renderStationCards();
      });
      this.fetchVisibleArrivals();
    };

    this.viewModePillWrap.appendChild(myBtn);
    this.viewModePillWrap.appendChild(allBtn);
  }

  private switchLine(line: TransitLineId) {
    this.activeLine = line;
    document.body.dataset.activeLine = line;
    setActiveLine(line);
    this.header.setActiveLine(line);
    this.performViewTransition(() => {
      this.updateToolbarHeader();
      this.renderViewModePills();
      this.renderStationCards();
    });
    this.fetchVisibleArrivals(true);
  }

  private updateToolbarHeader() {
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

    if (this.showOnlyPinned) {
      // Return only stations the user has pinned for this line
      return lineStations.filter((s) => this.pinnedIds.includes(s.id));
    }

    // In "All Line Stations" view, maintain the natural geographic route order (North -> South)
    return lineStations;
  }

  private renderStationCards() {
    this.stationsGridEl.innerHTML = '';
    this.cardComponents.clear();

    const stations = this.getVisibleStations();

    if (stations.length === 0) {
      this.renderEmptyDashboard();
      return;
    }

    const savedDirectionFilters = getStationDirectionFilters();

    stations.forEach((station) => {
      const isPinned = this.pinnedIds.includes(station.id);
      const initialFilter = savedDirectionFilters[station.id] || 'both';

      const cardComp = new StationCardComponent(
        station,
        isPinned,
        this.settings.timeFormat24Hour,
        {
          onTogglePin: (id) => this.handleTogglePin(id),
          onDirectionFilterChange: (id, filter) => {
            setStationDirectionFilter(id, filter);
          },
        },
        initialFilter
      );

      this.cardComponents.set(station.id, cardComp);
      this.stationsGridEl.appendChild(cardComp.getElement());

      // If we already have cached arrivals data for this station, populate it
      const cached = this.arrivalsData.get(station.id);
      if (cached) {
        cardComp.updateArrivals(cached);
      }
    });
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
    btn.onclick = () => this.pickerModal.open(this.activeLine);

    emptyCard.appendChild(icon);
    emptyCard.appendChild(title);
    emptyCard.appendChild(desc);
    emptyCard.appendChild(btn);

    this.stationsGridEl.appendChild(emptyCard);
  }

  private handleTogglePin(stationId: string) {
    const isNowPinned = togglePinnedStation(stationId);
    this.pinnedIds = getPinnedStationIds();

    const station = getStationById(stationId);
    const stationName = station?.name || 'Station';

    // Dynamically refresh the My Stations pill count
    this.renderViewModePills();

    if (this.showOnlyPinned) {
      // In "My Saved Stations" mode, removing/adding a card refreshes the visible list
      this.renderStationCards();
      // Only fetch for the newly pinned station instead of re-fetching all visible stations
      if (isNowPinned && station) {
        this.fetchSingleStation(station);
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

    this.pickerModal.refreshPinnedState();
  }

  private handleSettingsSaved(newSettings: AppSettings) {
    this.settings = newSettings;

    this.cardComponents.forEach((card) => {
      card.setTimeFormat(newSettings.timeFormat24Hour);
    });

    this.fetchVisibleArrivals(true);
  }

  private setupVisibilityListener() {
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        // Pause 1-second DOM ticks and background network polling to save battery, CPU, and heap
        if (this.countdownTickTimer) {
          clearInterval(this.countdownTickTimer);
          this.countdownTickTimer = undefined;
        }
        if (this.pollIntervalTimer) {
          clearInterval(this.pollIntervalTimer);
          this.pollIntervalTimer = undefined;
        }
      } else {
        // Resume ticker and polling when user refocuses tab
        this.startSecondTicker();
        this.startPolling();
        this.cardComponents.forEach((card) => card.tickCountdowns());
      }
    });
  }

  private async fetchVisibleArrivals(isManual: boolean = false) {
    if (this.isFetching) {
      this.hasPendingFetch = true;
      return;
    }
    this.isFetching = true;
    const currentFetchId = ++this.activeFetchId;

    const stations = this.getVisibleStations();
    if (stations.length === 0) {
      this.isFetching = false;
      return;
    }

    const CHUNK_SIZE = 6;
    let failedFetches = 0;

    try {
      for (let i = 0; i < stations.length; i += CHUNK_SIZE) {
        if (this.activeFetchId !== currentFetchId) break;
        const chunk = stations.slice(i, i + CHUNK_SIZE);
        await Promise.all(
          chunk.map(async (station) => {
            try {
              const result = await fetchArrivalsForStation(station, undefined, isManual);
              // If a newer fetch was initiated while this one was running, discard old response
              if (this.activeFetchId !== currentFetchId) return;

              const data: StationArrivals = {
                station,
                lastUpdated: Date.now(),
                direction1: result.direction1,
                direction2: result.direction2,
              };
              this.arrivalsData.set(station.id, data);

              const card = this.cardComponents.get(station.id);
              if (card) {
                card.updateArrivals(data);
              }
            } catch (err) {
              failedFetches++;
              console.warn(`Failed fetching arrivals for ${station.name}:`, err);
            }
          })
        );
      }

      if (this.activeFetchId === currentFetchId) {
        if (failedFetches === stations.length && stations.length > 0) {
          this.staleBannerEl.classList.remove('hidden');
          this.staleBannerEl.textContent =
            'Network connection interrupted. Showing estimated transit schedules while reconnecting...';
        } else {
          this.staleBannerEl.classList.add('hidden');
        }
      }
    } catch {
      if (isManual && this.activeFetchId === currentFetchId) {
        this.staleBannerEl.classList.remove('hidden');
        this.staleBannerEl.textContent =
          'Network connection interrupted. Showing estimated transit schedules while reconnecting...';
      }
    } finally {
      this.isFetching = false;
      if (this.hasPendingFetch) {
        this.hasPendingFetch = false;
        this.fetchVisibleArrivals();
      }
    }
  }

  /**
   * Fetch arrivals for a single station and update its card.
   * Used for surgical updates (e.g. when a new station is pinned) to avoid
   * re-fetching all visible stations.
   */
  private async fetchSingleStation(station: Station) {
    try {
      const result = await fetchArrivalsForStation(station);
      const data: StationArrivals = {
        station,
        lastUpdated: Date.now(),
        direction1: result.direction1,
        direction2: result.direction2,
      };
      this.arrivalsData.set(station.id, data);

      const card = this.cardComponents.get(station.id);
      if (card) {
        card.updateArrivals(data);
      }
    } catch (err) {
      console.warn(`Failed fetching arrivals for ${station.name}:`, err);
    }
  }

  private startPolling() {
    if (this.pollIntervalTimer) {
      clearInterval(this.pollIntervalTimer);
    }

    this.fetchVisibleArrivals();
    // Synchronize every 60 seconds
    this.pollIntervalTimer = window.setInterval(() => {
      this.fetchVisibleArrivals();
    }, SYNC_INTERVAL_MS);
  }

  private startSecondTicker() {
    if (this.countdownTickTimer) {
      clearInterval(this.countdownTickTimer);
    }

    // Ticks every second to smoothly update countdown values and clock
    this.countdownTickTimer = window.setInterval(() => {
      this.cardComponents.forEach((card) => {
        card.tickCountdowns();
      });
    }, 1000);
  }
}

// Bootstrap application immediately when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    new TransitTrackerApp();
  });
} else {
  new TransitTrackerApp();
}

/**
 * Register Service Worker for offline PWA support in underground stations
 */
if (
  typeof window !== 'undefined' &&
  'serviceWorker' in navigator &&
  (window.location.protocol === 'https:' ||
    window.location.hostname === 'localhost' ||
    window.location.hostname === '127.0.0.1')
) {
  window.addEventListener('load', () => {
    const swUrl = new URL('./sw.js', window.location.href).href;
    navigator.serviceWorker.register(swUrl).catch((err) => {
      console.warn('PWA Service Worker registration failed:', err);
    });
  });
}

