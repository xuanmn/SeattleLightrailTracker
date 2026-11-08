import '../styles/modal.css';
import '../styles/settings.css';
import { getSettings, updateSettings } from '../services/storage';
import { AppSettings } from '../types/transit';
import { createElement, ICONS, trapModalTabFocus } from '../utils/dom';
import { lockBodyScroll, unlockBodyScroll } from '../utils/scrollLock';
import { attachBottomSheetSwipe } from '../utils/bottomSheetGesture';

interface SettingsModalCallbacks {
  onSettingsSaved: (settings: AppSettings) => void;
}

export class SettingsModal {
  private overlay: HTMLElement;
  private timeFormatCheckbox!: HTMLInputElement;
  private callbacks: SettingsModalCallbacks;
  private closeBtn!: HTMLButtonElement;
  private returnFocusEl: HTMLElement | null = null;

  private handleKeyDown = (e: KeyboardEvent) => {
    if (!this.overlay.classList.contains('open')) return;
    if (e.key === 'Escape') {
      this.close();
    } else if (e.key === 'Tab') {
      trapModalTabFocus(e, this.overlay);
    }
  };

  constructor(callbacks: SettingsModalCallbacks) {
    this.callbacks = callbacks;
    this.overlay = this.render();
    document.body.appendChild(this.overlay);
  }

  public open() {
    if (this.overlay.classList.contains('open')) return;
    const active = document.activeElement;
    this.returnFocusEl = active instanceof HTMLElement && active !== document.body ? active : null;
    const current = getSettings();
    this.timeFormatCheckbox.checked = current.timeFormat24Hour;
    this.overlay.classList.add('open');
    lockBodyScroll();
    window.addEventListener('keydown', this.handleKeyDown);
    if (this.closeBtn) {
      this.closeBtn.focus({ preventScroll: true });
    }
  }

  public close() {
    if (!this.overlay.classList.contains('open')) return;
    this.overlay.classList.remove('open');
    unlockBodyScroll();
    window.removeEventListener('keydown', this.handleKeyDown);
    const returnTo = this.returnFocusEl;
    this.returnFocusEl = null;
    if (returnTo?.isConnected) returnTo.focus({ preventScroll: true });
  }

  private save() {
    const updated = updateSettings({
      timeFormat24Hour: this.timeFormatCheckbox.checked,
    });
    this.callbacks.onSettingsSaved(updated);
    this.close();
  }

  private render(): HTMLElement {
    const overlay = createElement('div', 'modal-overlay settings-modal-overlay');
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.setAttribute('aria-label', 'Tracker Settings');
    const modal = createElement('div', 'modal-container');

    // Header
    const header = createElement('div', 'modal-header');
    const title = createElement('h3', 'modal-title', 'Tracker Settings');
    this.closeBtn = createElement('button', 'icon-btn modal-close-btn', ICONS.close) as HTMLButtonElement;
    this.closeBtn.type = 'button';
    this.closeBtn.setAttribute('aria-label', 'Close Settings');
    this.closeBtn.title = 'Close Settings';
    this.closeBtn.onclick = () => this.close();
    header.appendChild(title);
    header.appendChild(this.closeBtn);

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
    const timeLabel = createElement('label', 'form-label form-label-inline', '24-Hour Clock Format');
    timeLabel.setAttribute('for', 'toggle-24h-format');

    const switchLabel = createElement('label', 'toggle-switch');
    this.timeFormatCheckbox = createElement('input') as HTMLInputElement;
    this.timeFormatCheckbox.type = 'checkbox';
    this.timeFormatCheckbox.id = 'toggle-24h-format';
    this.timeFormatCheckbox.setAttribute('aria-label', 'Use 24-Hour Time Format');
    const slider = createElement('span', 'toggle-slider');
    switchLabel.appendChild(this.timeFormatCheckbox);
    switchLabel.appendChild(slider);

    timeGroup.appendChild(timeLabel);
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
