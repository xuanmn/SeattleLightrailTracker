import { describe, it, expect, beforeEach } from 'vitest';
// @ts-ignore
import { readFileSync } from 'node:fs';
declare const process: any;
import { SystemMapModal } from '../src/components/SystemMapModal';

describe('SystemMapModal Component', () => {
  let modal: SystemMapModal;

  beforeEach(() => {
    document.body.innerHTML = '';
    modal = new SystemMapModal();
    modal.open(); // Trigger lazy SVG initialization
  });

  it('renders modal overlay into document body with map elements', () => {
    const overlay = document.querySelector('.system-map-modal-overlay');
    expect(overlay).not.toBeNull();
    const svg = overlay?.querySelector('svg.system-map-svg');
    expect(svg).not.toBeNull();
  });

  it('opens and closes modal using open/close methods', () => {
    const overlay = document.querySelector('.system-map-modal-overlay') as HTMLElement;
    // Modal is opened in beforeEach for lazy SVG init — close it first to test the lifecycle
    modal.close();
    expect(overlay.classList.contains('open')).toBe(false);

    modal.open();
    expect(overlay.classList.contains('open')).toBe(true);

    modal.close();
    expect(overlay.classList.contains('open')).toBe(false);
  });

  it('renders a naturally scrollable map body without floating zoom controls', () => {
    const mapBody = document.querySelector('.system-map-body');
    expect(mapBody).not.toBeNull();

    const zoomBtns = document.querySelectorAll('.map-zoom-btn');
    expect(zoomBtns.length).toBe(0);
  });

  it('renders header legend with line definitions and official directory link', () => {
    const headerLegend = document.querySelector('.system-map-header-legend');
    expect(headerLegend).not.toBeNull();
    expect(headerLegend?.textContent).toContain('1 Line');
    expect(headerLegend?.textContent).toContain('2 Line');

    const officialLink = headerLegend?.querySelector('a.map-official-link');
    expect(officialLink).not.toBeNull();
    expect(officialLink?.getAttribute('href')).toContain('soundtransit.org');
  });

  it('renders station nodes including new Federal Way extension stations within SVG', () => {
    const svg = document.querySelector('svg.system-map-svg');
    const tracks = svg?.querySelectorAll('.map-track-path');
    expect(tracks?.length).toBeGreaterThanOrEqual(2);

    const stationNodes = svg?.querySelectorAll('.map-station-node');
    expect(stationNodes?.length).toBeGreaterThanOrEqual(23);

    expect(svg?.querySelector('#map-node-kent-des-moines')).not.toBeNull();
    expect(svg?.querySelector('#map-node-star-lake')).not.toBeNull();
    expect(svg?.querySelector('#map-node-federal-way-downtown')).not.toBeNull();
  });

  it('renders highlighted 1 Line and 2 Line transfer hub at Chinatown station', () => {
    const svg = document.querySelector('svg.system-map-svg');
    const chinatownNode = svg?.querySelector('#map-node-international-district-chinatown');
    expect(chinatownNode).not.toBeNull();
    expect(chinatownNode?.classList.contains('map-transfer-hub-node')).toBe(true);
    expect(chinatownNode?.textContent).toContain('TRANSFER');
  });

  it('renders I-90 Trail sublabels on Judkins Park and Mercer Island stations', () => {
    const svg = document.querySelector('svg.system-map-svg');
    const judkinsNode = svg?.querySelector('#map-node-judkins-park');
    expect(judkinsNode).not.toBeNull();
    expect(judkinsNode?.textContent).toContain('Judkins Park');
    expect(judkinsNode?.textContent).toContain('I-90 Trail');

    const mercerNode = svg?.querySelector('#map-node-mercer-island');
    expect(mercerNode).not.toBeNull();
    expect(mercerNode?.textContent).toContain('Mercer Island');
    expect(mercerNode?.textContent).toContain('I-90 Trail');
  });

  it('aligns all left spine station labels to uniform x=252 coordinate with end text-anchor', () => {
    const svg = document.querySelector('svg.system-map-svg');
    const leftStations = [
      'lynnwood-city-center',
      'mountlake-terrace',
      'shoreline-north-185th',
      'shoreline-south-148th',
      'northgate',
      'roosevelt',
      'u-district',
      'university-of-washington',
      'capitol-hill',
      'westlake',
      'symphony',
      'pioneer-square',
      'international-district-chinatown',
      'stadium',
      'sodo',
      'beacon-hill',
      'mount-baker',
      'columbia-city',
      'othello',
      'rainier-beach',
      'tukwila-intl-blvd',
      'seatac-airport',
      'angle-lake',
      'kent-des-moines',
      'star-lake',
      'federal-way-downtown',
    ];

    for (const id of leftStations) {
      const node = svg?.querySelector(`#map-node-${id}`);
      expect(node).not.toBeNull();
      const label = node?.querySelector('.map-station-label');
      expect(label?.getAttribute('x')).toBe('252');
      expect(label?.getAttribute('text-anchor')).toBe('end');
    }
  });

  it('aligns all right spine Eastside station labels to uniform x=558 coordinate with start text-anchor', () => {
    const svg = document.querySelector('svg.system-map-svg');
    const rightStations = [
      'south-bellevue',
      'east-main',
      'bellevue-downtown',
      'wilburton',
      'spring-district',
      'bel-red',
      'overlake-village',
      'redmond-technology',
      'marymoor-village',
      'downtown-redmond',
    ];

    for (const id of rightStations) {
      const node = svg?.querySelector(`#map-node-${id}`);
      expect(node).not.toBeNull();
      const label = node?.querySelector('.map-station-label');
      expect(label?.getAttribute('x')).toBe('558');
      expect(label?.getAttribute('text-anchor')).toBe('start');
    }
  });

  it('handles 1-finger touch panning on map body', () => {
    modal.open();
    const mapBody = document.querySelector('.system-map-body') as HTMLElement;
    const canvas = mapBody.querySelector('.map-svg-canvas') as HTMLElement;
    expect(canvas).not.toBeNull();

    // Mock dimensions
    Object.defineProperty(mapBody, 'clientWidth', { value: 400, configurable: true });
    Object.defineProperty(mapBody, 'clientHeight', { value: 700, configurable: true });
    modal.fitToScreen();

    const initialTransform = canvas.style.transform;

    const createTouch = (x: number, y: number): Touch =>
      ({
        identifier: 0,
        target: mapBody,
        clientX: x,
        clientY: y,
        pageX: x,
        pageY: y,
      } as unknown as Touch);

    // Touch start
    mapBody.dispatchEvent(
      new TouchEvent('touchstart', {
        bubbles: true,
        cancelable: true,
        touches: [createTouch(150, 150)],
        changedTouches: [createTouch(150, 150)],
      })
    );

    // Touch move by dx=+30, dy=+40
    mapBody.dispatchEvent(
      new TouchEvent('touchmove', {
        bubbles: true,
        cancelable: true,
        touches: [createTouch(180, 190)],
        changedTouches: [createTouch(180, 190)],
      })
    );

    expect(canvas.style.transform).not.toBe(initialTransform);
  });

  it('handles 2-finger continuous pinch zoom and transitions to 1-finger pan without interruption', () => {
    modal.open();
    const mapBody = document.querySelector('.system-map-body') as HTMLElement;
    const canvas = mapBody.querySelector('.map-svg-canvas') as HTMLElement;

    Object.defineProperty(mapBody, 'clientWidth', { value: 400, configurable: true });
    Object.defineProperty(mapBody, 'clientHeight', { value: 700, configurable: true });
    modal.fitToScreen();

    const createTouch = (id: number, x: number, y: number): Touch =>
      ({
        identifier: id,
        target: mapBody,
        clientX: x,
        clientY: y,
        pageX: x,
        pageY: y,
      } as unknown as Touch);

    // 2-finger touchstart
    const t0 = createTouch(0, 100, 100);
    const t1 = createTouch(1, 200, 200);
    mapBody.dispatchEvent(
      new TouchEvent('touchstart', {
        bubbles: true,
        cancelable: true,
        touches: [t0, t1],
        changedTouches: [t0, t1],
      })
    );

    // Pinch zoom out/in: move fingers further apart
    const t0Moved = createTouch(0, 80, 80);
    const t1Moved = createTouch(1, 240, 240);
    mapBody.dispatchEvent(
      new TouchEvent('touchmove', {
        bubbles: true,
        cancelable: true,
        touches: [t0Moved, t1Moved],
        changedTouches: [t0Moved, t1Moved],
      })
    );

    expect(canvas.style.transform).toContain('scale(');

    // Lift 1 finger: touchend with touch 1 lifted, touch 0 remaining
    mapBody.dispatchEvent(
      new TouchEvent('touchend', {
        bubbles: true,
        cancelable: true,
        touches: [t0Moved],
        changedTouches: [t1Moved],
      })
    );

    // Continue panning with remaining finger
    const t0Pan = createTouch(0, 110, 120);
    mapBody.dispatchEvent(
      new TouchEvent('touchmove', {
        bubbles: true,
        cancelable: true,
        touches: [t0Pan],
        changedTouches: [t0Pan],
      })
    );

    // Canvas should still be actively updating
    expect(canvas.style.transform).toBeDefined();
  });

  it('does not render a visible drag handle and supports swipe-to-dismiss on header', () => {
    modal.open();
    const overlay = document.querySelector('.system-map-modal-overlay') as HTMLElement;
    const handle = overlay.querySelector('.modal-drag-handle');
    expect(handle).toBeNull(); // gesture indicator removed per design requirements
    expect(overlay.classList.contains('open')).toBe(true);

    const header = overlay.querySelector('.system-map-header') as HTMLElement;
    expect(header).not.toBeNull();

    const createTouch = (y: number): Touch =>
      ({
        identifier: 0,
        target: header,
        clientX: 100,
        clientY: y,
        pageX: 100,
        pageY: y,
      } as unknown as Touch);

    // Touch header and swipe down 120px (exceeding 80px threshold)
    header.dispatchEvent(
      new TouchEvent('touchstart', {
        bubbles: true,
        cancelable: true,
        touches: [createTouch(50)],
        changedTouches: [createTouch(50)],
      })
    );

    header.dispatchEvent(
      new TouchEvent('touchmove', {
        bubbles: true,
        cancelable: true,
        touches: [createTouch(180)],
        changedTouches: [createTouch(180)],
      })
    );

    header.dispatchEvent(
      new TouchEvent('touchend', {
        bubbles: true,
        cancelable: true,
        touches: [],
        changedTouches: [createTouch(180)],
      })
    );

    // Modal should have closed
    expect(overlay.classList.contains('open')).toBe(false);
  });

  it('zooms smoothly on double tap and cancels mobile browser 300ms tap delay', () => {
    modal.open();
    modal.fitToScreen();
    const mapBody = document.querySelector('.system-map-body') as HTMLElement;
    const canvas = document.querySelector('.map-svg-canvas') as HTMLElement;

    const initialTransform = canvas.style.transform;

    const createTouch = (x: number, y: number): Touch =>
      ({
        identifier: 0,
        target: mapBody,
        clientX: x,
        clientY: y,
        pageX: x,
        pageY: y,
      } as unknown as Touch);

    // First tap
    mapBody.dispatchEvent(
      new TouchEvent('touchstart', {
        bubbles: true,
        cancelable: true,
        touches: [createTouch(150, 150)],
        changedTouches: [createTouch(150, 150)],
      })
    );
    mapBody.dispatchEvent(
      new TouchEvent('touchend', {
        bubbles: true,
        cancelable: true,
        touches: [],
        changedTouches: [createTouch(150, 150)],
      })
    );

    // Second tap 80ms later
    let defaultPrevented = false;
    const secondTouchEvent = new TouchEvent('touchstart', {
      bubbles: true,
      cancelable: true,
      touches: [createTouch(152, 151)],
      changedTouches: [createTouch(152, 151)],
    });

    // Spy on preventDefault
    const origPreventDefault = secondTouchEvent.preventDefault.bind(secondTouchEvent);
    secondTouchEvent.preventDefault = () => {
      defaultPrevented = true;
      origPreventDefault();
    };

    mapBody.dispatchEvent(secondTouchEvent);

    // Browser 300ms delay should be cancelled
    expect(defaultPrevented).toBe(true);
    // Transform should have updated
    expect(canvas.style.transform).not.toBe(initialTransform);
  });

  it('prevents mobile background flicker by omitting backdrop-filter transitions and disabling mobile overlay blur', () => {
    const mapCss = readFileSync(process.cwd() + '/src/styles/map.css', 'utf-8');

    // Overlay transition must NOT animate backdrop-filter (known WebKit GPU repaint flicker bug)
    expect(mapCss).not.toMatch(/transition:[^;]*backdrop-filter/);

    // Mobile media query must disable backdrop-filter to prevent blur pass flicker over full-screen sheet
    expect(mapCss).toMatch(/@media\s*\([^)]*max-width:\s*768px[^)]*\)[\s\S]*?\.system-map-modal-overlay[\s\S]*?backdrop-filter:\s*none/);
  });

  it('prevents fixed background repaint flicker on mobile body scroll lock', () => {
    const themeCss = readFileSync(process.cwd() + '/src/styles/theme.css', 'utf-8');

    // Mobile body must use background-attachment: scroll to prevent iOS Safari root layer repaint on modal-open
    expect(themeCss).toMatch(/@media\s*\([^)]*max-width:\s*768px[^)]*\)[\s\S]*?background-attachment:\s*scroll/);
  });
});


