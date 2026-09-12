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

export function formatClockTime(epochMs: number, is24Hour: boolean = false): string {
  const date = new Date(epochMs);
  if (is24Hour) {
    const hours = date.getHours().toString().padStart(2, '0');
    const minutes = date.getMinutes().toString().padStart(2, '0');
    return `${hours}:${minutes}`;
  }

  let hours = date.getHours();
  const minutes = date.getMinutes().toString().padStart(2, '0');
  const ampm = hours >= 12 ? 'PM' : 'AM';
  hours = hours % 12;
  hours = hours ? hours : 12; // 0 becomes 12
  return `${hours}:${minutes} ${ampm}`;
}
