import './styles/theme.css';
import './styles/layout.css';
import './styles/board.css';
import './styles/map.css';

import type { FaqModal } from './components/FaqModal';
import { HeaderComponent } from './components/Header';
import { SettingsModal } from './components/SettingsModal';
import { StationCardComponent } from './components/StationCard';
import { StationPickerModal } from './components/StationPickerModal';
import type { SystemMapModal } from './components/SystemMapModal';
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
  private faqModal?: FaqModal;
  private mapModal?: SystemMapModal;

  private activeLine: TransitLineId = 'line-1';
  private showOnlyPinned: boolean = true; // Default to showing only user's chosen favorite stations
  private settings: AppSettings;
  private pinnedIds: Set<string> = new Set();
  private cardComponents: Map<string, StationCardComponent> = new Map();
  private arrivalsData: Map<string, StationArrivals> = new Map();
  private inFlightStationFetches: Set<string> = new Set();

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
  private pendingFetchIsManual: boolean = false;
  private activeFetchId: number = 0;
  private fetchController?: AbortController;
  private myStationsBtn?: HTMLButtonElement;
  private allStationsBtn?: HTMLButtonElement;

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
    this.startPolling();
    this.startSecondTicker();
  }

  private initUI() {
    this.appEl.innerHTML = '';

    // Modals
    this.pickerModal = new StationPickerModal({
      onTogglePin: (stationId) => this.handleTogglePin(stationId),
      isStationPinned: (stationId) => this.pinnedIds.has(stationId),
    });

    this.settingsModal = new SettingsModal({
      onSettingsSaved: (newSettings) => this.handleSettingsSaved(newSettings),
    });

    // Toast Container
    this.toastEl = createElement('div', 'app-toast');
    this.toastEl.id = 'app-toast';
    document.body.appendChild(this.toastEl);

    // Header with lazy modal loading
    this.header = new HeaderComponent(this.activeLine, {
      onLineChange: (line) => this.switchLine(line),
      onSettingsClick: () => this.settingsModal.open(),
      onFaqClick: async () => {
        if (!this.faqModal) {
          const { FaqModal } = await import('./components/FaqModal');
          this.faqModal = new FaqModal();
        }
        this.faqModal.open();
      },
      onMapClick: async () => {
        if (!this.mapModal) {
          const { SystemMapModal } = await import('./components/SystemMapModal');
          this.mapModal = new SystemMapModal();
        }
        this.mapModal.open();
      },
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
    const doc = document as Document & {
      startViewTransition?: (callback: () => void) => void;
    };
    if (
      typeof doc.startViewTransition === 'function' &&
      !window.matchMedia('(prefers-reduced-motion: reduce)').matches
    ) {
      doc.startViewTransition(updateFn);
    } else {
      updateFn();
    }
  }

  private renderViewModePills() {
    if (!this.myStationsBtn || !this.allStationsBtn) {
      this.viewModePillWrap.innerHTML = '';

      this.myStationsBtn = createElement(
        'button',
        'view-mode-btn'
      ) as HTMLButtonElement;
      this.myStationsBtn.innerHTML = `★ My Stations`;
      this.myStationsBtn.onclick = () => {
        if (this.showOnlyPinned) return;
        this.showOnlyPinned = true;
        this.performViewTransition(() => {
          this.renderViewModePills();
          this.renderStationCards();
        });
        this.fetchVisibleArrivals();
      };

      this.allStationsBtn = createElement(
        'button',
        'view-mode-btn'
      ) as HTMLButtonElement;
      this.allStationsBtn.innerHTML = `All Stations`;
      this.allStationsBtn.onclick = () => {
        if (!this.showOnlyPinned) return;
        this.showOnlyPinned = false;
        this.performViewTransition(() => {
          this.renderViewModePills();
          this.renderStationCards();
        });
        this.fetchVisibleArrivals();
      };

      this.viewModePillWrap.appendChild(this.myStationsBtn);
      this.viewModePillWrap.appendChild(this.allStationsBtn);
    }

    const activeLineClass = this.activeLine === 'line-1' ? 'line-1-active' : 'line-2-active';
    const inactiveLineClass = this.activeLine === 'line-1' ? 'line-2-active' : 'line-1-active';

    this.myStationsBtn.classList.toggle('active', this.showOnlyPinned);
    this.myStationsBtn.classList.toggle(activeLineClass, this.showOnlyPinned);
    this.myStationsBtn.classList.remove(inactiveLineClass);

    this.allStationsBtn.classList.toggle('active', !this.showOnlyPinned);
    this.allStationsBtn.classList.toggle(activeLineClass, !this.showOnlyPinned);
    this.allStationsBtn.classList.remove(inactiveLineClass);
  }

  private switchLine(line: TransitLineId) {
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
            onDirectionFilterChange: (id, filter) => {
              setStationDirectionFilter(id, filter);
            },
            onBecameVisible: (id) => this.handleStationBecameVisible(id),
          },
          initialFilter
        );

        this.cardComponents.set(station.id, cardComp);

        // If we already have cached arrivals data for this station, populate it
        const cached = this.arrivalsData.get(station.id);
        if (cached) {
          cardComp.updateArrivals(cached);
        }
      }

      // Append in correct order (appendChild moves existing nodes)
      this.stationsGridEl.appendChild(cardComp.getElement());
    });

    // 3. Remove the empty-dashboard-card if it was previously rendered
    const emptyCard = this.stationsGridEl.querySelector('.empty-dashboard-card');
    if (emptyCard) emptyCard.remove();
  }

  private handleStationBecameVisible(stationId: string) {
    const cached = this.arrivalsData.get(stationId);
    const isStale = !cached || Date.now() - cached.lastUpdated > SYNC_INTERVAL_MS;
    if (isStale) {
      const station = getStationById(stationId);
      if (station) {
        this.fetchSingleStation(station);
      }
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
    btn.onclick = () => this.pickerModal.open(this.activeLine);

    emptyCard.appendChild(icon);
    emptyCard.appendChild(title);
    emptyCard.appendChild(desc);
    emptyCard.appendChild(btn);

    this.stationsGridEl.appendChild(emptyCard);
  }

  private handleTogglePin(stationId: string) {
    const isNowPinned = togglePinnedStation(stationId);
    this.pinnedIds = new Set(getPinnedStationIds());

    const station = getStationById(stationId);
    const stationName = station?.name || 'Station';

    // Dynamically refresh the My Stations pill count
    this.renderViewModePills();

    if (this.showOnlyPinned) {
      // In "My Saved Stations" mode, surgical removal of unpinned card avoids rebuilding the entire grid
      if (!isNowPinned) {
        const card = this.cardComponents.get(stationId);
        if (card) {
          card.destroy();
          card.getElement().remove();
          this.cardComponents.delete(stationId);
        }
        if (this.cardComponents.size === 0) {
          this.renderEmptyDashboard();
        }
      } else {
        this.renderStationCards();
        // Only fetch for the newly pinned station instead of re-fetching all visible stations
        if (station) {
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
    const stations = !this.showOnlyPinned
      ? allStations.filter((station) => {
          const card = this.cardComponents.get(station.id);
          return card ? card.isVisible : true;
        })
      : allStations;

    if (stations.length === 0) {
      this.isFetching = false;
      return;
    }

    const CHUNK_SIZE = 6;
    let failedFetches = 0;

    try {
      for (let i = 0; i < stations.length; i += CHUNK_SIZE) {
        if (this.activeFetchId !== currentFetchId || currentSignal.aborted) break;
        const chunk = stations.slice(i, i + CHUNK_SIZE);

        await Promise.all(
          chunk.map(async (station) => {
            try {
              const result = await fetchArrivalsForStation(station, isManual, currentSignal);
              // If a newer fetch was initiated while this one was running, discard old response
              if (this.activeFetchId !== currentFetchId || currentSignal.aborted) return;

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
              const card = this.cardComponents.get(station.id);
              if (card && !this.arrivalsData.has(station.id)) {
                card.setUnavailable();
              }
            }
          })
        );
      }

      if (this.activeFetchId === currentFetchId) {
        if (failedFetches === stations.length && stations.length > 0) {
          this.staleBannerEl.classList.remove('hidden');
          this.staleBannerEl.textContent =
            'Network connection interrupted. Unable to reach live transit servers while reconnecting...';
        } else {
          this.staleBannerEl.classList.add('hidden');
        }
      }
    } catch {
      if (isManual && this.activeFetchId === currentFetchId) {
        this.staleBannerEl.classList.remove('hidden');
        this.staleBannerEl.textContent =
          'Network connection interrupted. Unable to reach live transit servers while reconnecting...';
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
   * Used for surgical updates (e.g. when a new station is pinned or scrolled into view)
   * to avoid re-fetching all visible stations.
   */
  private async fetchSingleStation(station: Station) {
    if (this.inFlightStationFetches.has(station.id)) return;
    this.inFlightStationFetches.add(station.id);

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
      const card = this.cardComponents.get(station.id);
      if (card && !this.arrivalsData.has(station.id)) {
        card.setUnavailable();
      }
    } finally {
      this.inFlightStationFetches.delete(station.id);
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
    // Fix #5: Only tick cards that are visible in the viewport
    this.countdownTickTimer = window.setInterval(() => {
      this.cardComponents.forEach((card) => {
        if (card.isVisible) {
          card.tickCountdowns();
        }
      });
    }, 1000);
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

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    initApp();
  });
} else {
  initApp();
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

