import { describe, it, expect, beforeEach, vi } from 'vitest';
import { lockBodyScroll, unlockBodyScroll } from '../src/utils/scrollLock';
import { attachBottomSheetSwipe } from '../src/utils/bottomSheetGesture';
import { trapModalTabFocus } from '../src/utils/dom';
import { SettingsModal } from '../src/components/SettingsModal';
import { StationPickerModal } from '../src/components/StationPickerModal';
import { FaqModal } from '../src/components/FaqModal';
import { SystemMapModal } from '../src/components/SystemMapModal';

describe('Scroll Lock Utility', () => {
  beforeEach(() => {
    document.body.className = '';
    document.body.innerHTML = '';
  });

  it('adds modal-open class on lock and removes on unlock', () => {
    expect(document.body.classList.contains('modal-open')).toBe(false);

    lockBodyScroll();
    expect(document.body.classList.contains('modal-open')).toBe(true);

    unlockBodyScroll();
    expect(document.body.classList.contains('modal-open')).toBe(false);
  });

  it('handles nested/multiple locks with reference counting', () => {
    lockBodyScroll();
    lockBodyScroll();
    expect(document.body.classList.contains('modal-open')).toBe(true);

    unlockBodyScroll();
    expect(document.body.classList.contains('modal-open')).toBe(true);

    unlockBodyScroll();
    expect(document.body.classList.contains('modal-open')).toBe(false);

    // Extra unlocks should be safe
    unlockBodyScroll();
    expect(document.body.classList.contains('modal-open')).toBe(false);
  });
});

describe('Bottom Sheet Gesture Controller', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  function createTouchEvent(type: string, clientY: number, target: HTMLElement): TouchEvent {
    const touch = {
      identifier: 0,
      target,
      clientX: 100,
      clientY,
      pageX: 100,
      pageY: clientY,
      screenX: 100,
      screenY: clientY,
      radiusX: 1,
      radiusY: 1,
      rotationAngle: 0,
      force: 1,
    } as unknown as Touch;

    return new TouchEvent(type, {
      bubbles: true,
      cancelable: true,
      touches: type === 'touchend' || type === 'touchcancel' ? [] : [touch],
      targetTouches: type === 'touchend' || type === 'touchcancel' ? [] : [touch],
      changedTouches: [touch],
    });
  }

  it('translates container on touch drag and triggers onClose when dragged past threshold', () => {
    const overlay = document.createElement('div');
    const container = document.createElement('div');
    const handle = document.createElement('div');
    container.appendChild(handle);
    overlay.appendChild(container);
    document.body.appendChild(overlay);

    const onClose = vi.fn();
    const cleanup = attachBottomSheetSwipe({
      overlay,
      container,
      handle,
      onClose,
    });

    // Touch start at Y=100
    handle.dispatchEvent(createTouchEvent('touchstart', 100, handle));

    // Drag down to Y=150 (delta = 50px, under threshold 80px)
    handle.dispatchEvent(createTouchEvent('touchmove', 150, handle));
    expect(container.style.transform).toContain('translateY(50px)');

    // Release at Y=150
    handle.dispatchEvent(createTouchEvent('touchend', 150, handle));
    expect(onClose).not.toHaveBeenCalled();
    // Container should reset transform
    expect(container.style.transform).toBe('');

    // Now drag past threshold (Y=100 to Y=210 => 110px)
    handle.dispatchEvent(createTouchEvent('touchstart', 100, handle));
    handle.dispatchEvent(createTouchEvent('touchmove', 210, handle));
    expect(container.style.transform).toContain('translateY(110px)');

    handle.dispatchEvent(createTouchEvent('touchend', 210, handle));
    expect(onClose).toHaveBeenCalledTimes(1);

    cleanup();
  });

  it('applies resistance when dragged upwards (negative delta)', () => {
    const overlay = document.createElement('div');
    const container = document.createElement('div');
    const handle = document.createElement('div');
    container.appendChild(handle);
    overlay.appendChild(container);
    document.body.appendChild(overlay);

    const onClose = vi.fn();
    const cleanup = attachBottomSheetSwipe({
      overlay,
      container,
      handle,
      onClose,
    });

    handle.dispatchEvent(createTouchEvent('touchstart', 100, handle));
    // Drag upwards by 40px
    handle.dispatchEvent(createTouchEvent('touchmove', 60, handle));

    // Negative delta should be damped, so transform is < 0 but magnitude is damped
    const transform = container.style.transform;
    expect(transform).toMatch(/translateY\(-?[0-9.]+px\)/);
    // e.g. -40 * 0.25 = -10px, definitely less than -30px
    expect(parseFloat(transform.replace(/[^\d.-]/g, ''))).toBeLessThanOrEqual(0);
    expect(parseFloat(transform.replace(/[^\d.-]/g, ''))).toBeGreaterThan(-40);

    handle.dispatchEvent(createTouchEvent('touchend', 60, handle));
    expect(onClose).not.toHaveBeenCalled();
    expect(container.style.transform).toBe('');

    cleanup();
  });
});

