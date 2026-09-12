import { describe, it, expect, beforeEach, vi } from 'vitest';
// @ts-ignore
import { readFileSync } from 'node:fs';
declare const process: any;
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
  });

  describe('Fix 2: GPU-Composited Approach Bar via transform: scaleX', () => {
    it('uses transform scaleX and independent train left positioning instead of animating width', () => {
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
              routeId: '40_100479',
              routeName: '1 Line',
              routeColor: '#008542',
              destination: 'Lynnwood City Center',
              direction: 'Northbound',
              scheduledDepartureTime: now + 2.5 * 60 * 1000, // 2.5 min = 50% progress
              predictedDepartureTime: now + 2.5 * 60 * 1000,
              minutesUntilArrival: 2,
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
      // Train dot tracks the progress edge at 50%
      expect(train.style.left).toBe('50%');
      // Verify style.width is not used for animation
      expect(bar.style.width).toBe('');
    });

    it('resets transform to scaleX(0) and left to 0% when no train is arriving', () => {
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
              routeId: '40_100479',
              routeName: '1 Line',
              routeColor: '#008542',
              destination: 'Lynnwood City Center',
              direction: 'Northbound',
              scheduledDepartureTime: now + 15 * 60 * 1000, // 15 min away (> 5 min)
              predictedDepartureTime: now + 15 * 60 * 1000,
              minutesUntilArrival: 15,
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
      expect(train.style.left).toBe('0%');
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
  });
});
