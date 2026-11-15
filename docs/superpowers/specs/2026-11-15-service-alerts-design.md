# Service & Alerts Tab Design

**Date:** 2026-11-15  
**Scope:** Small feature addition (static client-side GTFS-RT alert feed + dashboard tab + active alert indicator & banner)

---

## 1. Intent & Why

Riders checking real-time Link arrivals need to know immediately when Sound Transit posts a disruption, shuttle bridge, elevator outage, or planned maintenance notice—without leaving the tracker for soundtransit.org.

## 2. Goals, Non-Goals & Anti-Goals

- **Goals:**
  - Fetch Sound Transit's official live service alerts directly in the browser and display Link Light Rail alerts cleanly inside the app.
  - Surface a clear, high-contrast status indicator on the `Alerts` tab when one or more Link alerts are active, while receding quietly when service is normal (`0` active alerts).
  - Surface an optional at-a-glance disruption strip above the station cards when active Link alerts exist, linking directly into the `Alerts` view.
  - Link each alert out to its official `soundtransit.org` page for full details.
- **Non-Goals:**
  - Scraping `soundtransit.org` HTML pages or standing up a backend proxy server.
  - Showing non-Link transit alerts (Sounder commuter rail, ST Express buses, Tacoma T Line) by default.
  - Persisting the `Alerts` tab across page reloads (landing view remains station countdowns).
- **Anti-Goals:**
  - Dropping the empty `Alerts` tab below WCAG contrast thresholds or making it look disabled/broken when no alerts exist.
  - Letting the PWA Service Worker cache stale `alerts_pb.json` responses.

## 3. Constraints

- **Static GitHub Pages hosting:** All fetches happen client-side over CORS. `https://www.soundtransit.org/ride-with-us/service-alerts` sets `x-frame-options: SAMEORIGIN` and no `Access-Control-Allow-Origin` header, whereas Sound Transit's official Open Transit Data GTFS-RT JSON feed (`https://s3.amazonaws.com/st-service-alerts-prod/alerts_pb.json`) serves `Access-Control-Allow-Origin: *` on `GET`.
- **Service Worker bypass:** `public/sw.js` falls through unknown origins to `staleWhileRevalidate`; it must treat the Sound Transit alerts feed as network-only alongside `onebusaway.org`.
- **CSS performance guardrails:** Transitions must avoid `all` and layout properties (`width`, `height`, `padding`, `margin`, `font-weight`) enforced by `tests/css-performance.test.ts`.
- **Accessibility:** Readable contrast in both active and quiet tab states, semantic headings/links, and `aria-live` / button states aligned with existing toolbar pills.

## 4. Approaches Considered

1. **Dashboard `Alerts` tab (`★ My Stations` | `All Stations` | `Alerts`) + active disruption strip (Chosen):** Reuses `.view-mode-btn` pills in the dashboard toolbar, avoids crowding the sticky mobile header (`Map`, `Guide`, `⚙`), keeps `★ My Stations` as default landing view, and adds a compact clickable strip above the board when Link disruptions exist.
2. **Header `Alerts` button + lazy modal dialog:** Adds a third text button to `.header-actions` alongside `Map` and `Guide` and renders alerts in an overlay modal. Rejected because the mobile top bar is already tight and an inline view pill feels faster to switch between stations and alerts.

## 5. Design Details

### 5.1 Live Feed Fetching & Link Filtering (`src/services/alerts-api.ts`, `src/types/transit.ts`)
- Fetch `https://s3.amazonaws.com/st-service-alerts-prod/alerts_pb.json` with `AbortSignal` + 6s timeout on dashboard refresh (`PollScheduler` 60s cadence / reconnect) and initial load, with short in-memory caching cleared on manual refresh alongside arrivals.
- Parse GTFS-RT `entity[].alert`: extract English `header_text`, `description_text`, `url`, `severity_level` (`SEVERE` | `WARNING` | `INFO`), `effect` / `effect_detail`, `cause_detail`, `active_period[]`, and `informed_entity[]`.
- Keep alerts that match Link Light Rail routes (`100479`, `2LINE`, `1-SHUTTLE`, `2-SHUTTLE`) or active timestamps: include open-ended periods (`!end`) or periods containing `now` (`start <= now && now <= end`) and sort `SEVERE` first, then `WARNING`, then `INFO`, keeping line tags (`1 Line`, `2 Line`, or both).

### 5.2 Tab Pill Indicator States (Active vs. Quiet)
- **Active alerts (`count > 0`):**
  - Shows `Alerts` + live indicator dot + count pill (e.g. `Alerts 2`).
  - Uses **red alert accent** if any active alert is `SEVERE` (e.g. train suspension / shuttle replacement), or **amber warning accent** when only `WARNING`/`INFO` notices exist (e.g. elevator outage / parking restriction).
- **No active alerts (`count === 0`) — Quiet State (instead of low-opacity disabled styling):**
  - Keeps readable WCAG AA text contrast and normal hover/click affordance so riders still know the tab works.
  - Drops any bright accent border/glow and hides the numeric count badge (`Alerts`), receding cleanly next to `All Stations` as neutral secondary text.
  - Opening it displays a clean `"No active Link service alerts"` / Good Service state with the last-checked timestamp and a direct link to soundtransit.org.

```text
With active Link alerts:
[ ★ My Stations ] [ All Stations ] [ ● Alerts 2 ]   ← amber/red dot + count badge
┌──────────────────────────────────────────────────────────────────────┐
│ ⚠ 2 active Link alerts: 2 Line shuttle buses · 1 Line disruption   → │
└──────────────────────────────────────────────────────────────────────┘

When no Link alerts are active:
[ ★ My Stations ] [ All Stations ] [   Alerts   ]   ← quiet neutral pill, clickable
```

### 5.3 Alerts View & Cards
- Clicking `Alerts` (or the active alert strip) switches the main board area into the Alerts view while hiding the station cards grid (and pausing station-card arrival polling only if unneeded—actually keeping existing background 60s refresh or syncing both cleanly so switching back to `My Stations` is instant).
- Render structured cards sorted by severity (`SEVERE` -> `WARNING` -> `INFO`), displaying severity pill, affected line badge(s) (`1 Line` / `2 Line`), active window if present, headline, concise formatted description, and an external `"View on soundtransit.org ↗"` link (`target="_blank" rel="noopener noreferrer"`).
- Note line filtering callout: because the dashboard header toggles `1 Line` / `2 Line`, show a subtle line indicator badge per alert (`1 Line`, `2 Line`, or `1 & 2 Line`), prioritizing/displaying alerts matching the active line first (or all Link alerts clearly badged so cross-line shuttle notices like 1 Line vs 2 Line are never hidden accidentally—Builder's call to show all active Link alerts with the active line ordered first).

### 5.4 Builder Calls Left Open to Implementation
- Exact CSS token values for red/amber severity pills (reusing existing `--st-red` / amber warning colors already in `theme.css` / `layout.css` `.status-banner`).
- Whether clicking the active alert strip navigates straight to the `Alerts` tab and scrolls smoothly to the top (`scrollTo` if needed).
- Compact mobile button label shortening (`<= 420px`) only if the 3 toolbar pills need breathing room on 320px viewports.

## 6. Verification Plan
- Unit tests in `tests/` for GTFS-RT alert parsing, Link route/active-window filtering, severity sorting, and `0`-alert vs `SEVERE`/`WARNING` tab indicator states, active banner visibility, and Service Worker exclusion of `s3.amazonaws.com/st-service-alerts-prod/`.
- Full `npm test`, `TZ=UTC npm test`, `npm run typecheck`, and `npm run build`.
