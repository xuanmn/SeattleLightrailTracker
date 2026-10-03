import { TransitLineId } from '../types/transit';
import { createElement, ICONS } from '../utils/dom';

interface HeaderCallbacks {
  onLineChange: (line: TransitLineId) => void;
  onSettingsClick: () => void;
  onFaqClick: () => void;
  onMapClick: () => void;
}

export class HeaderComponent {
  private element: HTMLElement;
  private logoEl!: HTMLElement;
  private line1Btn!: HTMLButtonElement;
  private line2Btn!: HTMLButtonElement;
  private activeLine: TransitLineId = 'line-1';
  private callbacks: HeaderCallbacks;

  constructor(initialLine: TransitLineId, callbacks: HeaderCallbacks) {
    this.activeLine = initialLine;
    this.callbacks = callbacks;
    this.element = this.render();
  }

  public getElement(): HTMLElement {
    return this.element;
  }

  public setActiveLine(line: TransitLineId) {
    this.activeLine = line;
    if (this.logoEl) {
      this.logoEl.className = `brand-logo ${line === 'line-1' ? 'line-1-logo' : 'line-2-logo'}`;
    }
    if (line === 'line-1') {
      this.line1Btn.className = 'line-btn active line-1-active';
      this.line2Btn.className = 'line-btn';
    } else {
      this.line1Btn.className = 'line-btn';
      this.line2Btn.className = 'line-btn active line-2-active';
    }
  }


  private render(): HTMLElement {
    const header = createElement('header', 'app-header');
    const container = createElement('div', 'app-container header-inner');

    // Brand Left
    const brand = createElement('div', 'brand-section');
    brand.setAttribute('role', 'button');
    brand.setAttribute('tabindex', '0');
    brand.setAttribute('title', 'Reload live tracker');
    brand.setAttribute('aria-label', 'Reload live tracker');
    const handleBrandClick = () => {
      if (window.scrollY > 60) {
        window.scrollTo({ top: 0, behavior: 'smooth' });
      } else {
        window.location.reload();
      }
    };
    brand.onclick = handleBrandClick;
    brand.onkeydown = (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        handleBrandClick();
      }
    };

    this.logoEl = createElement(
      'div',
      `brand-logo ${this.activeLine === 'line-1' ? 'line-1-logo' : 'line-2-logo'}`,
      ICONS.train
    );
    const textGroup = createElement('div', 'brand-text');
    const title = createElement('h1', 'brand-title', 'Seattle Light Rail');
    const subtitle = createElement('div', 'brand-subtitle', 'Sound Transit Link Real-Time Tracker');
    textGroup.appendChild(title);
    textGroup.appendChild(subtitle);
    brand.appendChild(this.logoEl);
    brand.appendChild(textGroup);

    // Line Switcher Center
    const switcher = createElement('div', 'line-switcher');
    this.line1Btn = createElement(
      'button',
      `line-btn ${this.activeLine === 'line-1' ? 'active line-1-active' : ''}`
    ) as HTMLButtonElement;
    this.line1Btn.innerHTML = `<span class="line-badge-circle line-1-circle">1</span> 1 Line`;
    this.line1Btn.title = 'Lynnwood City Center ⇄ Federal Way Downtown';
    this.line1Btn.onclick = () => {
      this.setActiveLine('line-1');
      this.callbacks.onLineChange('line-1');
    };

    this.line2Btn = createElement(
      'button',
      `line-btn ${this.activeLine === 'line-2' ? 'active line-2-active' : ''}`
    ) as HTMLButtonElement;
    this.line2Btn.innerHTML = `<span class="line-badge-circle line-2-circle">2</span> 2 Line`;
    this.line2Btn.title = 'Lynnwood City Center ⇄ Downtown Redmond';
    this.line2Btn.onclick = () => {
      this.setActiveLine('line-2');
      this.callbacks.onLineChange('line-2');
    };

    switcher.appendChild(this.line1Btn);
    switcher.appendChild(this.line2Btn);

    // Right Controls
    const actions = createElement('div', 'header-actions');

    const mapBtn = createElement(
      'button',
      'header-text-btn header-map-btn',
      `${ICONS.map} <span class="header-btn-label-desktop">Link Map</span><span class="header-btn-label-mobile">Map</span>`
    ) as HTMLButtonElement;
    mapBtn.type = 'button';
    mapBtn.title = 'View Link Light Rail Map';
    mapBtn.onclick = () => this.callbacks.onMapClick();

    const faqBtn = createElement(
      'button',
      'header-text-btn header-faq-btn',
      `${ICONS.guide} <span class="header-btn-label-desktop">Transit Guide & FAQ</span><span class="header-btn-label-mobile">Guide</span>`
    ) as HTMLButtonElement;
    faqBtn.type = 'button';
    faqBtn.title = 'How to travel between Lynnwood, Seattle, and Bellevue';
    faqBtn.onclick = () => this.callbacks.onFaqClick();

    const settingsBtn = createElement('button', 'icon-btn header-settings-btn', ICONS.settings) as HTMLButtonElement;
    settingsBtn.type = 'button';
    settingsBtn.title = 'Settings & Preferences';
    settingsBtn.setAttribute('aria-label', 'Settings & Preferences');
    settingsBtn.onclick = () => this.callbacks.onSettingsClick();

    actions.appendChild(mapBtn);
    actions.appendChild(faqBtn);
    actions.appendChild(settingsBtn);

    container.appendChild(brand);
    container.appendChild(switcher);
    container.appendChild(actions);
    header.appendChild(container);

    return header;
  }
}
