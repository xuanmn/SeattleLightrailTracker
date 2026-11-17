import { describe, expect, it } from "vitest";
import { formatSimpleDestination } from "../src/utils/format";
import {
  formatAlertTimestamp,
  formatClockTime,
  formatCountdownBadge,
  formatDelayStatus,
} from "../src/utils/time";

describe("Time and Countdown Utilities", () => {
  const baseTime = 1700000000000; // Fixed timestamp reference

  it("formats countdown badge with ARRIVING or minute strings", () => {
    // 20s remaining -> ARRIVING
    const arriving = formatCountdownBadge(baseTime + 20 * 1000, baseTime);
    expect(arriving.text).toBe("ARRIVING");
    expect(arriving.isNow).toBe(true);

    // 1 min remaining -> 1 MIN
    const oneMin = formatCountdownBadge(baseTime + 65 * 1000, baseTime);
    expect(oneMin.text).toBe("1 MIN");
    expect(oneMin.isNow).toBe(false);

    // 5 mins remaining -> 5 MIN
    const fiveMin = formatCountdownBadge(baseTime + 5 * 60 * 1000, baseTime);
    expect(fiveMin.text).toBe("5 MIN");

    // 20s past departure (still at platform) -> ARRIVING
    const dwell = formatCountdownBadge(baseTime - 20 * 1000, baseTime);
    expect(dwell.text).toBe("ARRIVING");
    expect(dwell.isNow).toBe(true);

    // >60s past departure -> DEPARTED (never stuck pulsing green as ARRIVING)
    const expired = formatCountdownBadge(baseTime - 90 * 1000, baseTime);
    expect(expired.text).toBe("DEPARTED");
    expect(expired.isNow).toBe(false);
  });

  it("formats delay status properly", () => {
    // Realtime on-time (<60s delay)
    const onTime = formatDelayStatus(30, true);
    expect(onTime.text).toBe("On Time");
    expect(onTime.type).toBe("ontime");

    // Realtime moderate late (>=60s and <600s)
    const late = formatDelayStatus(180, true);
    expect(late.text).toBe("3m Delay");
    expect(late.type).toBe("delayed");

    // Realtime severe late (>=600s / 10 minutes)
    const severeLate10 = formatDelayStatus(600, true);
    expect(severeLate10.text).toBe("10m Delay");
    expect(severeLate10.type).toBe("delayed-severe");

    const severeLate15 = formatDelayStatus(900, true);
    expect(severeLate15.text).toBe("15m Delay");
    expect(severeLate15.type).toBe("delayed-severe");

    // Realtime early (<=-60s)
    const early = formatDelayStatus(-120, true);
    expect(early.text).toBe("2m Early");
    expect(early.type).toBe("early");

    // Non-realtime / scheduled estimate
    const scheduled = formatDelayStatus(0, false);
    expect(scheduled.text).toBe("Scheduled");
    expect(scheduled.type).toBe("scheduled");
  });

  it("formats clock time in 12-hour and 24-hour formats", () => {
    // Use a known UTC epoch: 2026-08-25T21:05:00Z = 2:05 PM Pacific (PDT, UTC-7)
    const epoch = Date.UTC(2026, 7, 25, 21, 5, 0);

    const time12 = formatClockTime(epoch, false);
    expect(time12).toMatch(/2:05\s*PM/i);

    const time24 = formatClockTime(epoch, true);
    expect(time24).toBe("14:05");
  });

  it("formats simple human-friendly platform destinations", () => {
    expect(formatSimpleDestination("Lynnwood City Center")).toBe("To Lynnwood");
    expect(formatSimpleDestination("Angle Lake")).toBe("To Angle Lake");
    expect(formatSimpleDestination("South Bellevue")).toBe("To South Bellevue");
    expect(formatSimpleDestination("Downtown Redmond")).toBe("To Redmond");
    expect(formatSimpleDestination("")).toBe("To Terminal");
  });

  it("formats alert timestamps with dates only when crossing calendar days or years in Seattle time", () => {
    // 2026-11-17T17:00:00Z = Nov 17, 2026 9:00 AM PST
    const refNow = Date.UTC(2026, 10, 17, 17, 0, 0);
    // Same Seattle day: Nov 17, 2026 2:05 PM PST (22:05Z)
    const sameDay = Date.UTC(2026, 10, 17, 22, 5, 0);
    expect(formatAlertTimestamp(sameDay, false, refNow)).toMatch(/^2:05\s*PM$/i);
    expect(formatAlertTimestamp(sameDay, true, refNow)).toBe("14:05");

    // Different day same year: Nov 3, 2026 5:00 AM PST (13:00Z)
    const diffDay = Date.UTC(2026, 10, 3, 13, 0, 0);
    expect(formatAlertTimestamp(diffDay, false, refNow)).toMatch(/Nov 3,\s*5:00\s*AM/i);
    expect(formatAlertTimestamp(diffDay, true, refNow)).toBe("Nov 3, 05:00");

    // Different year: Jan 29, 2027 4:00 PM PST (2027-01-30T00:00:00Z)
    const diffYear = Date.UTC(2027, 0, 30, 0, 0, 0);
    expect(formatAlertTimestamp(diffYear, false, refNow)).toMatch(/Jan 29, 2027,\s*4:00\s*PM/i);
  });
});
