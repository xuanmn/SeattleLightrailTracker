import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { PollScheduler, PollReason } from '../src/services/pollScheduler';

let online = true;
let hidden = false;

function setOnline(value: boolean) {
  online = value;
  window.dispatchEvent(new Event(value ? 'online' : 'offline'));
}

function setHidden(value: boolean) {
  hidden = value;
  document.dispatchEvent(new Event('visibilitychange'));
}

describe('PollScheduler', () => {
  let scheduler: PollScheduler | undefined;
  let polls: PollReason[];
  let connectivity: boolean[];

  beforeEach(() => {
    vi.useFakeTimers();
    online = true;
    hidden = false;
    Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => online });
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => hidden });
    polls = [];
    connectivity = [];
  });

  afterEach(() => {
    scheduler?.stop();
    scheduler = undefined;
    vi.useRealTimers();
  });

  function createScheduler() {
    scheduler = new PollScheduler({
      intervalMs: 60_000,
      onPoll: (reason) => polls.push(reason),
      onConnectivityChange: (isOnline) => connectivity.push(isOnline),
    });
    return scheduler;
  }

  it('polls immediately on start and then every interval', () => {
    createScheduler().start();
    expect(polls).toEqual(['start']);

    vi.advanceTimersByTime(60_000);
    vi.advanceTimersByTime(60_000);
    expect(polls).toEqual(['start', 'interval', 'interval']);
  });

  it('does not poll on start while offline', () => {
    online = false;
    createScheduler().start();
    vi.advanceTimersByTime(180_000);
    expect(polls).toEqual([]);
  });

  it('pauses polling when the connection drops and reports it', () => {
    createScheduler().start();
    setOnline(false);

    vi.advanceTimersByTime(180_000);
    expect(polls).toEqual(['start']);
    expect(connectivity).toEqual([false]);
  });

  it('refreshes immediately on reconnect instead of waiting for the next interval', () => {
    createScheduler().start();
    vi.advanceTimersByTime(20_000);
    setOnline(false);
    vi.advanceTimersByTime(20_000);

    setOnline(true);
    expect(polls).toEqual(['start', 'reconnect']);
    expect(connectivity).toEqual([false, true]);

    // Interval restarts from the reconnect moment
    vi.advanceTimersByTime(59_999);
    expect(polls).toEqual(['start', 'reconnect']);
    vi.advanceTimersByTime(1);
    expect(polls).toEqual(['start', 'reconnect', 'interval']);
  });

  it('pauses while the page is hidden and resumes with an immediate poll', () => {
    createScheduler().start();
    setHidden(true);
    vi.advanceTimersByTime(180_000);
    expect(polls).toEqual(['start']);

    setHidden(false);
    expect(polls).toEqual(['start', 'resume']);
  });

  it('does not poll on reconnect while hidden, but does once visible again', () => {
    createScheduler().start();
    setHidden(true);
    setOnline(false);
    setOnline(true);
    expect(polls).toEqual(['start']);

    setHidden(false);
    expect(polls).toEqual(['start', 'resume']);
  });

  it('does not poll on becoming visible while offline', () => {
    createScheduler().start();
    setHidden(true);
    setOnline(false);
    setHidden(false);
    vi.advanceTimersByTime(180_000);
    expect(polls).toEqual(['start']);
  });

  it('removes all listeners and timers on stop()', () => {
    const s = createScheduler();
    s.start();
    s.stop();

    vi.advanceTimersByTime(180_000);
    setOnline(false);
    setOnline(true);
    setHidden(true);
    setHidden(false);
    expect(polls).toEqual(['start']);
    expect(connectivity).toEqual([]);
  });
});
