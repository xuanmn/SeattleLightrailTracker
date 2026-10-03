import { describe, it, expect, beforeEach } from 'vitest';
import { SettingsModal } from '../src/components/SettingsModal';
import { StationPickerModal } from '../src/components/StationPickerModal';
import { FaqModal } from '../src/components/FaqModal';
import { SystemMapModal } from '../src/components/SystemMapModal';
import { StationCardComponent } from '../src/components/StationCard';
import { STATIONS } from '../src/data/stations';

describe('Memory Leak Prevention & Lifecycle Tests', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    document.body.className = '';
  });

  describe('Modal Open-Guards & Scroll Lock Safety', () => {
    it('prevents scroll-lock count leaks when FaqModal is opened repeatedly', () => {
      const faq = new FaqModal();
      faq.open();
      faq.open(); // Duplicate call
      expect(document.body.classList.contains('modal-open')).toBe(true);

      faq.close();
      expect(document.body.classList.contains('modal-open')).toBe(false);
    });

    it('prevents scroll-lock count leaks when SettingsModal is opened repeatedly', () => {
      const settings = new SettingsModal({ onSettingsSaved: () => {} });
      settings.open();
      settings.open(); // Duplicate call
      expect(document.body.classList.contains('modal-open')).toBe(true);

      settings.close();
      expect(document.body.classList.contains('modal-open')).toBe(false);
    });

    it('prevents scroll-lock count leaks when StationPickerModal is opened repeatedly', () => {
      const picker = new StationPickerModal({
        onTogglePin: () => {},
        isStationPinned: () => false,
      });
      picker.open();
      picker.open(); // Duplicate call
      expect(document.body.classList.contains('modal-open')).toBe(true);

      picker.close();
      expect(document.body.classList.contains('modal-open')).toBe(false);
    });

    it('prevents scroll-lock count leaks when SystemMapModal is opened repeatedly', () => {
      const map = new SystemMapModal();
      map.open();
      map.open(); // Duplicate call
      expect(document.body.classList.contains('modal-open')).toBe(true);

      map.close();
      expect(document.body.classList.contains('modal-open')).toBe(false);
    });
  });

  describe('StationPickerModal Event Delegation', () => {
    it('correctly toggles pins via delegated event handling on listContainer', () => {
      const toggledIds: string[] = [];
      const pinnedIds = new Set<string>();

      const picker = new StationPickerModal({
        onTogglePin: (id) => {
          toggledIds.push(id);
          if (pinnedIds.has(id)) {
            pinnedIds.delete(id);
          } else {
            pinnedIds.add(id);
          }
        },
        isStationPinned: (id) => pinnedIds.has(id),
      });

      picker.open('line-1');

      // Find the first station row
      const firstRow = document.querySelector('[data-station-id="lynnwood-city-center"]') as HTMLElement;
      expect(firstRow).toBeDefined();

      // Click the row directly
      firstRow.click();
      expect(toggledIds).toContain('lynnwood-city-center');
      expect(pinnedIds.has('lynnwood-city-center')).toBe(true);

      // Query the newly rendered button after state refresh
      const btn = document.querySelector('[data-station-id="lynnwood-city-center"] .picker-add-btn') as HTMLButtonElement;
      expect(btn).toBeDefined();
      btn.click();
      expect(toggledIds.length).toBe(2);
      expect(pinnedIds.has('lynnwood-city-center')).toBe(false);

      picker.close();
    });
  });

  describe('StationCardComponent Lifecycle & DOM Stability', () => {
    it('updates countdowns and arrivals without creating dangling elements', () => {
      const station = STATIONS[0];
      const card = new StationCardComponent(station, false, false, { onTogglePin: () => {} });
      document.body.appendChild(card.getElement());

      for (let i = 0; i < 50; i++) {
        card.updateArrivals({
          station,
          lastUpdated: Date.now(),
          direction1: {
            platform: station.platforms.northbound!,
            arrivals: [
              {
                tripId: `trip_${i}`,
                routeName: '1 Line',
                destination: 'Lynnwood City Center',
                direction: 'Northbound',
                scheduledDepartureTime: Date.now() + 180000,
                predictedDepartureTime: Date.now() + 180000,
                isRealtime: true,
                delaySeconds: 0,
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

        card.tickCountdowns();
      }

      // Card element remains intact with exactly 1 list
      const lists = card.getElement().querySelectorAll('.departures-list');
      expect(lists.length).toBe(1);
    });
  });
});
