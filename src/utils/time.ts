/**
 * Time and Countdown Utilities for Live Transit Departures
 */

export function formatCountdownBadge(
  targetEpochMs: number,
  nowEpochMs: number = Date.now()
): { text: string; isNow: boolean } {
  const diffMs = targetEpochMs - nowEpochMs;

  if (diffMs < -60 * 1000) {
    return { text: 'DEPARTED', isNow: false };
  }

  if (diffMs <= 45 * 1000) {
    // Under 45 seconds -> ARRIVING NOW
    return { text: 'ARRIVING', isNow: true };
  }

  const minutes = Math.max(1, Math.round(diffMs / (60 * 1000)));
  return {
    text: `${minutes} MIN`,
    isNow: false,
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

const seattleDayFormatter = new Intl.DateTimeFormat('en-CA', {
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  timeZone: 'America/Los_Angeles',
});

const seattleMonthDayFormatter = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: 'numeric',
  timeZone: 'America/Los_Angeles',
});

const seattleMonthDayYearFormatter = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: 'numeric',
  year: 'numeric',
  timeZone: 'America/Los_Angeles',
});

export function formatClockTime(epochMs: number, is24Hour: boolean = false): string {
  const formatter = is24Hour ? formatter24h : formatter12h;
  return formatter.format(epochMs);
}

/**
 * Format an alert boundary timestamp in Seattle time, omitting the calendar date
 * when it falls on the same local day as `nowEpochMs`.
 */
export function formatAlertTimestamp(
  epochMs: number,
  is24Hour: boolean = false,
  nowEpochMs: number = Date.now()
): string {
  const clock = formatClockTime(epochMs, is24Hour);
  const targetDay = seattleDayFormatter.format(epochMs);
  const todayDay = seattleDayFormatter.format(nowEpochMs);
  if (targetDay === todayDay) {
    return clock;
  }

  const targetYear = targetDay.slice(0, 4);
  const currentYear = todayDay.slice(0, 4);
  const dateLabel =
    targetYear === currentYear
      ? seattleMonthDayFormatter.format(epochMs)
      : seattleMonthDayYearFormatter.format(epochMs);
  return `${dateLabel}, ${clock}`;
}
