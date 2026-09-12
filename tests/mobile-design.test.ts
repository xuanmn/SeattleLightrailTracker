import { describe, it, expect, beforeEach } from 'vitest';
// @ts-ignore
import { readFileSync } from 'node:fs';
declare const process: any;
import { HeaderComponent } from '../src/components/Header';
import { StationPickerModal } from '../src/components/StationPickerModal';
import { FaqModal } from '../src/components/FaqModal';
import { SettingsModal } from '../src/components/SettingsModal';
import { StationCardComponent } from '../src/components/StationCard';
import { Station } from '../src/types/transit';

describe('Mobile Frontend Design & UX Specifications', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('renders responsive mobile labels and icons on Header action buttons', () => {
    const header = new HeaderComponent('line-1', {
      onMapClick: () => {},
      onFaqClick: () => {},
      onSettingsClick: () => {},
      onLineChange: () => {},
    });

    const el = header.getElement();
    const mapBtn = el.querySelector('.header-map-btn') as HTMLButtonElement;
    expect(mapBtn).not.toBeNull();
    expect(mapBtn.querySelector('.header-btn-label-desktop')?.textContent).toBe('Link Map');
    expect(mapBtn.querySelector('.header-btn-label-mobile')?.textContent).toBe('Map');

    const faqBtn = el.querySelector('.header-faq-btn') as HTMLButtonElement;
    expect(faqBtn).not.toBeNull();
    expect(faqBtn.querySelector('.header-btn-label-desktop')?.textContent).toBe('Transit Guide & FAQ');
    expect(faqBtn.querySelector('.header-btn-label-mobile')?.textContent).toBe('Guide');
  });

  it('supports swipe-to-dismiss on modal headers without visual drag handle indicators', () => {
    new StationPickerModal({
      onTogglePin: () => {},
      isStationPinned: () => false,
    });
    new FaqModal();
    const settings = new SettingsModal({
      onSettingsSaved: () => {},
    });

    const dragHandles = document.querySelectorAll('.modal-drag-handle');
    expect(dragHandles.length).toBe(0);

    // Open settings modal and test swipe down on header
    settings.open();
    const settingsOverlay = document.querySelectorAll('.modal-overlay')[2] as HTMLElement;
    expect(settingsOverlay.classList.contains('open')).toBe(true);

    const header = settingsOverlay.querySelector('.modal-header') as HTMLElement;
    expect(header).not.toBeNull();

    const touch = (y: number) =>
      ({
        identifier: 0,
        target: header,
        clientX: 100,
        clientY: y,
        pageX: 100,
        pageY: y,
      } as unknown as Touch);

    // Swipe down 120px on modal header (exceeds 80px threshold)
    header.dispatchEvent(
      new TouchEvent('touchstart', {
        bubbles: true,
        cancelable: true,
        touches: [touch(50)],
        changedTouches: [touch(50)],
      })
    );

    header.dispatchEvent(
      new TouchEvent('touchmove', {
        bubbles: true,
        cancelable: true,
        touches: [touch(180)],
        changedTouches: [touch(180)],
      })
    );

    header.dispatchEvent(
      new TouchEvent('touchend', {
        bubbles: true,
        cancelable: true,
        touches: [],
        changedTouches: [touch(180)],
      })
    );

    expect(settingsOverlay.classList.contains('open')).toBe(false);
  });

  it('supports real-time search filtering in StationPickerModal for fast mobile station discovery', () => {
    const picker = new StationPickerModal({
      onTogglePin: () => {},
      isStationPinned: () => false,
    });

    picker.open('line-1');

    const searchInput = document.querySelector('.picker-search-input') as HTMLInputElement;
    expect(searchInput).not.toBeNull();

    // Type "westlake" into search input
    searchInput.value = 'westlake';
    searchInput.dispatchEvent(new Event('input'));

    const visibleRows = document.querySelectorAll('.picker-station-row');
    expect(visibleRows.length).toBe(1);
    expect(visibleRows[0].textContent).toContain('Westlake');

    // Clear search
    searchInput.value = '';
    searchInput.dispatchEvent(new Event('input'));
    const allRows = document.querySelectorAll('.picker-station-row');
    expect(allRows.length).toBeGreaterThan(1);
  });

  it('renders thumb-friendly directional segmented controls on StationCard', () => {
    const mockStation: Station = {
      id: 'westlake',
      name: 'Westlake',
      lines: ['line-1'],
      platforms: {
        northbound: { stopId: '1', directionName: 'Northbound', cardinalDirection: 'Northbound', terminalDestination: 'Lynnwood' },
        southbound: { stopId: '2', directionName: 'Southbound', cardinalDirection: 'Southbound', terminalDestination: 'Federal Way' },
      },
    };

    const card = new StationCardComponent(mockStation, false, false, {
      onTogglePin: () => {},
    });

    const el = card.getElement();
    const segmented = el.querySelector('.direction-segmented-control');
    expect(segmented).not.toBeNull();

    const segmentBtns = segmented?.querySelectorAll('.direction-segment-btn');
    expect(segmentBtns?.length).toBe(3); // Both, North, South
  });

  it('preserves native mobile pull-to-refresh without overscroll-behavior-y: none on root html', async () => {
    // @ts-ignore vite raw import
    const themeCss = (await import('../src/styles/theme.css?raw')).default as string;
    
    // Ensure overscroll-behavior-y: none is not set on html, which breaks mobile pull-to-refresh
    expect(themeCss).not.toMatch(/html\s*\{[^}]*overscroll-behavior-y:\s*none/);
  });

  it('displays verified, accurate Sound Transit fares, tapping rules, and regional guides in FaqModal', () => {
    const faq = new FaqModal();
    faq.open();

    const text = document.body.textContent || '';
    // Verified Flat Fare
    expect(text).toContain('$3.00');
    // Verified Tap Rule (no tap off)
    expect(text).toContain('do NOT need to tap off');
    // Verified Free Youth
    expect(text).toContain('Youth (18 & under): Free');
    // Verified 2 Line Crosslake Guide
    expect(text).toContain('Downtown Redmond');
    // Verified Security Contact
    expect(text).toContain('206-398-5268');
  });

  it('renders FaqModal with dedicated full-screen mobile classes', () => {
    const faq = new FaqModal();
    faq.open();

    const overlay = document.querySelector('.faq-modal-overlay');
    expect(overlay).not.toBeNull();

    const container = document.querySelector('.faq-modal-container');
    expect(container).not.toBeNull();
  });

  it('prevents mobile background flicker when opening Transit Guide FaqModal', () => {
    const layoutCss = readFileSync(process.cwd() + '/src/styles/layout.css', 'utf-8');

    // Mobile media query must disable backdrop-filter on .faq-modal-overlay to prevent GPU blur pass flicker
    expect(layoutCss).toMatch(/@media\s*\([^)]*max-width:\s*768px[^)]*\)[\s\S]*?\.faq-modal-overlay[\s\S]*?backdrop-filter:\s*none/);
  });

  it('renders actionable phone/SMS links, semantic accordion details, tip badges, and 2 Line staging note', () => {
    const faq = new FaqModal();
    faq.open();

    // Actionable contact links
    const telLink = document.querySelector('a[href="tel:2063985268"]');
    const smsLink = document.querySelector('a[href="sms:2063985268"]');
    const lostFoundLink = document.querySelector('a[href="tel:2065533000"]');
    const emergency911Link = document.querySelector('a[href="tel:911"]');

    expect(telLink).not.toBeNull();
    expect(smsLink).not.toBeNull();
    expect(lostFoundLink).not.toBeNull();
    expect(emergency911Link).toBeNull();
    expect(lostFoundLink?.closest('.faq-action-btns')).not.toBeNull();

    // Semantic accordion details and summary
    const accordions = document.querySelectorAll('details.faq-item');
    expect(accordions.length).toBeGreaterThan(0);
    const summary = document.querySelector('details.faq-item summary.faq-q');
    expect(summary).not.toBeNull();

    // Visual tip badges
    const tipBadges = document.querySelectorAll('.faq-tip-badge, .faq-badge-tip, .route-badge');
    expect(tipBadges.length).toBeGreaterThan(0);
    const bodyText = document.body.textContent || '';
    expect(bodyText).toContain('2025–2026');
  });

  it('ensures modal footer has seamless background and mobile safe-area padding without box color cutoffs', () => {
    const layoutCss = readFileSync(process.cwd() + '/src/styles/layout.css', 'utf-8');

    // Ensure .modal-footer does not have dark rgba(0, 0, 0, 0.2) background creating a jarring box cut off
    expect(layoutCss).not.toMatch(/\.modal-footer\s*\{[^}]*background:\s*rgba\(0,\s*0,\s*0,\s*0\.2\)/);

    // Ensure mobile .modal-footer includes env(safe-area-inset-bottom) padding
    expect(layoutCss).toMatch(/\.modal-footer\s*\{[^}]*env\(safe-area-inset-bottom\)/);
  });
});

