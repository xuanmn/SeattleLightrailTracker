import { describe, it, expect } from 'vitest';
import {
  calculateMinutesRemaining,
  formatCountdownBadge,
  formatClockTime,
  formatDelayStatus,
} from '../src/utils/time';
import { formatSimpleDestination } from '../src/utils/format';

describe('Time and Countdown Utilities', () => {
  const baseTime = 1700000000000; // Fixed timestamp reference

  it('calculates remaining minutes correctly', () => {
    expect(calculateMinutesRemaining(baseTime + 3 * 60 * 1000, baseTime)).toBe(3);
    expect(calculateMinutesRemaining(baseTime + 14 * 60 * 1000, baseTime)).toBe(14);
    expect(calculateMinutesRemaining(baseTime + 20 * 1000, baseTime)).toBe(0); // 20s left is 0 min (arriving)
  });

  it('formats countdown badge with ARRIVING or minute strings', () => {
    // 20s remaining -> ARRIVING
    const arriving = formatCountdownBadge(baseTime + 20 * 1000, baseTime);
    expect(arriving.text).toBe('ARRIVING');
    expect(arriving.isNow).toBe(true);

    // 1 min remaining -> 1 MIN
    const oneMin = formatCountdownBadge(baseTime + 65 * 1000, baseTime);
    expect(oneMin.text).toBe('1 MIN');
    expect(oneMin.isNow).toBe(false);

    // 5 mins remaining -> 5 MIN
    const fiveMin = formatCountdownBadge(baseTime + 5 * 60 * 1000, baseTime);
    expect(fiveMin.text).toBe('5 MIN');
  });

  it('formats delay status properly', () => {
    // Realtime on-time (<60s delay)
    const onTime = formatDelayStatus(30, true);
    expect(onTime.text).toBe('On Time');
    expect(onTime.type).toBe('ontime');

    // Realtime moderate late (>=60s and <600s)
    const late = formatDelayStatus(180, true);
    expect(late.text).toBe('3m Delay');
    expect(late.type).toBe('delayed');

    // Realtime severe late (>=600s / 10 minutes)
    const severeLate10 = formatDelayStatus(600, true);
    expect(severeLate10.text).toBe('10m Delay');
    expect(severeLate10.type).toBe('delayed-severe');

    const severeLate15 = formatDelayStatus(900, true);
    expect(severeLate15.text).toBe('15m Delay');
    expect(severeLate15.type).toBe('delayed-severe');

    // Realtime early (<=-60s)
    const early = formatDelayStatus(-120, true);
    expect(early.text).toBe('2m Early');
    expect(early.type).toBe('early');

    // Non-realtime / scheduled estimate
    const scheduled = formatDelayStatus(0, false);
    expect(scheduled.text).toBe('Scheduled');
    expect(scheduled.type).toBe('scheduled');
  });

  it('formats clock time in 12-hour and 24-hour formats', () => {
    // Epoch timestamp corresponding to a specific hour
    const date = new Date(2026, 7, 25, 14, 5, 0); // 2:05 PM
    const epoch = date.getTime();

    const time12 = formatClockTime(epoch, false);
    expect(time12).toMatch(/2:05\s*PM/i);

    const time24 = formatClockTime(epoch, true);
    expect(time24).toBe('14:05');
  });

  it('formats simple human-friendly platform destinations', () => {
    expect(formatSimpleDestination('Lynnwood City Center')).toBe('To Lynnwood');
    expect(formatSimpleDestination('Angle Lake')).toBe('To Angle Lake');
    expect(formatSimpleDestination('South Bellevue')).toBe('To South Bellevue');
    expect(formatSimpleDestination('Downtown Redmond')).toBe('To Redmond');
    expect(formatSimpleDestination('')).toBe('To Terminal');
  });
});
