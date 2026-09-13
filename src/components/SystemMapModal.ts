import { createElement, ICONS } from '../utils/dom';
import { lockBodyScroll, unlockBodyScroll } from '../utils/scrollLock';
import { attachBottomSheetSwipe } from '../utils/bottomSheetGesture';

export class SystemMapModal {
  private overlay: HTMLElement;
  private bodyEl!: HTMLElement;
  private canvasEl!: HTMLElement;
  private svgInitialized: boolean = false;

  private fitScale: number = 1;
  private minScale: number = 0.5;
  private maxScale: number = 4;
  private currentScale: number = 1;
  private currentX: number = 0;
  private currentY: number = 0;

  private lastTapTime: number = 0;
  private lastTapX: number = 0;
  private lastTapY: number = 0;

  private viewportW: number = 400;
  private viewportH: number = 700;
  private bodyRectLeft: number = 0;
  private bodyRectTop: number = 0;
  private momentumRaf: number | null = null;
  private tweenRaf: number | null = null;
  private openRaf: number | null = null;
  private resizeRaf: number | null = null;
  private openTimer?: number;
  private wheelSnapTimer?: number;

  private isMouseDown = false;
  private mouseStartX = 0;
  private mouseStartY = 0;
  private mouseStartTransX = 0;
  private mouseStartTransY = 0;

