import { describe, it, expect, beforeEach } from 'vitest';
import {
  getPinnedStationIds,
  togglePinnedStation,
  getActiveLine,
  setActiveLine,
  getSettings,
  updateSettings,
  getStationDirectionFilters,
  setStationDirectionFilter,
  clearStorageCache,
} from '../src/services/storage';

describe('Local Storage & Settings Service', () => {
  beforeEach(() => {
    localStorage.clear();
    clearStorageCache();
  });

  it('provides default pinned stations on first load', () => {
    const pinned = getPinnedStationIds();
    expect(pinned.length).toBeGreaterThanOrEqual(3);
    expect(pinned).toContain('westlake');
    expect(pinned).toContain('capitol-hill');
    expect(pinned).toContain('bellevue-downtown');
  });

  it('toggles pinned station status correctly', () => {
    // Unpin westlake
    const unpinnedResult = togglePinnedStation('westlake');
    expect(unpinnedResult).toBe(false);
    expect(getPinnedStationIds()).not.toContain('westlake');

    // Re-pin westlake
    const pinnedResult = togglePinnedStation('westlake');
    expect(pinnedResult).toBe(true);
    expect(getPinnedStationIds()).toContain('westlake');
  });

  it('preserves an explicitly empty list of pinned stations when user unpins all stations', () => {
    const defaultStations = getPinnedStationIds();
    defaultStations.forEach((id) => togglePinnedStation(id));

    // Should stay empty, NOT auto-populate default stations
    expect(getPinnedStationIds()).toEqual([]);
  });



  it('sets and retrieves active line', () => {
    expect(getActiveLine()).toBe('line-1'); // Default line 1
    setActiveLine('line-2');
    expect(getActiveLine()).toBe('line-2');
  });

  it('updates and persists settings', () => {
    const defaults = getSettings();
    expect(defaults.timeFormat24Hour).toBe(false);

    updateSettings({
      timeFormat24Hour: true,
    });

    const updated = getSettings();
    expect(updated.timeFormat24Hour).toBe(true);
  });

  it('persists station direction filters individually per station', () => {
    expect(getStationDirectionFilters()).toEqual({});

    // Filter Northbound only (dir1) on Capitol Hill
    setStationDirectionFilter('capitol-hill', 'dir1');
    let filters = getStationDirectionFilters();
    expect(filters['capitol-hill']).toBe('dir1');

    // Filter Southbound only (dir2) on Westlake
    setStationDirectionFilter('westlake', 'dir2');
    filters = getStationDirectionFilters();
    expect(filters['capitol-hill']).toBe('dir1');
    expect(filters['westlake']).toBe('dir2');

    // Reset Capitol Hill back to both directions
    setStationDirectionFilter('capitol-hill', 'both');
    filters = getStationDirectionFilters();
    expect(filters['capitol-hill']).toBe('both');
  });

  it('resets in-memory caches when clearStorageCache is called', () => {
    // Unpin all stations so cache is empty array
    const defaultStations = getPinnedStationIds();
    defaultStations.forEach((id) => togglePinnedStation(id));
    expect(getPinnedStationIds()).toEqual([]);

    // Clear storage and invalidate in-memory cache
    localStorage.clear();
    clearStorageCache();

    // Now it should return defaults fresh from initial state
    const restored = getPinnedStationIds();
    expect(restored.length).toBeGreaterThanOrEqual(3);
    expect(restored).toContain('westlake');
  });
});