describe('Modal Scroll Lock and Gesture Integration', () => {
  beforeEach(() => {
    document.body.className = '';
    document.body.innerHTML = '';
  });

  it('locks body scroll when SettingsModal is opened and unlocks when closed', () => {
    const settingsModal = new SettingsModal({
      onSettingsSaved: () => {},
    });

    expect(document.body.classList.contains('modal-open')).toBe(false);

    settingsModal.open();
    expect(document.body.classList.contains('modal-open')).toBe(true);

    settingsModal.close();
    expect(document.body.classList.contains('modal-open')).toBe(false);
  });

  it('locks body scroll when StationPickerModal is opened and unlocks when closed', () => {
    const picker = new StationPickerModal({
      onTogglePin: () => {},
      isStationPinned: () => false,
    });

    picker.open();
    expect(document.body.classList.contains('modal-open')).toBe(true);

    picker.close();
    expect(document.body.classList.contains('modal-open')).toBe(false);
  });

  it('locks body scroll when FaqModal is opened and unlocks when closed', () => {
    const faq = new FaqModal();

    faq.open();
    expect(document.body.classList.contains('modal-open')).toBe(true);

    faq.close();
    expect(document.body.classList.contains('modal-open')).toBe(false);
  });

  it('locks body scroll when SystemMapModal is opened and unlocks when closed', () => {
    const map = new SystemMapModal();

    map.open();
    expect(document.body.classList.contains('modal-open')).toBe(true);

    map.close();
    expect(document.body.classList.contains('modal-open')).toBe(false);
  });

  it('moves initial keyboard focus inside the dialog when any modal opens', () => {
    const trigger = document.createElement('button');
    trigger.textContent = 'Trigger';
    document.body.appendChild(trigger);
    trigger.focus();

    // 1. FaqModal
    const faq = new FaqModal();
    faq.open();
    const faqOverlay = document.querySelector('.faq-modal-overlay') as HTMLElement;
    expect(faqOverlay.contains(document.activeElement)).toBe(true);
    expect(document.activeElement).not.toBe(trigger);
    faq.close();
    expect(document.activeElement).toBe(trigger);

    // 2. SettingsModal
    const settings = new SettingsModal({ onSettingsSaved: () => {} });
    settings.open();
    const settingsOverlay = document.querySelector('.settings-modal-overlay') as HTMLElement;
    expect(settingsOverlay.contains(document.activeElement)).toBe(true);
    settings.close();
    expect(document.activeElement).toBe(trigger);

    // 3. StationPickerModal
    const picker = new StationPickerModal({
      onTogglePin: () => {},
      isStationPinned: () => false,
    });
    picker.open('line-1');
    const pickerOverlay = document.querySelector('.picker-modal-overlay') as HTMLElement;
    expect(pickerOverlay.contains(document.activeElement)).toBe(true);
    picker.close();
    expect(document.activeElement).toBe(trigger);

    // 4. SystemMapModal
    const map = new SystemMapModal();
    map.open();
    const mapOverlay = document.querySelector('.system-map-modal-overlay') as HTMLElement;
    expect(mapOverlay.contains(document.activeElement)).toBe(true);
    map.close();
    expect(document.activeElement).toBe(trigger);
  });

  it('uses action button semantics without aria-pressed in StationPickerModal rows', () => {
    let pinned = false;
    const picker = new StationPickerModal({
      onTogglePin: () => {
        pinned = !pinned;
      },
      isStationPinned: () => pinned,
    });

    picker.open('line-1');
    const row = document.querySelector('.picker-station-row') as HTMLElement;
    expect(row).not.toBeNull();
    const btn = row.querySelector('.picker-add-btn') as HTMLButtonElement;
    expect(btn).not.toBeNull();

    // Unpinned state: action label without aria-pressed
    expect(btn.hasAttribute('aria-pressed')).toBe(false);
    expect(btn.getAttribute('aria-label')).toMatch(/^Add .* to favorites$/);

    // Pinned state: action label without aria-pressed
    pinned = true;
    picker.refreshPinnedState(row.dataset.stationId);
    expect(btn.hasAttribute('aria-pressed')).toBe(false);
    expect(btn.getAttribute('aria-label')).toMatch(/^Remove .* from favorites$/);

    picker.close();
  });

  it('excludes disabled controls and includes select/textarea in trapModalTabFocus', () => {
    const container = document.createElement('div');
    const disabledBtn = document.createElement('button');
    disabledBtn.disabled = true;
    const enabledInput = document.createElement('input');
    const enabledSelect = document.createElement('select');
    const disabledInput = document.createElement('input');
    disabledInput.disabled = true;
    const enabledBtn = document.createElement('button');

    container.appendChild(disabledBtn);
    container.appendChild(enabledInput);
    container.appendChild(enabledSelect);
    container.appendChild(disabledInput);
    container.appendChild(enabledBtn);
    document.body.appendChild(container);

    enabledBtn.focus();
    expect(document.activeElement).toBe(enabledBtn);

    // Tab from last enabled element wraps to first non-disabled element (enabledInput, not disabledBtn)
    const tabForward = new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true });
    trapModalTabFocus(tabForward, container);
    expect(document.activeElement).toBe(enabledInput);

    // Shift+Tab from first enabled element wraps to last non-disabled element (enabledBtn, not disabledInput)
    const tabBackward = new KeyboardEvent('keydown', { key: 'Tab', shiftKey: true, bubbles: true, cancelable: true });
    trapModalTabFocus(tabBackward, container);
    expect(document.activeElement).toBe(enabledBtn);
  });
});
