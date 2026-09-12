import { createElement, ICONS } from '../utils/dom';
import { lockBodyScroll, unlockBodyScroll } from '../utils/scrollLock';
import { attachBottomSheetSwipe } from '../utils/bottomSheetGesture';

export class FaqModal {
  private overlay: HTMLElement;
  private handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Escape' && this.overlay.classList.contains('open')) {
      this.close();
    }
  };

  constructor() {
    this.overlay = this.render();
    document.body.appendChild(this.overlay);
  }

  public open() {
    if (this.overlay.classList.contains('open')) return;
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

  private render(): HTMLElement {
    const overlay = createElement('div', 'modal-overlay faq-modal-overlay');
    const modal = createElement('div', 'modal-container modal-container-wide faq-modal-container');

    // Header
    const header = createElement('div', 'modal-header');
    const title = createElement('h3', 'modal-title', 'Seattle Transit Guide & FAQ');
    const closeBtn = createElement('button', 'icon-btn modal-close-btn', ICONS.close);
    closeBtn.setAttribute('aria-label', 'Close Transit Guide');
    closeBtn.title = 'Close Transit Guide';
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

    // Section 1: Regional Connection & Line 1 / Line 2 Guide
    const connectionGuideCard = createElement('div', 'faq-featured-card');
    connectionGuideCard.innerHTML = `
      <div class="faq-featured-header">
        <div class="faq-tag-group">
          <div class="faq-tag">Regional Route Guide</div>
          <span class="route-badge staging">Cross-Lake Segment Opening 2025–2026</span>
        </div>
        <h4 class="faq-featured-title">Lynnwood / Seattle ⇄ Bellevue / Redmond Connection</h4>
      </div>
      <div class="faq-featured-body">
        <div class="route-option-card">
          <div class="route-badge direct">Direct 2 Line</div>
          <div class="route-title">Single Train — No Transfer</div>
          <p class="route-desc">
            The <strong>2 Line</strong> runs directly between <strong>Lynnwood City Center</strong> and <strong>Downtown Redmond</strong> via Downtown Seattle and the I-90 bridge.
          </p>
        </div>

        <div class="route-option-card">
          <div class="route-badge transfer">Travel Times & Connections</div>
          <div class="route-title">Key Station Pairs</div>
          <p class="route-desc">
            • <strong>Bellevue ⇄ Westlake (Seattle):</strong> ~25 min<br/>
            • <strong>Bellevue ⇄ Capitol Hill:</strong> ~35 min (direct)<br/>
            • <strong>Downtown Redmond ⇄ Lynnwood:</strong> ~55 min (direct)<br/>
            • <strong>Bellevue ⇄ UW & Northgate:</strong> Direct on 2 Line<br/>
            • <strong>Shared Core (Lynnwood ⇄ Chinatown-ID):</strong> Trains arrive every <strong>4–5 min</strong> during peak hours.<br/>
            • <span class="faq-tip-badge tip">Transfer Tip</span> <strong>To SeaTac Airport:</strong> Take 2 Line to Chinatown-ID, then cross-platform transfer to 1 Line Southbound (~55 min total from Bellevue).
          </p>
        </div>
      </div>
    `;

    // Section 2: General Link FAQs
    const generalCard = createElement('div', 'faq-section-wrap');
    generalCard.innerHTML = `
      <h4 class="faq-section-heading">Frequently Asked Questions</h4>

      <details class="faq-item" open>
        <summary class="faq-q">
          <span>📱 Tracker Usage</span>
          <span class="faq-chevron" aria-hidden="true">▾</span>
        </summary>
        <div class="faq-a">
          • <strong>Pin Stations:</strong> Click the Star icon on any card or use <strong>+ Add Station</strong> to pin favorite stops.<br/>
          • <strong>Line Toggle:</strong> Switch between 1 Line and 2 Line in the top header.<br/>
          • <strong>GPS vs Scheduled:</strong> Green badges indicate live satellite-tracked trains. White badges show scheduled timetable data.<br/>
          • <strong>Updates:</strong> Countdown ticks every second. Live arrivals refresh automatically every 60 seconds.<br/>
          • <strong>Time Format:</strong> Toggle between 12-hour and 24-hour display in Settings.
        </div>
      </details>

      <details class="faq-item" open>
        <summary class="faq-q">
          <span>💳 Fares & Payment</span>
          <span class="faq-chevron" aria-hidden="true">▾</span>
        </summary>
        <div class="faq-a">
          • <strong>Adult Fare:</strong> Flat <strong>$3.00</strong> per trip (distance does not affect price).<br/>
          • <strong>Youth (18 & under):</strong> <strong>Free</strong> on all trains and buses.<br/>
          • <strong>Reduced Fare:</strong> Flat <strong>$1.00</strong> for ORCA LIFT and RRFP (seniors 65+ / disability).<br/>
          • <span class="faq-tip-badge warning">Important Rule</span> <strong>How to Tap:</strong> Tap your ORCA card once before boarding. <strong>You do NOT need to tap off</strong> when exiting.<br/>
          • <strong>Transfers:</strong> ORCA includes automatic 2-hour transfer credit across Metro, ST Express, and Streetcar.<br/>
          • <strong>Other Payments:</strong> Transit GO Ticket app or station ticket machines.
        </div>
      </details>

      <details class="faq-item" open>
        <summary class="faq-q">
          <span>⏰ Frequency & Operating Hours</span>
          <span class="faq-chevron" aria-hidden="true">▾</span>
        </summary>
        <div class="faq-a">
          • <strong>Peak:</strong> Every 8–10 min per line (every 4–5 min on shared Lynnwood–Chinatown segment).<br/>
          • <strong>Off-Peak & Weekends:</strong> Every 10–15 min.<br/>
          • <strong>Operating Span:</strong> Mon–Sat ~5:00 AM – 1:00 AM; Sun & Holidays ~6:00 AM – 12:00 AM.
        </div>
      </details>

      <details class="faq-item" open>
        <summary class="faq-q">
          <span>🚲 Bikes, Luggage & Accessibility</span>
          <span class="faq-chevron" aria-hidden="true">▾</span>
        </summary>
        <div class="faq-a">
          • <strong>Bicycles:</strong> Allowed free on all trains. Up to 4 hanging hooks per car.<br/>
          • <strong>Luggage & Strollers:</strong> Allowed. All stations and platforms provide step-free, level boarding.
        </div>
      </details>

      <details class="faq-item" open>
        <summary class="faq-q">
          <span>🛡️ Security & Lost and Found</span>
          <span class="faq-chevron" aria-hidden="true">▾</span>
        </summary>
        <div class="faq-a">
          <div class="faq-contact-group">
            <div class="faq-contact-row">
              <span class="faq-contact-label">Sound Transit Security (24/7 call or text): <strong>206-398-5268</strong></span>
              <div class="faq-action-btns">
                <a href="tel:2063985268" class="faq-action-btn tel" title="Call Sound Transit Security at 206-398-5268">
                  📞 Call 206-398-5268
                </a>
                <a href="sms:2063985268" class="faq-action-btn sms" title="Text Sound Transit Security 24/7">
                  💬 Text 24/7
                </a>
              </div>
            </div>
            <div class="faq-contact-row">
              <span class="faq-contact-label">Lost & Found (King County Metro): <strong>206-553-3000</strong></span>
              <div class="faq-action-btns">
                <a href="tel:2065533000" class="faq-action-btn tel" title="Call Lost and Found at 206-553-3000">📞 Call 206-553-3000</a>
              </div>
            </div>
          </div>
        </div>
      </details>

      <details class="faq-item" open>
        <summary class="faq-q">
          <span>🔗 Official Resources</span>
          <span class="faq-chevron" aria-hidden="true">▾</span>
        </summary>
        <div class="faq-links-list">
          <a href="https://www.soundtransit.org/ride-with-us/routes-schedules" target="_blank" rel="noopener noreferrer" class="faq-link-row">
            <span>Sound Transit Schedules & Alerts</span>
            <span>↗</span>
          </a>
          <a href="https://www.soundtransit.org/ride-with-us/stations/link-light-rail-stations" target="_blank" rel="noopener noreferrer" class="faq-link-row">
            <span>Station Directory & Parking Facilities</span>
            <span>↗</span>
          </a>
          <a href="https://myorca.com/" target="_blank" rel="noopener noreferrer" class="faq-link-row">
            <span>myORCA Card Management</span>
            <span>↗</span>
          </a>
          <a href="https://github.com/xuanmn/Seattle-Lightrail-Tracker" target="_blank" rel="noopener noreferrer" class="faq-link-row">
            <span>GitHub Repository & Source Code</span>
            <span>↗</span>
          </a>
        </div>
      </details>
    `;

    body.appendChild(connectionGuideCard);
    body.appendChild(generalCard);

    modal.appendChild(header);
    modal.appendChild(body);
    overlay.appendChild(modal);

    overlay.onclick = (e) => {
      if (e.target === overlay) this.close();
    };

    return overlay;
  }
}
