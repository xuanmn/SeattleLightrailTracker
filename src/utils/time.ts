/**
 * Time and Countdown Utilities for Live Transit Departures
 */

export function calculateMinutesRemaining(targetEpochMs: number, nowEpochMs: number = Date.now()): number {
  const diffMs = targetEpochMs - nowEpochMs;
  if (diffMs <= 0) return 0;
  return Math.floor(diffMs / (60 * 1000));
}

export function formatCountdownBadge(
  targetEpochMs: number,
  nowEpochMs: number = Date.now()
): { text: string; isNow: boolean; rawMinutes: number } {
  const diffMs = targetEpochMs - nowEpochMs;
  const rawMinutes = diffMs / (60 * 1000);

  if (diffMs <= 45 * 1000) {
    // Under 45 seconds -> ARRIVING NOW
    return { text: 'ARRIVING', isNow: true, rawMinutes };
  }

  const minutes = Math.max(1, Math.round(rawMinutes));
  return {
    text: `${minutes} MIN`,
    isNow: false,
    rawMinutes,
  };
}

export function formatDelayStatus(
  delaySeconds: number,
  isRealtime: boolean
): { text: string; type: 'ontime' | 'delayed' | 'delayed-severe' | 'early' | 'scheduled' } {
  if (!isRealtime) {
    return { text: 'Scheduled', type: 'scheduled' };
  }

  const delayMinutes = Math.round(Math.abs(delaySeconds) / 60);

  if (delaySeconds >= 600) {
    return {
      text: `${delayMinutes}m Delay`,
      type: 'delayed-severe',
    };
  }

  if (delaySeconds >= 60) {
    return {
      text: `${delayMinutes}m Delay`,
      type: 'delayed',
    };
  }

  if (delaySeconds <= -60) {
    return {
      text: `${delayMinutes}m Early`,
      type: 'early',
    };
  }

  return {
    text: 'On Time',
    type: 'ontime',
  };
}

// ── Reusable Intl.DateTimeFormat instances (Fix #9) ──
// Created once and reused for all formatClockTime calls to avoid repeated Date/formatter allocations.
const formatter12h = new Intl.DateTimeFormat('en-US', {
  hour: 'numeric',
  minute: '2-digit',
  hour12: true,
  timeZone: 'America/Los_Angeles',
});

const formatter24h = new Intl.DateTimeFormat('en-US', {
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
  timeZone: 'America/Los_Angeles',
});

export function formatClockTime(epochMs: number, is24Hour: boolean = false): string {
  const formatter = is24Hour ? formatter24h : formatter12h;
  return formatter.format(epochMs);
}
