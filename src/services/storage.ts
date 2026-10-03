import { AppSettings, TransitLineId } from '../types/transit';

const PINNED_STATIONS_KEY = 'seattle_transit_pinned_stations';
const ACTIVE_LINE_KEY = 'seattle_transit_active_line';
const SETTINGS_KEY = 'seattle_transit_settings';

const DEFAULT_PINNED_STATIONS: string[] = [
  'westlake',
  'capitol-hill',
  'university-of-washington',
  'bellevue-downtown',
  'seatac-airport',
];

const DEFAULT_SETTINGS: AppSettings = {
  timeFormat24Hour: false,
};

// ── In-memory caches to avoid repeated localStorage.getItem + JSON.parse ──
let _pinnedCache: string[] | null = null;
let _settingsCache: AppSettings | null = null;
let _directionFiltersCache: Record<string, StationDirectionFilter> | null = null;

/**
 * Invalidate in-memory caches (for tests, storage resets, and cross-tab sync).
 */
export function clearStorageCache(): void {
  _pinnedCache = null;
  _settingsCache = null;
  _directionFiltersCache = null;
}

// Invalidate in-memory caches if another browser tab modifies localStorage
if (typeof window.addEventListener === 'function') {
  window.addEventListener('storage', () => {
    clearStorageCache();
  });
}

export function getPinnedStationIds(): string[] {
  if (_pinnedCache !== null) return [..._pinnedCache];
  try {
    const raw = localStorage.getItem(PINNED_STATIONS_KEY);
    if (raw === null) {
      _pinnedCache = [...DEFAULT_PINNED_STATIONS];
      return [..._pinnedCache];
    }
    const parsed = JSON.parse(raw);
    _pinnedCache = Array.isArray(parsed) ? parsed : [...DEFAULT_PINNED_STATIONS];
    return [..._pinnedCache];
  } catch {
    _pinnedCache = [...DEFAULT_PINNED_STATIONS];
    return [..._pinnedCache];
  }
}

function setPinnedStationIds(ids: string[]): void {
  _pinnedCache = [...ids];
  try {
    localStorage.setItem(PINNED_STATIONS_KEY, JSON.stringify(ids));
  } catch {
    // ignore quota/storage errors
  }
}

export function togglePinnedStation(stationId: string): boolean {
  const current = getPinnedStationIds();
  const exists = current.includes(stationId);
  let updated: string[];

  if (exists) {
    updated = current.filter((id) => id !== stationId);
  } else {
    updated = [...current, stationId];
  }

  setPinnedStationIds(updated);
  return !exists; // returns new pinned status
}


export function getActiveLine(): TransitLineId {
  try {
    const raw = localStorage.getItem(ACTIVE_LINE_KEY);
    return raw === 'line-2' ? 'line-2' : 'line-1';
  } catch {
    return 'line-1';
  }
}

export function setActiveLine(line: TransitLineId): void {
  try {
    localStorage.setItem(ACTIVE_LINE_KEY, line);
  } catch {
    // ignore
  }
}

export function getSettings(): AppSettings {
  if (_settingsCache !== null) return { ..._settingsCache };
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) {
      _settingsCache = { ...DEFAULT_SETTINGS };
      return { ...DEFAULT_SETTINGS };
    }
    const parsed = JSON.parse(raw);
    const result: AppSettings = {
      ...DEFAULT_SETTINGS,
      ...parsed,
    };
    _settingsCache = result;
    return { ...result };
  } catch {
    _settingsCache = { ...DEFAULT_SETTINGS };
    return { ...DEFAULT_SETTINGS };
  }
}

export function updateSettings(partial: Partial<AppSettings>): AppSettings {
  try {
    const current = getSettings();
    const merged: AppSettings = { ...current, ...partial };
    _settingsCache = { ...merged };
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(merged));
    return merged;
  } catch {
    return getSettings();
  }
}


const DIRECTION_FILTERS_KEY = 'seattle_transit_direction_filters';

export type StationDirectionFilter = 'both' | 'dir1' | 'dir2';

export function getStationDirectionFilters(): Record<string, StationDirectionFilter> {
  if (_directionFiltersCache !== null) return { ..._directionFiltersCache };
  try {
    const raw = localStorage.getItem(DIRECTION_FILTERS_KEY);
    if (!raw) {
      _directionFiltersCache = {};
      return {};
    }
    const parsed = JSON.parse(raw);
    _directionFiltersCache = typeof parsed === 'object' && parsed !== null ? parsed : {};
    return { ..._directionFiltersCache };
  } catch {
    _directionFiltersCache = {};
    return {};
  }
}

export function setStationDirectionFilter(
  stationId: string,
  filter: StationDirectionFilter
): void {
  try {
    const current = getStationDirectionFilters();
    current[stationId] = filter;
    _directionFiltersCache = { ...current };
    localStorage.setItem(DIRECTION_FILTERS_KEY, JSON.stringify(current));
  } catch {
    // ignore
  }
}
