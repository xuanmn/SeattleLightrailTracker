export type PollReason = 'start' | 'interval' | 'resume' | 'reconnect';

interface PollSchedulerOptions {
  intervalMs: number;
  onPoll: (reason: PollReason) => void;
  /** Called when the browser reports going offline (false) or back online (true). */
  onConnectivityChange?: (isOnline: boolean) => void;
}

/**
 * Drives the periodic arrivals sync.
 *
 * - Polls immediately on start, then every `intervalMs`.
 * - Pauses while the page is hidden (saves battery/data) and polls immediately on return.
 * - Pauses while the browser is offline (e.g. in a tunnel) and polls immediately on
 *   reconnect, so riders get fresh departures without waiting for the next interval.
 *
 * `navigator.onLine === false` reliably means "no connection", so it is safe to gate on;
 * `true` only means "maybe", which is why polling continues to handle its own failures.
 */
export class PollScheduler {
  private timer?: number;
  private started = false;

  constructor(private readonly options: PollSchedulerOptions) {}

  public start(): void {
    if (this.started) return;
    this.started = true;
    document.addEventListener('visibilitychange', this.handleVisibilityChange);
    window.addEventListener('online', this.handleOnline);
    window.addEventListener('offline', this.handleOffline);
    this.resume('start');
  }

  public stop(): void {
    if (!this.started) return;
    this.started = false;
    document.removeEventListener('visibilitychange', this.handleVisibilityChange);
    window.removeEventListener('online', this.handleOnline);
    window.removeEventListener('offline', this.handleOffline);
    this.pause();
  }

  private canPoll(): boolean {
    return !document.hidden && navigator.onLine !== false;
  }

  /** Poll now and (re)start the interval from this moment, if conditions allow. */
  private resume(reason: PollReason): void {
    this.pause();
    if (!this.canPoll()) return;

    this.options.onPoll(reason);
    this.timer = window.setInterval(() => this.options.onPoll('interval'), this.options.intervalMs);
  }

  private pause(): void {
    if (this.timer !== undefined) {
      clearInterval(this.timer);
      this.timer = undefined;
    }
  }

  private handleVisibilityChange = (): void => {
    if (document.hidden) {
      this.pause();
    } else {
      this.resume('resume');
    }
  };

  private handleOnline = (): void => {
    this.options.onConnectivityChange?.(true);
    this.resume('reconnect');
  };

  private handleOffline = (): void => {
    this.options.onConnectivityChange?.(false);
    this.pause();
  };
}
