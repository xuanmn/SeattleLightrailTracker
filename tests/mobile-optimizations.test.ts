import { describe, it, expect, beforeEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { StationCardComponent } from '../src/components/StationCard';
import { STATIONS } from '../src/data/stations';
import { StationArrivals } from '../src/types/transit';

describe('Mobile Performance Optimizations', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  describe('Fix 1: IntersectionObserver-gated Visibility & Polling', () => {
    it('initializes IntersectionObserver on the card element', () => {
      const station = STATIONS[0];
      const card = new StationCardComponent(station, false, false, {
        onTogglePin: () => {},
      });

      expect(card.isVisible).toBe(true);
      expect(card.getElement()).toBeDefined();
    });

    it('triggers onBecameVisible callback when an offscreen card enters viewport', () => {
      const station = STATIONS[0];
      const onBecameVisible = vi.fn();

      const card = new StationCardComponent(station, false, false, {
        onTogglePin: () => {},
        onBecameVisible,
      });

      // Initially set to false to simulate off-screen card
      card.isVisible = false;

      // Access the mock IntersectionObserver instance and trigger an intersection event
      const observer = (card as unknown as { observer?: { trigger: (entries: Partial<IntersectionObserverEntry>[]) => void } }).observer;
      expect(observer).toBeDefined();

      observer?.trigger([{ isIntersecting: true }]);

      expect(card.isVisible).toBe(true);
      expect(onBecameVisible).toHaveBeenCalledWith(station.id);
    });

    it('does not trigger onBecameVisible when card becomes invisible', () => {
      const station = STATIONS[0];
      const onBecameVisible = vi.fn();

      const card = new StationCardComponent(station, false, false, {
        onTogglePin: () => {},
        onBecameVisible,
      });

      card.isVisible = true;

      const observer = (card as unknown as { observer?: { trigger: (entries: Partial<IntersectionObserverEntry>[]) => void } }).observer;
      observer?.trigger([{ isIntersecting: false }]);

      expect(card.isVisible).toBe(false);
      expect(onBecameVisible).not.toHaveBeenCalled();
    });

    it('disconnects the observer on card destroy() to prevent memory leaks', () => {
      const station = STATIONS[0];
      const card = new StationCardComponent(station, false, false, {
        onTogglePin: () => {},
      });

      const observer = (card as unknown as { observer?: { disconnect: () => void; targets: Set<Element> } }).observer;
      expect(observer).toBeDefined();
      expect(observer?.targets.size).toBe(1);

      card.destroy();

      expect(observer?.targets.size).toBe(0);
      expect((card as unknown as { observer?: unknown }).observer).toBeUndefined();
    });

    it('shares a single IntersectionObserver instance across multiple StationCardComponents', () => {
      const sharedObserver = StationCardComponent.createSharedObserver();
      const cards = STATIONS.slice(0, 6).map(
        (s) =>
          new StationCardComponent(
            s,
            false,
            false,
            { onTogglePin: () => {} },
            'both',
            sharedObserver
          )
      );

      const firstObserver = (cards[0] as unknown as { observer?: { targets: Set<Element>; trigger: (entries: Partial<IntersectionObserverEntry>[]) => void } }).observer;
      expect(firstObserver).toBeDefined();
      expect(firstObserver).toBe(sharedObserver);

      for (const card of cards) {
        const obs = (card as unknown as { observer?: unknown }).observer;
        expect(obs).toBe(firstObserver);
      }
      expect(firstObserver?.targets.size).toBe(6);

      // Trigger intersection specifically for cards[3] without affecting cards[2]
      cards[2].isVisible = false;
      cards[3].isVisible = false;
      firstObserver?.trigger([{ target: cards[3].getElement(), isIntersecting: true }]);
      expect(cards[2].isVisible).toBe(false);
      expect(cards[3].isVisible).toBe(true);

      cards.forEach((c) => c.destroy());
      expect(firstObserver?.targets.size).toBe(0);
    });
  });

  describe('Fix 4: Clock-Only Time Format Toggle & Unfetched Direction Skeleton', () => {
    it('updates clock elements in-place on setTimeFormat without running full updateArrivals', () => {
      const station = STATIONS[0];
      const card = new StationCardComponent(station, false, false, { onTogglePin: () => {} });
      const target = new Date('2026-10-31T15:05:00').getTime();

      card.updateArrivals({
        station,
        lastUpdated: target - 60000,
        direction1: {
          platform: station.platforms.northbound!,
          arrivals: [
            {
              tripId: 'trip_clock',
              routeName: '1 Line',
              destination: 'Lynnwood City Center',
              direction: 'Northbound',
              scheduledDepartureTime: target,
              predictedDepartureTime: target,
              delaySeconds: 0,
              isRealtime: true,
              statusText: 'On Time',
              statusType: 'ontime',
            },
          ],
        },
        direction2: {
          platform: station.platforms.southbound!,
          arrivals: [],
        },
      });

      const updateSpy = vi.spyOn(card, 'updateArrivals');
      const clockEl = card.getElement().querySelector('.dep-clock') as HTMLElement;
      expect(clockEl.textContent).toMatch(/PM/i);

      card.setTimeFormat(true);

      expect(updateSpy).not.toHaveBeenCalled();
      expect(clockEl.textContent).toBe('15:05');
    });

    it('preserves loading skeleton on unfetched platform when dir2Fetched is false', () => {
      const station = STATIONS[0];
      const card = new StationCardComponent(
        station,
        false,
        false,
        { onTogglePin: () => {} },
        'dir1'
      );

      expect(card.getDirectionFilter()).toBe('dir1');

      const now = Date.now();
      card.updateArrivals({
        station,
        lastUpdated: now,
        dir1Fetched: true,
        dir2Fetched: false,
        direction1: {
          platform: station.platforms.northbound!,
          arrivals: [],
        },
        direction2: {
          platform: station.platforms.southbound!,
          arrivals: [],
        },
      });

      const columns = card.getElement().querySelectorAll('.platform-column');
      // Fetched platform 1 shows "No upcoming trains"
      expect(columns[0].textContent).toContain('No upcoming trains');
      // Unfetched platform 2 keeps skeleton rows instead of flashing "No upcoming trains"
      expect(columns[1].querySelectorAll('.skeleton-row').length).toBeGreaterThan(0);
      expect(columns[1].textContent).not.toContain('No upcoming trains');
    });
  });

  describe('Fix 5: TransitTrackerApp Empty-Dashboard Ticker Pause & Lazy Direction Polling', () => {
    it('does not run the 1-second ticker when no station cards are rendered, and lazily fetches hidden platform on direction switch', async () => {
      localStorage.setItem('seattle_transit_pinned_stations', JSON.stringify([]));
      const setIntervalSpy = vi.spyOn(window, 'setInterval');
      const clearIntervalSpy = vi.spyOn(window, 'clearInterval');

      const fetchMock = vi.fn(async (_url: string) => ({
        ok: true,
        status: 200,
        json: async () => ({
          code: 200,
          data: { entry: { stopId: 'x', arrivalsAndDepartures: [] } },
        }),
      }));
      vi.stubGlobal('fetch', fetchMock);

      const { clearStorageCache } = await import('../src/services/storage');
      const { clearArrivalsCache } = await import('../src/services/oba-api');
      clearStorageCache();
      clearArrivalsCache();

      document.body.innerHTML = '<div id="app"></div>';
      const { TransitTrackerApp } = await import('../src/main');
      const app = new TransitTrackerApp();

      // Empty dashboard (0 pinned stations): 1000ms ticker should NOT be active
      const active1sCallsWhileEmpty = setIntervalSpy.mock.calls.filter((c) => c[1] === 1000);
      expect(active1sCallsWhileEmpty.length).toBe(0);
      app.destroy();

      // Now mount with 1 pinned station filtered to 'dir1'
      document.body.innerHTML = '<div id="app"></div>';
      localStorage.setItem('seattle_transit_pinned_stations', JSON.stringify(['westlake']));
      localStorage.setItem('seattle_transit_direction_filters', JSON.stringify({ westlake: 'dir1' }));
      clearStorageCache();
      clearArrivalsCache();
      fetchMock.mockClear();

      const appWithCard = new TransitTrackerApp();
      // Let initial poll settle
      await new Promise((r) => setTimeout(r, 20));

      // Only 1 platform (Northbound 40_1121) should have been fetched!
      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(String(fetchMock.mock.calls[0]?.[0])).toContain('40_1121');

      // Clicking Southbound ('dir2') lazily fetches the previously skipped Southbound platform (40_1108)
      const dirBtns = document.querySelectorAll<HTMLButtonElement>('#station-westlake .direction-segment-btn');
      expect(dirBtns.length).toBe(3);
      dirBtns[2].click();
      await new Promise((r) => setTimeout(r, 20));

      expect(fetchMock).toHaveBeenCalledTimes(2);
      expect(String(fetchMock.mock.calls[1]?.[0])).toContain('40_1108');

      appWithCard.destroy();
      expect(clearIntervalSpy).toHaveBeenCalled();
      setIntervalSpy.mockRestore();
      clearIntervalSpy.mockRestore();
      vi.unstubAllGlobals();
    });

    it('replaces unfetched platform skeleton with "Live data unavailable" while preserving fetched platform when lazy direction fetch fails', async () => {
      const now = Date.now();
      let shouldFail = false;
      const fetchMock = vi.fn(async (_url: string) => {
        if (shouldFail) throw new TypeError('Failed to fetch');
        return {
          ok: true,
          status: 200,
          json: async () => ({
            code: 200,
            data: {
              entry: {
                stopId: '40_1121',
                arrivalsAndDepartures: [
                  {
                    tripId: 'NORTH_LIVE_1',
                    routeId: '40_100479',
                    routeShortName: '1 Line',
                    tripHeadsign: 'Lynnwood City Center',
                    scheduledDepartureTime: now + 6 * 60 * 1000,
                    predictedDepartureTime: now + 6 * 60 * 1000,
                    predicted: true,
                  },
                ],
              },
            },
          }),
        };
      });
      vi.stubGlobal('fetch', fetchMock);

      const { clearStorageCache } = await import('../src/services/storage');
      const { clearArrivalsCache } = await import('../src/services/oba-api');
      document.body.innerHTML = '<div id="app"></div>';
      localStorage.setItem('seattle_transit_pinned_stations', JSON.stringify(['westlake']));
      localStorage.setItem('seattle_transit_direction_filters', JSON.stringify({ westlake: 'dir1' }));
      clearStorageCache();
      clearArrivalsCache();

      const { TransitTrackerApp } = await import('../src/main');
      const app = new TransitTrackerApp();
      await new Promise((r) => setTimeout(r, 20));

      // Simulate entering a tunnel (offline) and switching to 'Both'
      shouldFail = true;
      const dirBtns = document.querySelectorAll<HTMLButtonElement>('#station-westlake .direction-segment-btn');
      dirBtns[0].click(); // 'Both'
      await new Promise((r) => setTimeout(r, 20));

      const columns = document.querySelectorAll('#station-westlake .platform-column');
      // Platform 1 preserves its valid Northbound train
      expect(columns[0].textContent).toContain('Lynnwood City Center');
      // Platform 2 replaces skeleton shimmer with "Live data unavailable"
      expect(columns[1].querySelectorAll('.skeleton-row').length).toBe(0);
      expect(columns[1].textContent).toContain('Live data unavailable');

      app.destroy();
      vi.unstubAllGlobals();
    });

    it('prunes expired departures when switching back to a stale unpolled direction so departed trains never pulse as ARRIVING', async () => {
      let fakeNow = 1700000000000;
      const nowSpy = vi.spyOn(Date, 'now').mockImplementation(() => fakeNow);

      let shouldFail = false;
      const fetchMock = vi.fn(async (_url: string) => {
        if (shouldFail) throw new TypeError('Tunnel offline');
        return {
          ok: true,
          status: 200,
          json: async () => ({
            code: 200,
            data: {
              entry: {
                stopId: 'x',
                arrivalsAndDepartures: [
                  {
                    tripId: 'SOON_TRAIN',
                    routeId: '40_100479',
                    routeShortName: '1 Line',
                    tripHeadsign: 'Lynnwood City Center',
                    scheduledDepartureTime: fakeNow + 30 * 1000, // departs in 30s
                    predictedDepartureTime: fakeNow + 30 * 1000,
                    predicted: true,
                  },
                ],
              },
            },
          }),
        };
      });
      vi.stubGlobal('fetch', fetchMock);

      const { clearStorageCache } = await import('../src/services/storage');
      const { clearArrivalsCache } = await import('../src/services/oba-api');
      document.body.innerHTML = '<div id="app"></div>';
      localStorage.setItem('seattle_transit_pinned_stations', JSON.stringify(['westlake']));
      localStorage.setItem('seattle_transit_direction_filters', JSON.stringify({ westlake: 'dir1' }));
      clearStorageCache();
      clearArrivalsCache();

      const { TransitTrackerApp } = await import('../src/main');
      const app = new TransitTrackerApp();
      await new Promise((r) => setTimeout(r, 20));

      const dirBtns = document.querySelectorAll<HTMLButtonElement>('#station-westlake .direction-segment-btn');
      // Switch to dir2 at t = 0
      dirBtns[2].click();
      await new Promise((r) => setTimeout(r, 20));

      // Advance clock by 5 minutes (SOON_TRAIN departed 4m30s ago) and enter a tunnel
      fakeNow += 5 * 60 * 1000;
      shouldFail = true;

      // Switch back to dir1 while offline in tunnel
      dirBtns[1].click();
      await new Promise((r) => setTimeout(r, 20));

      const col1 = document.querySelectorAll('#station-westlake .platform-column')[0];
      // Must NOT display the departed train from 4.5 minutes ago as ARRIVING!
      expect(col1.textContent).not.toContain('ARRIVING');

      app.destroy();
      nowSpy.mockRestore();
      vi.unstubAllGlobals();
    });

    it('catches rejected lazy modal loaders and surfaces the status banner instead of an unhandled rejection', async () => {
      document.body.innerHTML = '<div id="app"></div>';
      localStorage.setItem('seattle_transit_pinned_stations', JSON.stringify([]));
      const { clearStorageCache } = await import('../src/services/storage');
      clearStorageCache();

      const { TransitTrackerApp } = await import('../src/main');
      const app = new TransitTrackerApp();

      // Simulate transient dynamic import rejection on getPickerModal
      (app as unknown as { getPickerModal: () => Promise<never> }).getPickerModal = () =>
        Promise.reject(new TypeError('Failed to fetch dynamically imported module'));

      const unhandled = vi.fn();
      window.addEventListener('unhandledrejection', unhandled);

      const addBtn = document.querySelector('.empty-dashboard-btn') as HTMLButtonElement;
      expect(addBtn).not.toBeNull();
      addBtn.click();
      await new Promise((r) => setTimeout(r, 20));

      window.removeEventListener('unhandledrejection', unhandled);
      expect(unhandled).not.toHaveBeenCalled();

      const banner = document.querySelector('.status-banner') as HTMLElement;
      expect(banner.classList.contains('hidden')).toBe(false);

      app.destroy();
    });
  });

  describe('Fix 2: GPU-Composited Approach Bar via transform: scaleX', () => {
    it('uses transform scaleX for the bar and translateX for the train instead of width/left', () => {
      const station = STATIONS[0];
      const card = new StationCardComponent(station, false, false, {
        onTogglePin: () => {},
      });

      const el = card.getElement();
      const trackWrap = el.querySelector('.station-approach-track-wrap') as HTMLElement;
      const bar = trackWrap.querySelector('.station-approach-bar') as HTMLElement;
      const train = trackWrap.querySelector('.station-approach-train') as HTMLElement;

      expect(bar).not.toBeNull();
      expect(train).not.toBeNull();

      const now = 1700000000000;
      const arrivalsData: StationArrivals = {
        station,
        lastUpdated: now,
        direction1: {
          platform: station.platforms.northbound!,
          arrivals: [
            {
              tripId: 'trip_approach',
              routeName: '1 Line',
              destination: 'Lynnwood City Center',
              direction: 'Northbound',
              scheduledDepartureTime: now + 2.5 * 60 * 1000, // 2.5 min = 50% progress
              predictedDepartureTime: now + 2.5 * 60 * 1000,
              delaySeconds: 0,
              isRealtime: true,
              statusText: 'On Time',
              statusType: 'ontime',
            },
          ],
        },
        direction2: {
          platform: station.platforms.southbound!,
          arrivals: [],
        },
      };

      card.updateArrivals(arrivalsData);

      expect(trackWrap.classList.contains('active')).toBe(true);
      // scaleX(0.5) is applied for 50% progress
      expect(bar.style.transform).toBe('scaleX(0.5)');
      // Train dot tracks the progress edge at 50% via a composited transform (no layout)
      expect(train.style.transform).toBe('translateX(50%)');
      expect(train.style.left).toBe('');
      // Verify style.width is not used for animation
      expect(bar.style.width).toBe('');
    });

    it('resets bar to scaleX(0) and train to translateX(0%) when no train is arriving', () => {
      const station = STATIONS[0];
      const card = new StationCardComponent(station, false, false, {
        onTogglePin: () => {},
      });

      const el = card.getElement();
      const trackWrap = el.querySelector('.station-approach-track-wrap') as HTMLElement;
      const bar = trackWrap.querySelector('.station-approach-bar') as HTMLElement;
      const train = trackWrap.querySelector('.station-approach-train') as HTMLElement;

      const now = 1700000000000;
      const arrivalsData: StationArrivals = {
        station,
        lastUpdated: now,
        direction1: {
          platform: station.platforms.northbound!,
          arrivals: [
            {
              tripId: 'trip_far',
              routeName: '1 Line',
              destination: 'Lynnwood City Center',
              direction: 'Northbound',
              scheduledDepartureTime: now + 15 * 60 * 1000, // 15 min away (> 5 min)
              predictedDepartureTime: now + 15 * 60 * 1000,
              delaySeconds: 0,
              isRealtime: true,
              statusText: 'Scheduled',
              statusType: 'scheduled',
            },
          ],
        },
        direction2: {
          platform: station.platforms.southbound!,
          arrivals: [],
        },
      };

      card.updateArrivals(arrivalsData);

      expect(trackWrap.classList.contains('active')).toBe(false);
      expect(bar.style.transform).toBe('scaleX(0)');
      expect(train.style.transform).toBe('translateX(0%)');

      // Subsequent 1-second ticks while inactive should not re-mutate transform styles
      const barStyleSpy = vi.spyOn(bar.style, 'transform', 'set');
      card.tickCountdowns();
      expect(barStyleSpy).not.toHaveBeenCalled();
    });

    it('handles missing or undefined arrivals arrays defensively without throwing', () => {
      const station = STATIONS[0];
      const card = new StationCardComponent(station, false, false, {
        onTogglePin: () => {},
      });

      const malformedData = {
        station,
        lastUpdated: Date.now(),
        direction1: {
          platform: station.platforms.northbound!,
          arrivals: undefined as unknown as [],
        },
        direction2: {
          platform: station.platforms.southbound!,
          arrivals: undefined as unknown as [],
        },
      };

      expect(() => card.updateArrivals(malformedData as unknown as StationArrivals)).not.toThrow();
      expect(() => card.tickCountdowns()).not.toThrow();
    });

    it('uses live Date.now() instead of stale lastUpdated when updating approach track on direction filter toggle', () => {
      const station = STATIONS[0];
      const card = new StationCardComponent(station, false, false, {
        onTogglePin: () => {},
      });

      const base = 1700000000000;
      let fakeNow = base;
      const nowSpy = vi.spyOn(Date, 'now').mockImplementation(() => fakeNow);

      card.updateArrivals({
        station,
        lastUpdated: base,
        direction1: {
          platform: station.platforms.northbound!,
          arrivals: [
            {
              tripId: 'trip_live_dir1',
              routeName: '1 Line',
              destination: 'Lynnwood City Center',
              direction: 'Northbound',
              scheduledDepartureTime: base + 5 * 60 * 1000, // 0% progress at base
              predictedDepartureTime: base + 5 * 60 * 1000,
              delaySeconds: 0,
              isRealtime: true,
              statusText: 'On Time',
              statusType: 'ontime',
            },
          ],
        },
        direction2: {
          platform: station.platforms.southbound!,
          arrivals: [],
        },
      });

      const bar = card.getElement().querySelector('.station-approach-bar') as HTMLElement;
      expect(bar.style.transform).toBe('scaleX(0)');

      // Advance 2.5 minutes (50% progress) and click the dir1 filter button without polling
      fakeNow = base + 2.5 * 60 * 1000;
      const dirBtns = card.getElement().querySelectorAll<HTMLButtonElement>('.direction-segment-btn');
      dirBtns[1].click();

      expect(bar.style.transform).toBe('scaleX(0.5)');
      nowSpy.mockRestore();
    });
  });

  describe('Fix 3: Mobile Backdrop-Filter & CSS Compositing Rules', () => {
    it('disables backdrop-filter on .station-card below 768px in board.css', () => {
      const cssPath = process.cwd() + '/src/styles/board.css';
      const cssContent = readFileSync(cssPath, 'utf-8');

      // Check for 768px media query specifically targeting .station-card backdrop-filter
      expect(cssContent).toMatch(/@media\s*\(\s*max-width:\s*768px\s*\)/);
      expect(cssContent).toContain('backdrop-filter: none');
      expect(cssContent).toContain('-webkit-backdrop-filter: none');
    });

    it('configures .station-approach-bar for hardware transform compositing', () => {
      const cssPath = process.cwd() + '/src/styles/board.css';
      const cssContent = readFileSync(cssPath, 'utf-8');

      expect(cssContent).toContain('transform-origin: left center');
      expect(cssContent).toContain('transform: scaleX(0)');
      expect(cssContent).toContain('transition: transform 0.9s linear');
    });

    it('never animates layout or paint-heavy properties in infinite keyframes', () => {
      const cssContent = readFileSync(process.cwd() + '/src/styles/board.css', 'utf-8');
      const keyframes = cssContent.match(/@keyframes[^{]+\{(?:[^{}]*\{[^{}]*\})*[^{}]*\}/g) ?? [];
      expect(keyframes.length).toBeGreaterThan(0);
      for (const block of keyframes) {
        expect(block).not.toMatch(/box-shadow|background-position|\bleft\s*:|\bwidth\s*:/);
      }
      // The train dot must not transition `left`
      expect(cssContent).not.toMatch(/transition:\s*left/);
    });
  });
});
