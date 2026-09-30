import { getSettings, updateSettings } from '../services/storage';
import { AppSettings } from '../types/transit';
import { createElement, ICONS } from '../utils/dom';
import { lockBodyScroll, unlockBodyScroll } from '../utils/scrollLock';
import { attachBottomSheetSwipe } from '../utils/bottomSheetGesture';

export interface SettingsModalCallbacks {
  onSettingsSaved: (settings: AppSettings) => void;
}

export class SettingsModal {
  private overlay: HTMLElement;
  private timeFormatCheckbox!: HTMLInputElement;
  private callbacks: SettingsModalCallbacks;

  private handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Escape' && this.overlay.classList.contains('open')) {
      this.close();
    }
  };

  constructor(callbacks: SettingsModalCallbacks) {
    this.callbacks = callbacks;
    this.overlay = this.render();
    document.body.appendChild(this.overlay);
  }

  public open() {
    if (this.overlay.classList.contains('open')) return;
    const current = getSettings();
    this.timeFormatCheckbox.checked = current.timeFormat24Hour;
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

  private save() {
    const updated = updateSettings({
      timeFormat24Hour: this.timeFormatCheckbox.checked,
    });
    this.callbacks.onSettingsSaved(updated);
    this.close();
  }

  private render(): HTMLElement {
    const overlay = createElement('div', 'modal-overlay');
    const modal = createElement('div', 'modal-container');

    // Header
    const header = createElement('div', 'modal-header');
    const title = createElement('h3', 'modal-title', 'Tracker Settings');
    const closeBtn = createElement('button', 'icon-btn modal-close-btn', ICONS.close);
    closeBtn.setAttribute('aria-label', 'Close Settings');
    closeBtn.title = 'Close Settings';
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

    // 24 Hour Clock
    const timeGroup = createElement('div', 'form-group form-group-row settings-row');
    const timeLabelWrap = createElement('div', 'settings-label-wrap');
    const timeLabel = createElement('label', 'form-label form-label-inline', '24-Hour Clock Format');
    timeLabel.setAttribute('for', 'toggle-24h-format');
    timeLabelWrap.appendChild(timeLabel);

    const switchLabel = createElement('label', 'toggle-switch');
    this.timeFormatCheckbox = createElement('input') as HTMLInputElement;
    this.timeFormatCheckbox.type = 'checkbox';
    this.timeFormatCheckbox.id = 'toggle-24h-format';
    this.timeFormatCheckbox.setAttribute('aria-label', 'Use 24-Hour Time Format');
    const slider = createElement('span', 'toggle-slider');
    switchLabel.appendChild(this.timeFormatCheckbox);
    switchLabel.appendChild(slider);

    timeGroup.appendChild(timeLabelWrap);
    timeGroup.appendChild(switchLabel);
    body.appendChild(timeGroup);

    // Footer
    const footer = createElement('div', 'modal-footer');
    const saveBtn = createElement('button', 'btn-primary', 'Save Settings') as HTMLButtonElement;
    saveBtn.type = 'button';
    saveBtn.onclick = () => this.save();

    footer.appendChild(saveBtn);

    modal.appendChild(header);
    modal.appendChild(body);
    modal.appendChild(footer);
    overlay.appendChild(modal);

    overlay.onclick = (e) => {
      if (e.target === overlay) this.close();
    };

    return overlay;
  }
}