  private handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Escape' && this.overlay.classList.contains('open')) {
      this.close();
    }
  };

  private handleMouseMove = (e: MouseEvent) => {
    if (!this.isMouseDown) return;
    const dx = e.clientX - this.mouseStartX;
    const dy = e.clientY - this.mouseStartY;
    const nextX = this.mouseStartTransX + dx;
    const nextY = this.mouseStartTransY + dy;
    const clamped = this.clampOffsets(nextX, nextY, this.currentScale, true);
    this.currentX = clamped.x;
    this.currentY = clamped.y;
    this.applyTransform();
  };

  private handleMouseUp = () => {
    if (this.isMouseDown) {
      this.isMouseDown = false;
      this.bodyEl.classList.remove('is-panning');
      window.removeEventListener('mousemove', this.handleMouseMove);
      window.removeEventListener('mouseup', this.handleMouseUp);
      this.snapToBoundsIfNeeded();
    }
  };

  private handleResize = () => {
    if (this.overlay.classList.contains('open')) {
      if (this.resizeRaf !== null) return;
      this.resizeRaf = requestAnimationFrame(() => {
        this.resizeRaf = null;
        this.fitToScreen();
      });
    }
  };

  constructor() {
    this.overlay = this.render();
    document.body.appendChild(this.overlay);
    this.setupEventListeners();
  }

  public open() {
    if (this.overlay.classList.contains('open')) return;
    // Lazy-init: generate the heavy SVG map only on first open to avoid ~36KB DOM on page load
    if (!this.svgInitialized && this.canvasEl) {
      this.canvasEl.innerHTML = this.generateOfficialSchematicSvg();
      this.svgInitialized = true;
    }

    this.overlay.classList.add('open');
    lockBodyScroll();
    window.addEventListener('keydown', this.handleKeyDown);
    window.addEventListener('resize', this.handleResize);

    // Ensure viewport is measured accurately on next frame and after transition
    if (this.openRaf !== null) {
      cancelAnimationFrame(this.openRaf);
      this.openRaf = null;
    }
    this.openRaf = requestAnimationFrame(() => {
      this.fitToScreen();
      this.openRaf = null;
    });

    if (this.openTimer !== undefined) clearTimeout(this.openTimer);
    this.openTimer = window.setTimeout(() => {
      this.fitToScreen();
      this.openTimer = undefined;
    }, 260);
  }

  public close() {
    if (!this.overlay.classList.contains('open')) return;
    this.stopMomentum();
    this.stopTween();
    if (this.openRaf !== null) {
      cancelAnimationFrame(this.openRaf);
      this.openRaf = null;
    }
    if (this.openTimer !== undefined) {
      clearTimeout(this.openTimer);
      this.openTimer = undefined;
    }
    if (this.wheelSnapTimer !== undefined) {
      clearTimeout(this.wheelSnapTimer);
      this.wheelSnapTimer = undefined;
    }
    if (this.resizeRaf !== null) {
      cancelAnimationFrame(this.resizeRaf);
      this.resizeRaf = null;
    }
    if (this.isMouseDown) {
      this.isMouseDown = false;
      if (this.bodyEl) this.bodyEl.classList.remove('is-panning');
      window.removeEventListener('mousemove', this.handleMouseMove);
      window.removeEventListener('mouseup', this.handleMouseUp);
    }
    this.overlay.classList.remove('open');
    unlockBodyScroll();
    window.removeEventListener('keydown', this.handleKeyDown);
    window.removeEventListener('resize', this.handleResize);
  }

  private updateCachedDimensions() {
    if (!this.bodyEl) return;
    this.viewportW = this.bodyEl.clientWidth || (typeof window !== 'undefined' ? window.innerWidth : 400) || 400;
    this.viewportH = this.bodyEl.clientHeight || (typeof window !== 'undefined' ? window.innerHeight * 0.75 : 700) || 700;
    if (typeof this.bodyEl.getBoundingClientRect === 'function') {
      const rect = this.bodyEl.getBoundingClientRect();
      this.bodyRectLeft = rect.left;
      this.bodyRectTop = rect.top;
    }
  }

  public fitToScreen(force: boolean = false) {
    if (!this.bodyEl) return;
    this.stopMomentum();
    const prevW = this.viewportW;
    const prevH = this.viewportH;
    this.updateCachedDimensions();
    const w = this.viewportW;
    const h = this.viewportH;

    // Avoid redundant transform recalculations if viewport geometry is unchanged
    if (
      !force &&
      prevW === w &&
      prevH === h &&
      this.fitScale > 0 &&
      Math.abs(this.currentScale - this.fitScale) < 0.001
    ) {
      return;
    }

    const padding = 16;

    const scaleX = (w - padding * 2) / 830;
    const scaleY = (h - padding * 2) / 1280;
    this.fitScale = Math.min(scaleX, scaleY);
    this.minScale = this.fitScale * 0.88;
    this.maxScale = Math.max(3.0, this.fitScale * 4.5);

    this.currentScale = this.fitScale;
    this.currentX = (w - 830 * this.fitScale) / 2;
    this.currentY = (h - 1280 * this.fitScale) / 2;

    if (this.canvasEl) {
      this.canvasEl.style.transition = 'none';
    }
    this.applyTransform();
  }

  private applyTransform() {
    if (this.canvasEl) {
      this.canvasEl.style.transform = `translate3d(${this.currentX}px, ${this.currentY}px, 0) scale(${this.currentScale})`;
    }
  }

  private clampOffsets(tx: number, ty: number, s: number, allowElastic: boolean = false): { x: number; y: number } {
    const w = this.viewportW || 400;
    const h = this.viewportH || 700;
    const mapW = 830 * s;
    const mapH = 1280 * s;
    const margin = allowElastic ? 60 : 16;

    let minX: number;
    let maxX: number;
    if (mapW <= w) {
      const center = (w - mapW) / 2;
      minX = allowElastic ? center - margin : center;
      maxX = allowElastic ? center + margin : center;
    } else {
      minX = w - mapW - margin;
      maxX = margin;
    }

    let minY: number;
    let maxY: number;
    if (mapH <= h) {
      const center = (h - mapH) / 2;
      minY = allowElastic ? center - margin : center;
      maxY = allowElastic ? center + margin : center;
    } else {
      minY = h - mapH - margin;
      maxY = margin;
    }

    const x = Math.min(maxX, Math.max(minX, tx));
    const y = Math.min(maxY, Math.max(minY, ty));
    return { x, y };
  }

  private stopTween() {
    if (this.tweenRaf !== null) {
      cancelAnimationFrame(this.tweenRaf);
      this.tweenRaf = null;
    }
  }

  private stopMomentum() {
    if (this.momentumRaf !== null) {
      cancelAnimationFrame(this.momentumRaf);
      this.momentumRaf = null;
    }
    this.stopTween();
  }

  private snapToBoundsIfNeeded(isBounce: boolean = false) {
    const targetScale = Math.min(this.maxScale, Math.max(this.fitScale, this.currentScale));
    const strict = this.clampOffsets(this.currentX, this.currentY, targetScale, false);

    const needsPositionSnap = Math.abs(strict.x - this.currentX) > 0.5 || Math.abs(strict.y - this.currentY) > 0.5;
    const needsScaleSnap = Math.abs(targetScale - this.currentScale) > 0.005;

    if (needsPositionSnap || needsScaleSnap) {
      const isUnderZoomed = this.currentScale < this.fitScale;
      const duration = isBounce || isUnderZoomed ? 340 : 220;
      this.animateTo(targetScale, strict.x, strict.y, duration, isBounce || isUnderZoomed);
    }
  }

  private startMomentum(initialVx: number, initialVy: number) {
    this.stopMomentum();
    let vx = initialVx;
    let vy = initialVy;
    const speed = Math.hypot(vx, vy);

    if (speed < 0.2) {
      this.snapToBoundsIfNeeded();
      return;
    }

    const maxSpeed = 35;
    if (speed > maxSpeed) {
      vx = (vx / speed) * maxSpeed;
      vy = (vy / speed) * maxSpeed;
    }

    const friction = 0.93;

    const step = () => {
      vx *= friction;
      vy *= friction;

      if (Math.hypot(vx, vy) < 0.15) {
        this.snapToBoundsIfNeeded();
        return;
      }

      const nextX = this.currentX + vx;
      const nextY = this.currentY + vy;
      const clamped = this.clampOffsets(nextX, nextY, this.currentScale, false);

      if (Math.abs(clamped.x - this.currentX) < 0.01) vx = 0;
      if (Math.abs(clamped.y - this.currentY) < 0.01) vy = 0;

      this.currentX = clamped.x;
      this.currentY = clamped.y;
      this.applyTransform();

      this.momentumRaf = requestAnimationFrame(step);
    };

    this.momentumRaf = requestAnimationFrame(step);
  }

  private animateTo(
    targetScale: number,
    targetX: number,
    targetY: number,
    duration: number = 200,
    useSpring: boolean = false
  ) {
    if (!this.canvasEl) return;
    this.stopMomentum();

    const startScale = this.currentScale;
    const startX = this.currentX;
    const startY = this.currentY;

    if (
      Math.abs(targetScale - startScale) < 0.001 &&
      Math.abs(targetX - startX) < 0.5 &&
      Math.abs(targetY - startY) < 0.5
    ) {
      this.currentScale = targetScale;
      this.currentX = targetX;
      this.currentY = targetY;
      this.applyTransform();
      return;
    }

    this.canvasEl.style.transition = 'none';
    const startTime = performance.now();

    // Damped harmonic spring: pleasant bounce overshoot when recovering from over-zoom
    const springEase = (t: number) => {
      return 1 - Math.exp(-6 * t) * Math.cos(7 * t);
    };
    const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3);
    const easingFn = useSpring ? springEase : easeOutCubic;

    // Micro-advance immediately on this tick so the user sees an instantaneous, zero-delay response
    this.currentScale = startScale + (targetScale - startScale) * 0.06;
    this.currentX = startX + (targetX - startX) * 0.06;
    this.currentY = startY + (targetY - startY) * 0.06;
    this.applyTransform();

    const step = (now: number) => {
      const elapsed = now - startTime;
      const progress = Math.min(1, elapsed / duration);
      const eased = easingFn(progress);

      this.currentScale = startScale + (targetScale - startScale) * eased;
      this.currentX = startX + (targetX - startX) * eased;
      this.currentY = startY + (targetY - startY) * eased;
      this.applyTransform();

      if (progress < 1) {
        this.tweenRaf = requestAnimationFrame(step);
      } else {
        this.tweenRaf = null;
        this.currentScale = targetScale;
        this.currentX = targetX;
        this.currentY = targetY;
        this.applyTransform();
      }
    };

    this.tweenRaf = requestAnimationFrame(step);
  }

  private handleDoubleTap(clientX: number, clientY: number) {
    this.stopMomentum();
    this.updateCachedDimensions();
    const px = clientX - this.bodyRectLeft;
    const py = clientY - this.bodyRectTop;

    if (this.currentScale > this.fitScale * 1.3) {
      // Zoom out to fit
      this.animateTo(
        this.fitScale,
        (this.viewportW - 830 * this.fitScale) / 2,
        (this.viewportH - 1280 * this.fitScale) / 2
      );
    } else {
      // Zoom in 2.4x
      const targetScale = Math.min(this.maxScale, this.fitScale * 2.4);
      const targetX = px - (px - this.currentX) * (targetScale / this.currentScale);
      const targetY = py - (py - this.currentY) * (targetScale / this.currentScale);
      const clamped = this.clampOffsets(targetX, targetY, targetScale, false);
      this.animateTo(targetScale, clamped.x, clamped.y);
    }
  }

  private setupEventListeners() {
    if (!this.bodyEl) return;

    let isTouching = false;
    let lastMidX = 0;
    let lastMidY = 0;
    let lastDist = 0;
    let velocityX = 0;
    let velocityY = 0;
    let lastMoveTime = 0;

    this.bodyEl.addEventListener(
      'touchstart',
      (e: TouchEvent) => {
        this.stopMomentum();
        this.updateCachedDimensions();

        if (e.touches.length === 1) {
          const t = e.touches[0];
          const tapX = t.clientX - this.bodyRectLeft;
          const tapY = t.clientY - this.bodyRectTop;
          const now = Date.now();

          if (
            now - this.lastTapTime < 300 &&
            Math.hypot(tapX - this.lastTapX, tapY - this.lastTapY) < 40
          ) {
            if (e.cancelable) e.preventDefault();
            this.handleDoubleTap(t.clientX, t.clientY);
            this.lastTapTime = 0;
            isTouching = false;
            return;
          }
          this.lastTapTime = now;
          this.lastTapX = tapX;
          this.lastTapY = tapY;

          isTouching = true;
          lastMidX = t.clientX;
          lastMidY = t.clientY;
          lastDist = 0;
          velocityX = 0;
          velocityY = 0;
          lastMoveTime = now;
          if (this.canvasEl) this.canvasEl.style.transition = 'none';
        } else if (e.touches.length >= 2) {
          isTouching = true;
          const t0 = e.touches[0];
          const t1 = e.touches[1];
          lastMidX = (t0.clientX + t1.clientX) / 2;
          lastMidY = (t0.clientY + t1.clientY) / 2;
          lastDist = Math.hypot(t0.clientX - t1.clientX, t0.clientY - t1.clientY);
          velocityX = 0;
          velocityY = 0;
          lastMoveTime = Date.now();
          if (this.canvasEl) this.canvasEl.style.transition = 'none';
        }
      },
      { passive: false }
    );

    this.bodyEl.addEventListener(
      'touchmove',
      (e: TouchEvent) => {
        if (!isTouching) return;
        if (e.cancelable) e.preventDefault();

        const now = Date.now();
        const dt = Math.max(1, now - lastMoveTime);

        if (e.touches.length === 1) {
          const t = e.touches[0];
          const dx = t.clientX - lastMidX;
          const dy = t.clientY - lastMidY;

          // Velocity smoothing for momentum release
          velocityX = velocityX * 0.4 + (dx / dt) * 16 * 0.6;
          velocityY = velocityY * 0.4 + (dy / dt) * 16 * 0.6;

          const nextX = this.currentX + dx;
          const nextY = this.currentY + dy;
          const clamped = this.clampOffsets(nextX, nextY, this.currentScale, true);

          this.currentX = clamped.x;
          this.currentY = clamped.y;
          this.applyTransform();

          lastMidX = t.clientX;
          lastMidY = t.clientY;
          lastMoveTime = now;
        } else if (e.touches.length >= 2) {
          const t0 = e.touches[0];
          const t1 = e.touches[1];
          const curMidX = (t0.clientX + t1.clientX) / 2;
          const curMidY = (t0.clientY + t1.clientY) / 2;
          const curDist = Math.hypot(t0.clientX - t1.clientX, t0.clientY - t1.clientY);

          const dx = curMidX - lastMidX;
          const dy = curMidY - lastMidY;

          let newScale = this.currentScale;
          if (lastDist > 0 && curDist > 0) {
            const factor = curDist / lastDist;
            let rawScale = this.currentScale * factor;
            if (rawScale < this.fitScale) {
              // Elastic resistance damping when pinching out beyond fit scale
              rawScale = this.fitScale - (this.fitScale - rawScale) * 0.45;
            }
            newScale = Math.min(
              this.maxScale,
              Math.max(this.minScale, rawScale)
            );
          }

          // Focal zoom around touch midpoint
          const focalX = curMidX - this.bodyRectLeft;
          const focalY = curMidY - this.bodyRectTop;
          const scaleChange = newScale / this.currentScale;

          const nextX = focalX - (focalX - this.currentX) * scaleChange + dx;
          const nextY = focalY - (focalY - this.currentY) * scaleChange + dy;
          const clamped = this.clampOffsets(nextX, nextY, newScale, true);

          this.currentScale = newScale;
          this.currentX = clamped.x;
          this.currentY = clamped.y;
          this.applyTransform();

          lastMidX = curMidX;
          lastMidY = curMidY;
          lastDist = curDist;
          lastMoveTime = now;
          velocityX = 0;
          velocityY = 0;
        }
      },
      { passive: false }
    );

    const handleTouchEnd = (e: TouchEvent) => {
      if (!isTouching) return;

      if (e.touches.length === 1) {
        // Seamless 2-finger to 1-finger transition
        const t = e.touches[0];
        lastMidX = t.clientX;
        lastMidY = t.clientY;
        lastDist = 0;
        velocityX = 0;
        velocityY = 0;
        lastMoveTime = Date.now();
      } else if (e.touches.length === 0) {
        isTouching = false;
        const timeSinceLastMove = Date.now() - lastMoveTime;

        if (timeSinceLastMove > 80) {
          velocityX = 0;
          velocityY = 0;
        }

        if (this.currentScale < this.fitScale) {
          this.snapToBoundsIfNeeded(true);
        } else if (Math.hypot(velocityX, velocityY) > 0.5) {
          this.startMomentum(velocityX, velocityY);
        } else {
          this.snapToBoundsIfNeeded();
        }
      }
    };

    this.bodyEl.addEventListener('touchend', handleTouchEnd);
    this.bodyEl.addEventListener('touchcancel', handleTouchEnd);

    // Desktop Mouse Controls: Attach window listeners only while dragging to eliminate idle CPU overhead
    this.bodyEl.addEventListener('mousedown', (e: MouseEvent) => {
      if (e.button !== 0) return;
      this.stopMomentum();
      this.updateCachedDimensions();
      this.isMouseDown = true;
      this.mouseStartX = e.clientX;
      this.mouseStartY = e.clientY;
      this.mouseStartTransX = this.currentX;
      this.mouseStartTransY = this.currentY;
      this.bodyEl.classList.add('is-panning');
      if (this.canvasEl) this.canvasEl.style.transition = 'none';

      window.addEventListener('mousemove', this.handleMouseMove);
      window.addEventListener('mouseup', this.handleMouseUp);
    });

    this.bodyEl.addEventListener(
      'wheel',
      (e: WheelEvent) => {
        e.preventDefault();
        this.stopMomentum();
        this.updateCachedDimensions();
        const px = e.clientX - this.bodyRectLeft;
        const py = e.clientY - this.bodyRectTop;
        const factor = e.deltaY < 0 ? 1.14 : 0.88;
        let newScale = this.currentScale * factor;
        if (newScale < this.fitScale) {
          // Elastic resistance damping when scrolling out beyond fit scale
          newScale = this.fitScale - (this.fitScale - newScale) * 0.45;
        }
        newScale = Math.min(
          this.maxScale,
          Math.max(this.minScale, newScale)
        );
        const nextX = px - (px - this.currentX) * (newScale / this.currentScale);
        const nextY = py - (py - this.currentY) * (newScale / this.currentScale);
        const clamped = this.clampOffsets(nextX, nextY, newScale, newScale < this.fitScale);
        this.currentScale = newScale;
        this.currentX = clamped.x;
        this.currentY = clamped.y;
        this.applyTransform();

        // Bounce back if zoomed out beyond fitScale or out of bounds
        if (this.wheelSnapTimer !== undefined) {
          clearTimeout(this.wheelSnapTimer);
        }
        this.wheelSnapTimer = window.setTimeout(() => {
          this.wheelSnapTimer = undefined;
          this.snapToBoundsIfNeeded(this.currentScale < this.fitScale);
        }, 140);
      },
      { passive: false }
    );
  }

  private render(): HTMLElement {
    const overlay = createElement('div', 'system-map-modal-overlay');
    const container = createElement('div', 'system-map-container');

    // Header
    const header = createElement('div', 'system-map-header');

    // Header Top Row: Brand & Title on left, Close button on right
    const headerTop = createElement('div', 'system-map-header-top');
    const titleGroup = createElement('div', 'system-map-title-group');
    const iconBadge = createElement('div', 'system-map-icon-badge', ICONS.train);
    const textGroup = createElement('div', 'system-map-text');
    const title = createElement('h3', 'system-map-title', 'Sound Transit Link Map');
    textGroup.appendChild(title);
    titleGroup.appendChild(iconBadge);
    titleGroup.appendChild(textGroup);

    const actions = createElement('div', 'system-map-header-actions');
    const closeBtn = createElement('button', 'icon-btn modal-close-btn', ICONS.close);
    closeBtn.setAttribute('aria-label', 'Close Link Map');
    closeBtn.title = 'Close Link Map';
    closeBtn.onclick = () => this.close();
    actions.appendChild(closeBtn);

    headerTop.appendChild(titleGroup);
    headerTop.appendChild(actions);

    // Header Legend Row: Clean pills underneath title, never competing with close button
    const headerLegend = createElement('div', 'system-map-header-legend');
    headerLegend.innerHTML = `
      <div class="map-legend-item">
        <span class="map-legend-line-sample line-1"></span>
        <span><strong>1 Line</strong> <span class="legend-dest-desc">(Lynnwood ⇄ Federal Way)</span></span>
      </div>
      <div class="map-legend-item">
        <span class="map-legend-line-sample line-2"></span>
        <span><strong>2 Line</strong> <span class="legend-dest-desc">(Lynnwood ⇄ Redmond)</span></span>
      </div>
    `;

    const officialLink = createElement(
      'a',
      'map-official-link',
      `Stations Directory ↗`
    ) as HTMLAnchorElement;
    officialLink.href = 'https://www.soundtransit.org/ride-with-us/stations/link-light-rail-stations';
    officialLink.target = '_blank';
    officialLink.rel = 'noopener noreferrer';
    headerLegend.appendChild(officialLink);

    header.appendChild(headerTop);
    header.appendChild(headerLegend);

    // Map Viewport Body
    this.bodyEl = createElement('div', 'system-map-body');

    // SVG Canvas (content lazily populated on first open())
    this.canvasEl = createElement('div', 'map-svg-canvas');
    this.bodyEl.appendChild(this.canvasEl);

    container.appendChild(header);
    container.appendChild(this.bodyEl);
    overlay.appendChild(container);

    // Enable mobile swipe-to-dismiss gesture directly on header (no indicator bar needed)
    attachBottomSheetSwipe({
      overlay,
      container,
      header,
      onClose: () => this.close(),
    });

    overlay.onclick = (e) => {
      if (e.target === overlay) this.close();
    };

    return overlay;
  }

  private generateOfficialSchematicSvg(): string {
    return `
      <svg class="system-map-svg" viewBox="0 0 830 1280" width="830" height="1280" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <linearGradient id="transfer-border-grad" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stop-color="#008542" />
            <stop offset="50%" stop-color="#38bdf8" />
            <stop offset="100%" stop-color="#0072CE" />
          </linearGradient>
        </defs>

        <!-- Background crosshair ticks matrix -->
        <pattern id="grid" width="48" height="48" patternUnits="userSpaceOnUse">
          <path d="M 24 20.5 L 24 27.5 M 20.5 24 L 27.5 24" fill="none" stroke="rgba(255, 255, 255, 0.075)" stroke-width="1.2" stroke-linecap="round"/>
        </pattern>
        <rect x="-12000" y="-12000" width="24830" height="25280" fill="url(#grid)" />

        <!-- ================= TRACK LINES ================= -->

        <!-- 1 Line Track (Green #008542) - Multi-Layer Vector Glow -->
        <path class="map-track-path line-1-aura map-elem-line-1"
          d="M 272,75 L 272,1210" stroke="#008542" stroke-width="16" opacity="0.12" stroke-linecap="round" />
        <path class="map-track-path line-1-glow map-elem-line-1"
          d="M 272,75 L 272,1210" stroke="#008542" stroke-width="11" opacity="0.32" stroke-linecap="round" />
        <path class="map-track-path line-1-main map-elem-line-1"
          d="M 272,75 L 272,1210" stroke="#008542" stroke-width="7" stroke-linecap="round" fill="none" />

        <!-- 2 Line Track (Blue #0072CE) - Shared in North/Tunnel + Eastside Corridor - Multi-Layer Vector Glow -->
        <path class="map-track-path line-2-aura map-elem-line-2 map-elem-shared"
          d="M 298,75 L 298,615 Q 298,665 338,665 L 500,665 Q 540,665 540,635 L 540,75"
          stroke="#0072CE" stroke-width="16" opacity="0.12" stroke-linecap="round" stroke-linejoin="round" />
        <path class="map-track-path line-2-glow map-elem-line-2 map-elem-shared"
          d="M 298,75 L 298,615 Q 298,665 338,665 L 500,665 Q 540,665 540,635 L 540,75"
          stroke="#0072CE" stroke-width="11" opacity="0.32" stroke-linecap="round" stroke-linejoin="round" />
        <path class="map-track-path line-2-main map-elem-line-2 map-elem-shared"
          d="M 298,75 L 298,615 Q 298,665 338,665 L 500,665 Q 540,665 540,635 L 540,75"
          stroke="#0072CE" stroke-width="7" stroke-linecap="round" stroke-linejoin="round" fill="none" />

        <!-- ================= TERMINUS HEADERS & BULLETS ================= -->

        <!-- North Terminus (Lynnwood City Center) -->
        <g class="map-terminus-badge map-elem-line-1 map-elem-line-2" transform="translate(285, 42)">
          <rect x="-42" y="-16" width="84" height="26" rx="13" fill="#0f172a" stroke="rgba(255,255,255,0.35)" stroke-width="1.5" />
          <circle cx="-13" cy="-3" r="9" fill="#008542" />
          <text x="-13" y="0.5" fill="#ffffff" font-size="11" font-weight="800" text-anchor="middle">1</text>
          <circle cx="13" cy="-3" r="9" fill="#0072CE" />
          <text x="13" y="0.5" fill="#ffffff" font-size="11" font-weight="800" text-anchor="middle">2</text>
        </g>

        <!-- 2 Line East Terminus (Downtown Redmond) -->
        <g class="map-terminus-badge map-elem-line-2" transform="translate(540, 42)">
          <rect x="-24" y="-16" width="48" height="26" rx="13" fill="#0f172a" stroke="rgba(0,114,206,0.6)" stroke-width="1.5" />
          <circle cx="0" cy="-3" r="9" fill="#0072CE" />
          <text x="0" y="0.5" fill="#ffffff" font-size="11" font-weight="800" text-anchor="middle">2</text>
        </g>

        <!-- 1 Line South Terminus (Federal Way Downtown) -->
        <g class="map-terminus-badge map-elem-line-1" transform="translate(272, 1242)">
          <rect x="-24" y="-16" width="48" height="26" rx="13" fill="#0f172a" stroke="rgba(0,133,66,0.6)" stroke-width="1.5" />
          <circle cx="0" cy="-3" r="9" fill="#008542" />
          <text x="0" y="0.5" fill="#ffffff" font-size="11" font-weight="800" text-anchor="middle">1</text>
        </g>

        <!-- ================= LEFT SPINE: SHARED 1 LINE & 2 LINE STATIONS ================= -->
        ${this.renderDualCapsuleStation('lynnwood-city-center', 285, 75, 'Lynnwood City Center', 'Park & Ride / Transit Center', 'left', true)}
        ${this.renderDualCapsuleStation('mountlake-terrace', 285, 120, 'Mountlake Terrace', 'Park & Ride / Freeway Station', 'left')}
        ${this.renderDualCapsuleStation('shoreline-north-185th', 285, 165, 'Shoreline North/185th', 'Park & Ride / NE 185th St', 'left')}
        ${this.renderDualCapsuleStation('shoreline-south-148th', 285, 210, 'Shoreline South/148th', 'Park & Ride / NE 148th St', 'left')}
        ${this.renderDualCapsuleStation('northgate', 285, 255, 'Northgate', 'Park & Ride / Kraken Iceplex', 'left')}
        ${this.renderDualCapsuleStation('roosevelt', 285, 300, 'Roosevelt', 'Park & Ride / Roosevelt High', 'left')}
        ${this.renderDualCapsuleStation('u-district', 285, 345, 'U District', 'UW Tower / The Ave', 'left')}
        ${this.renderDualCapsuleStation('university-of-washington', 285, 390, 'University of Washington', 'Husky Stadium / UW Medical', 'left')}
        ${this.renderDualCapsuleStation('capitol-hill', 285, 435, 'Capitol Hill', 'Broadway / First Hill Streetcar', 'left')}

        <!-- Downtown Seattle Transit Tunnel Stations -->
        ${this.renderDualCapsuleStation('westlake', 285, 480, 'Westlake', 'Seattle Center Monorail / Pine St', 'left')}
        ${this.renderDualCapsuleStation('symphony', 285, 525, 'Symphony', 'Benaroya Hall / University St', 'left')}
        ${this.renderDualCapsuleStation('pioneer-square', 285, 570, 'Pioneer Square', 'WA State Ferries / Streetcar', 'left')}
        
        <!-- Highlighted 1 Line ⇄ 2 Line Transfer Hub -->
        ${this.renderTransferHubStation('international-district-chinatown', 285, 615, 'Intl. District / Chinatown')}

        <!-- ================= LEFT SPINE: 1 LINE SOUTH STATIONS ================= -->
        ${this.renderLine1Station('stadium', 272, 665, 'Stadium', 'Lumen Field / T-Mobile Park', 'left')}
        ${this.renderLine1Station('sodo', 272, 710, 'SODO', 'SODO Busway / Industrial District', 'left')}
        ${this.renderLine1Station('beacon-hill', 272, 755, 'Beacon Hill', 'Tunnel Station / El Centro', 'left')}
        ${this.renderLine1Station('mount-baker', 272, 800, 'Mount Baker', 'Transit Center / Franklin High', 'left')}
        ${this.renderLine1Station('columbia-city', 272, 845, 'Columbia City', 'Historic District / Rainier Ave', 'left')}
        ${this.renderLine1Station('othello', 272, 890, 'Othello', 'Rainier Valley / Othello Park', 'left')}
        ${this.renderLine1Station('rainier-beach', 272, 935, 'Rainier Beach', 'Rainier Beach / Chief Sealth Trail', 'left')}
        ${this.renderLine1Station('tukwila-intl-blvd', 272, 980, 'Tukwila Intl. Blvd.', 'Park & Ride / RapidRide A', 'left')}
        ${this.renderAirportStation('seatac-airport', 272, 1025, 'SeaTac / Airport', "Seattle-Tacoma Int'l Airport", 'left')}
        ${this.renderLine1Station('angle-lake', 272, 1070, 'Angle Lake', 'Park & Ride / S 200th St', 'left')}
        ${this.renderLine1Station('kent-des-moines', 272, 1115, 'Kent Des Moines', 'Highline College / Park & Ride', 'left')}
        ${this.renderLine1Station('star-lake', 272, 1160, 'Star Lake', 'Park & Ride / S 272nd St', 'left')}
        ${this.renderLine1Station('federal-way-downtown', 272, 1205, 'Federal Way Downtown', 'Park & Ride / Transit Center', 'left', true)}

        <!-- ================= CONNECTING SEGMENT (I-90 CORRIDOR) ================= -->
        ${this.renderLine2Station('judkins-park', 355, 665, 'Judkins Park', 'Rainier Ave S / I-90 Trail', 'bottom')}
        ${this.renderLine2Station('mercer-island', 480, 665, 'Mercer Island', 'Park & Ride / I-90 Trail', 'bottom')}

        <!-- ================= RIGHT SPINE: 2 LINE EASTSIDE STATIONS ================= -->
        ${this.renderLine2Station('south-bellevue', 540, 635, 'South Bellevue', 'Park & Ride / Mercer Slough', 'right', true)}
        ${this.renderLine2Station('east-main', 540, 571, 'East Main', 'Surrey Downs / 112th Ave SE', 'right')}
        ${this.renderLine2Station('bellevue-downtown', 540, 509, 'Bellevue Downtown', 'Bellevue Transit Center', 'right', true)}
        ${this.renderLine2Station('wilburton', 540, 447, 'Wilburton', 'Overlake Medical Center', 'right')}
        ${this.renderLine2Station('spring-district', 540, 385, 'Spring District', '120th Station / Spring District', 'right')}
        ${this.renderLine2Station('bel-red', 540, 323, 'BelRed', 'Park & Ride / 130th Station', 'right')}
        ${this.renderLine2Station('overlake-village', 540, 261, 'Overlake Village', '152nd Ave NE / Overlake Village', 'right')}
        ${this.renderLine2Station('redmond-technology', 540, 199, 'Redmond Technology', 'Microsoft Campus / Transit Center', 'right', true)}
        ${this.renderLine2Station('marymoor-village', 540, 137, 'Marymoor Village', 'Park & Ride / Marymoor Park', 'right')}
        ${this.renderLine2Station('downtown-redmond', 540, 75, 'Downtown Redmond', 'Redmond Town Center', 'right', true)}
      </svg>
    `;
  }

  private renderTransferHubStation(
    id: string,
    x: number,
    y: number,
    name: string
  ): string {
    const textX = 252;

    return `
      <!-- ================= KEY 1 LINE & 2 LINE TRANSFER HUB ================= -->
      <g class="map-station-node map-transfer-hub-node map-elem-line-1 map-elem-line-2 map-elem-shared" id="map-node-${id}">
        <!-- Outer Glowing Capsule -->
        <rect x="${x - 26}" y="${y - 13}" width="52" height="26" rx="13" fill="none" stroke="#38bdf8" stroke-width="3" opacity="0.25" />
        <rect x="${x - 24}" y="${y - 11}" width="48" height="22" rx="11" fill="#091122" stroke="url(#transfer-border-grad)" stroke-width="2" />
        
        <!-- Transfer Connector Bridge -->
        <line x1="${x - 13}" y1="${y}" x2="${x + 13}" y2="${y}" stroke="rgba(255, 255, 255, 0.95)" stroke-width="3" stroke-linecap="round" />

        <!-- Line 1 Station Node (Green) -->
        <circle class="map-station-circle" cx="${x - 13}" cy="${y}" r="6" fill="#ffffff" stroke="#008542" stroke-width="3" />
        <circle cx="${x - 13}" cy="${y}" r="2" fill="#008542" />

        <!-- Line 2 Station Node (Blue) -->
        <circle class="map-station-circle" cx="${x + 13}" cy="${y}" r="6" fill="#ffffff" stroke="#0072CE" stroke-width="3" />
        <circle cx="${x + 13}" cy="${y}" r="2" fill="#0072CE" />

        <!-- Station Name -->
        <text class="map-station-label map-transfer-station-title" x="${textX}" y="${y + 2.5}" text-anchor="end" font-weight="800" font-size="12px" fill="#ffffff">${name}</text>

        <!-- Snug Transfer Pill Badge: (1) ⇄ (2) TRANSFER -->
        <g transform="translate(${textX}, ${y + 8})">
          <rect x="-106" y="0" width="106" height="18" rx="9" fill="#080f1d" stroke="url(#transfer-border-grad)" stroke-width="1.3" />
          
          <!-- Line 1 bullet -->
          <circle cx="-95" cy="9" r="4.8" fill="#008542" />
          <text x="-95" y="12.2" fill="#ffffff" font-size="7" font-weight="900" text-anchor="middle">1</text>
          
          <!-- Transfer symbol -->
          <text x="-84" y="11.8" fill="#cbd5e1" font-size="8" font-weight="800" text-anchor="middle">⇄</text>

          <!-- Line 2 bullet -->
          <circle cx="-73" cy="9" r="4.8" fill="#0072CE" />
          <text x="-73" y="12.2" fill="#ffffff" font-size="7" font-weight="900" text-anchor="middle">2</text>

          <!-- Transfer Label -->
          <text x="-63" y="12.2" fill="#38bdf8" font-size="8.5" font-weight="800" letter-spacing="0.4">TRANSFER</text>
        </g>
      </g>
    `;
  }

  private renderDualCapsuleStation(
    id: string,
    x: number,
    y: number,
    name: string,
    sub: string,
    labelPos: 'left' | 'right' = 'left',
    isTerminus: boolean = false
  ): string {
    const textX = labelPos === 'left' ? 252 : x + 26;
    const textAnchor = labelPos === 'left' ? 'end' : 'start';
    const r = isTerminus ? 5.5 : 4.8;

    return `
      <g class="map-station-node map-elem-line-1 map-elem-line-2 map-elem-shared" id="map-node-${id}">
        <!-- Two distinct circles centered on each parallel line with ample separation -->
        <circle class="map-station-circle" cx="${x - 13}" cy="${y}" r="${r}" fill="#ffffff" stroke="#008542" stroke-width="2.5" />
        <circle class="map-station-circle" cx="${x + 13}" cy="${y}" r="${r}" fill="#ffffff" stroke="#0072CE" stroke-width="2.5" />
        <text class="map-station-label" x="${textX}" y="${y + 4.5}" text-anchor="${textAnchor}">${name}</text>
        ${sub ? `<text class="map-station-sublabel" x="${textX}" y="${y + 16.5}" text-anchor="${textAnchor}">${sub}</text>` : ''}
      </g>
    `;
  }

  private renderLine1Station(
    id: string,
    x: number,
    y: number,
    name: string,
    sub: string,
    labelPos: 'left' | 'right' = 'left',
    isTerminus: boolean = false
  ): string {
    const textX = labelPos === 'left' ? 252 : x + 18;
    const textAnchor = labelPos === 'left' ? 'end' : 'start';
    const r = isTerminus ? 7 : 5.5;

    return `
      <g class="map-station-node map-elem-line-1" id="map-node-${id}">
        <circle class="map-station-circle" cx="${x}" cy="${y}" r="${r}" fill="#ffffff" stroke="#008542" stroke-width="3" />
        <text class="map-station-label" x="${textX}" y="${y + 4.5}" text-anchor="${textAnchor}">${name}</text>
        ${sub ? `<text class="map-station-sublabel" x="${textX}" y="${y + 16.5}" text-anchor="${textAnchor}">${sub}</text>` : ''}
      </g>
    `;
  }

  private renderLine2Station(
    id: string,
    x: number,
    y: number,
    name: string,
    sub: string,
    labelPos: 'left' | 'right' | 'bottom' = 'right',
    isMajor: boolean = false
  ): string {
    let textX = x + 18;
    let textY = y + 4.5;
    let textAnchor = 'start';

    if (labelPos === 'bottom') {
      textX = x;
      textY = y + 22;
      textAnchor = 'middle';
    } else if (labelPos === 'left') {
      textX = 252;
      textY = y + 4.5;
      textAnchor = 'end';
    }

    const r = isMajor ? 7 : 5.5;

    return `
      <g class="map-station-node map-elem-line-2" id="map-node-${id}">
        <circle class="map-station-circle" cx="${x}" cy="${y}" r="${r}" fill="#ffffff" stroke="#0072CE" stroke-width="3" />
        <text class="map-station-label" x="${textX}" y="${textY}" text-anchor="${textAnchor}">${name}</text>
        ${sub ? `<text class="map-station-sublabel" x="${textX}" y="${textY + 12}" text-anchor="${textAnchor}">${sub}</text>` : ''}
      </g>
    `;
  }

  private renderAirportStation(
    id: string,
    x: number,
    y: number,
    name: string,
    sub: string,
    labelPos: 'left' | 'right' = 'left'
  ): string {
    const textX = labelPos === 'left' ? 252 : x + 22;
    const textAnchor = labelPos === 'left' ? 'end' : 'start';

    return `
      <g class="map-station-node map-elem-line-1" id="map-node-${id}">
        <circle class="map-station-circle" cx="${x}" cy="${y}" r="6" fill="#ffffff" stroke="#008542" stroke-width="3" />
        <rect x="${x - 7}" y="${y - 7}" width="14" height="14" rx="3" fill="#f59e0b" />
        <text x="${x}" y="${y + 3.5}" fill="#0f172a" font-size="9" font-weight="900" text-anchor="middle">✈</text>
        <text class="map-station-label" x="${textX}" y="${y + 4.5}" text-anchor="${textAnchor}">${name}</text>
        ${sub ? `<text class="map-station-sublabel" x="${textX}" y="${y + 16.5}" text-anchor="${textAnchor}">${sub}</text>` : ''}
      </g>
    `;
  }
}
