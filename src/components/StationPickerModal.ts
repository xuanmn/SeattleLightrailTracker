import { STATIONS } from '../data/stations';
import { Station, TransitLineId } from '../types/transit';
import { createElement, ICONS } from '../utils/dom';
import { lockBodyScroll, unlockBodyScroll } from '../utils/scrollLock';
import { attachBottomSheetSwipe } from '../utils/bottomSheetGesture';

interface StationPickerCallbacks {
  onTogglePin: (stationId: string) => void;
  isStationPinned: (stationId: string) => boolean;
}

export class StationPickerModal {
  private overlay: HTMLElement;
  private listContainer!: HTMLElement;
  private activeFilterLine: TransitLineId = 'line-1';
  private searchQuery: string = '';
  private searchInput!: HTMLInputElement;
  private callbacks: StationPickerCallbacks;
  private tab1Btn!: HTMLButtonElement;
  private tab2Btn!: HTMLButtonElement;

  private handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Escape' && this.overlay.classList.contains('open')) {
      this.close();
    }
  };

  constructor(callbacks: StationPickerCallbacks) {
    this.callbacks = callbacks;
    this.overlay = this.render();
    document.body.appendChild(this.overlay);
  }

  public open(initialLine?: TransitLineId) {
    if (this.overlay.classList.contains('open')) return;
    if (this.searchInput) {
      this.searchInput.value = '';
      this.searchQuery = '';
    }
    if (initialLine) {
      this.setFilter(initialLine);
    } else {
      this.setFilter(this.activeFilterLine);
    }
    if (this.listContainer) {
      this.listContainer.scrollTop = 0;
    }
    this.overlay.classList.add('open');
    lockBodyScroll();
    window.addEventListener('keydown', this.handleKeyDown);
  }

  public close() {
    if (!this.overlay.classList.contains('open')) return;
    this.overlay.classList.remove('open');
    unlockBodyScroll();
    window.removeEventListener('keydown', this.handleKeyDown);
  }

  public refreshPinnedState() {
    this.renderStationsList();
  }

  private setFilter(line: TransitLineId) {
    this.activeFilterLine = line;
    this.tab1Btn.className = `filter-pill ${line === 'line-1' ? 'active line-1' : ''}`;
    this.tab2Btn.className = `filter-pill ${line === 'line-2' ? 'active line-2' : ''}`;
    this.renderStationsList();
  }

  private renderStationsList() {
    this.listContainer.innerHTML = '';

    const query = this.searchQuery.trim().toLowerCase();

    const filtered = STATIONS.filter((station) => {
      const matchesLine = station.lines.includes(this.activeFilterLine);
      if (!matchesLine) return false;
      if (!query) return true;
      return (
        station.name.toLowerCase().includes(query) ||
        (station.shortName && station.shortName.toLowerCase().includes(query)) ||
        (station.address && station.address.toLowerCase().includes(query))
      );
    });

    if (filtered.length === 0) {
      const empty = createElement('div', 'departures-empty');
      empty.textContent = query
        ? `No stations matching "${query}" on ${this.activeFilterLine === 'line-1' ? '1 Line' : '2 Line'}`
        : 'No stations found';
      this.listContainer.appendChild(empty);
      return;
    }

    filtered.forEach((station) => {
      const item = this.createStationRow(station);
      this.listContainer.appendChild(item);
    });
  }

  private createStationRow(station: Station): HTMLElement {
    const isLine1 = station.lines.includes('line-1');
    const isPinned = this.callbacks.isStationPinned(station.id);

    const row = createElement('div', 'picker-station-row');

    const info = createElement('div', 'brand-section');

    const linePill = createElement(
      'span',
      `station-line-pill ${isLine1 ? 'line-1-circle' : 'line-2-circle'}`,
      isLine1 ? '1' : '2'
    );

    const textGroup = createElement('div', 'station-name-wrap');
    const name = createElement('div', 'station-name');

    name.textContent = station.name;

    if (station.shortName) {
      const sub = createElement('div', 'station-subname', station.shortName);
      textGroup.appendChild(name);
      textGroup.appendChild(sub);
    } else {
      textGroup.appendChild(name);
    }

    info.appendChild(linePill);
    info.appendChild(textGroup);

    // Action button
    const actionBtn = createElement(
      'button',
      `picker-add-btn ${isPinned ? 'pinned' : ''}`
    ) as HTMLButtonElement;
    actionBtn.type = 'button';

    if (isPinned) {
      actionBtn.innerHTML = `<span class="btn-text-default">✓ Added</span><span class="btn-text-hover">✕ Remove</span>`;
    } else {
      actionBtn.textContent = '+ Add Station';
    }

    row.dataset.stationId = station.id;
    row.appendChild(info);
    row.appendChild(actionBtn);
    return row;
  }

  private render(): HTMLElement {
    const overlay = createElement('div', 'modal-overlay');
    const modal = createElement('div', 'modal-container');

    // Header
    const header = createElement('div', 'modal-header');
    const title = createElement('h3', 'modal-title', 'Add & Remove Stations');
    const closeBtn = createElement('button', 'icon-btn modal-close-btn', ICONS.close);
    closeBtn.setAttribute('aria-label', 'Close Add & Remove Stations');
    closeBtn.title = 'Close';
    closeBtn.onclick = () => this.close();
    header.appendChild(title);
    header.appendChild(closeBtn);

    // Enable mobile bottom sheet swipe-to-dismiss gesture directly on header
    attachBottomSheetSwipe({
      overlay,
      container: modal,
      header,
      onClose: () => this.close(),
    });

    // Body
    const body = createElement('div', 'modal-body');

    // Search bar for fast mobile filtering
    const searchWrap = createElement('div', 'picker-search-wrap');
    const searchIcon = createElement('span', 'picker-search-icon', ICONS.search);
    this.searchInput = createElement('input', 'picker-search-input') as HTMLInputElement;
    this.searchInput.type = 'search';
    this.searchInput.placeholder = 'Search stations (e.g. Westlake, UW, Bellevue)...';
    this.searchInput.setAttribute('aria-label', 'Search stations');
    this.searchInput.oninput = () => {
      this.searchQuery = this.searchInput.value;
      this.renderStationsList();
    };

    searchWrap.appendChild(searchIcon);
    searchWrap.appendChild(this.searchInput);

    // Line Filter Pills
    const filtersWrap = createElement('div', 'picker-filter-pills');
    this.tab1Btn = createElement(
      'button',
      'filter-pill active line-1',
      `<span class="filter-pill-label">1 Line</span><span class="filter-pill-route">Lynnwood ⇄ Federal Way</span>`
    ) as HTMLButtonElement;
    this.tab1Btn.onclick = () => this.setFilter('line-1');

    this.tab2Btn = createElement(
      'button',
      'filter-pill',
      `<span class="filter-pill-label">2 Line</span><span class="filter-pill-route">Lynnwood ⇄ Redmond</span>`
    ) as HTMLButtonElement;
    this.tab2Btn.onclick = () => this.setFilter('line-2');

    filtersWrap.appendChild(this.tab1Btn);
    filtersWrap.appendChild(this.tab2Btn);

    // List with single delegated click handler (avoids per-row closure allocations)
    this.listContainer = createElement('div', 'departures-list');
    this.listContainer.onclick = (e) => {
      const target = (e.target as HTMLElement).closest('[data-station-id]') as HTMLElement | null;
      if (!target) return;
      const stationId = target.dataset.stationId;
      if (!stationId) return;
      this.callbacks.onTogglePin(stationId);
      this.refreshPinnedState();
    };

    body.appendChild(searchWrap);
    body.appendChild(filtersWrap);
    body.appendChild(this.listContainer);

    modal.appendChild(header);
    modal.appendChild(body);
    overlay.appendChild(modal);

    overlay.onclick = (e) => {
      if (e.target === overlay) this.close();
    };

    return overlay;
  }
}
