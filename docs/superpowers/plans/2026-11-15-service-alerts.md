# Service & Alerts Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a live Link Light Rail Service & Alerts dashboard tab powered by Sound Transit's public GTFS-RT JSON feed (`alerts_pb.json`), featuring a quiet empty state, severity-colored active indicator dot/badge, and an active disruption banner on the main board.

**Architecture:** A new `src/services/alerts-api.ts` module fetches and normalizes `https://s3.amazonaws.com/st-service-alerts-prod/alerts_pb.json` (CORS-enabled on `GET`), filtering to active Link Light Rail notices (`100479`, `2LINE`, `1-SHUTTLE`, `2-SHUTTLE`). `TransitTrackerApp` in `src/main.ts` replaces the 2-way `showOnlyPinned` toggle with a 3-way `viewMode` (`'pinned' | 'all' | 'alerts'`), swaps the main content area with a dedicated `AlertsView` component when `Alerts` is active, and displays an amber/red indicator + clickable disruption banner only while active Link alerts exist.

**Tech Stack:** TypeScript 7, Vite 8, Vitest 5 (`jsdom`), vanilla DOM utilities (`src/utils/dom.ts`), CSS custom properties (`src/styles/theme.css`).

**Spec:** [docs/superpowers/specs/2026-11-15-service-alerts-design.md](../specs/2026-11-15-service-alerts-design.md)

## Global Constraints

- Static GitHub Pages hosting only: no backend server or proxy; fetch `https://s3.amazonaws.com/st-service-alerts-prod/alerts_pb.json` directly in the browser.
- Service Worker (`public/sw.js`) must treat `https://s3.amazonaws.com/st-service-alerts-prod/` as network-only alongside `onebusaway.org` so stale alerts are never served from disk cache.
- Empty (`0` alerts) `Alerts` tab pill keeps readable WCAG AA contrast (`quiet` neutral styling, no low-opacity disabled look, no numeric `0` badge); active (`> 0`) pill shows dot + count badge in red (`SEVERE`) or amber (`WARNING` / `INFO`).
- Never use `transition: all` or transition layout properties (`font-weight`, `width`, `height`, `padding`, `margin`) in any stylesheet (`tests/css-performance.test.ts` enforces this).
- Use `npm test`, `TZ=UTC npm test`, `npm run typecheck`, and `npm run build` for verification.

## Review Focus

- **Untrusted alert text & links:** Malformed `description_text`, HTML characters like `<script>` in `header_text`, or non-HTTP(S) `url` schemes (e.g. `javascript:`) must render as plain escaped text and omit unsafe `href` attributes.
- **GTFS-RT seconds vs JS milliseconds & future `active_period`:** GTFS-RT `active_period[].start` and `end` are Unix seconds; an alert scheduled for tomorrow (`start > nowSec`) or already ended (`end < nowSec`) must NOT appear active or light up the `Alerts` badge.
- **Multiple `active_period` entries & missing `end`:** Alerts remain active if *any* period matches `(!p.start || nowSec >= p.start) && (!p.end || nowSec <= p.end)`.
- **Alerts fetch failures vs healthy departure board:** If `alerts_pb.json` fails or times out while OneBusAway station arrivals succeed, arrival cards and `staleBannerEl` must remain unaffected, while `AlertsView` renders a non-destructive retry/unavailable message with a link to soundtransit.org.
- **Existing `fetchMock` assertions & concurrency cleanup:** Adding background alerts polling in `TransitTrackerApp` must keep `destroy()`, line switching, and `tests/mobile-optimizations.test.ts` OBA request assertions clean and race-free.

---

### Task 1: Service Worker Network-Only Bypass for Sound Transit Alerts

**Files:**
- Modify: `public/sw.js:121-125`
- Test: `tests/service-worker.test.ts:200-264`

**Interfaces:**
- Consumes: `public/sw.js` `fetch` listener routing rules
- Produces: Network-only pass-through when `url.origin === 'https://s3.amazonaws.com' && url.pathname.startsWith('/st-service-alerts-prod/')`

- [ ] **Step 1: Read lines 195-264 of `tests/service-worker.test.ts` to inspect existing Rule 1 OBA tests**

- [ ] **Step 2: Write the failing test in `tests/service-worker.test.ts`**

Add a test in `describe('Service Worker runtime behavior (fetch routing)', ...)` asserting `sw.dispatchFetch('https://s3.amazonaws.com/st-service-alerts-prod/alerts_pb.json')` returns `undefined` (not intercepted or cached by SW) even after `runLifecycle('install')` and `runLifecycle('activate')`, alongside non-matching `s3.amazonaws.com` paths if any.

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run tests/service-worker.test.ts`
Expected: FAIL — `dispatchFetch` currently intercepts it with Rule 4 (`staleWhileRevalidate`) and returns a `Promise` instead of `undefined`.

- [ ] **Step 4: Update `public/sw.js:121-125`**

Extend Rule 1 (`Network-Only`) in `public/sw.js` to return early when:
`(url.origin === "https://s3.amazonaws.com" && url.pathname.startsWith("/st-service-alerts-prod/"))`.

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run tests/service-worker.test.ts`
Expected: PASS (14 tests pass).

- [ ] **Step 6: Commit**

```bash
git add public/sw.js tests/service-worker.test.ts
git commit -m "fix(sw): bypass service worker cache for Sound Transit alerts feed"
```

---

### Task 2: Service Alerts Types & GTFS-RT Parser/Fetch Service

**Files:**
- Modify: `src/types/transit.ts`
- Create: `src/services/alerts-api.ts`
- Test: `tests/alerts-api.test.ts`

**Interfaces:**
- Produces in `src/types/transit.ts`:
  - `export type AlertSeverity = 'SEVERE' | 'WARNING' | 'INFO';`
  - `export interface ServiceAlert { id: string; severity: AlertSeverity; effect: string; cause: string; lines: TransitLineId[]; header: string; description: string; url: string | null; activeStartMs: number | null; activeEndMs: number | null; }`
  - `export interface ServiceAlertsFeed { alerts: ServiceAlert[]; updatedAt: number; }`
- Produces in `src/services/alerts-api.ts`:
  - `export const ST_ALERTS_FEED_URL = 'https://s3.amazonaws.com/st-service-alerts-prod/alerts_pb.json';`
  - `export const ST_ALERTS_WEB_URL = 'https://www.soundtransit.org/ride-with-us/service-alerts';`
  - `export function transformGtfsAlerts(raw: RawGtfsAlertsFeed, nowEpochMs?: number): ServiceAlert[];`
  - `export function sanitizeAlertUrl(rawUrl?: string): string | null;`
  - `export async function fetchServiceAlerts(bypassCache?: boolean, signal?: AbortSignal): Promise<ServiceAlertsFeed>;`
  - `export function clearAlertsCache(): void;`

- [ ] **Step 1: Write the failing unit tests in `tests/alerts-api.test.ts`**

Write unit tests covering every parsing and network rule:
1. Maps GTFS-RT entities into `ServiceAlert[]` keeping only Link Light Rail routes (`100479`, `2LINE`, `1-SHUTTLE`, `2-SHUTTLE`) and excluding Sounder/bus routes (`SNDR_TL`, `590`).
2. Maps route tags accurately (`'100479'` / `'1-SHUTTLE'` -> `'line-1'`, `'2LINE'` / `'2-SHUTTLE'` -> `'line-2'`, deduplicated and sorted `['line-1', 'line-2']`).
3. Converts GTFS-RT `active_period` Unix seconds cleanly against `nowEpochMs`: drops expired alerts (`end * 1000 < now`), drops future alerts (`start * 1000 > now`), keeps open-ended alerts (`{ start }` with no `end`), and keeps alerts if *any* `active_period` entry matches `now`.
4. Sorts alerts by severity (`SEVERE` -> `WARNING` -> `INFO`), then newest `activeStartMs` descending.
5. Rejects unsafe URLs via `sanitizeAlertUrl`: allows `https:` and `http:` URLs, returns `null` for `javascript:`, `data:`, empty strings, or invalid URLs.
6. Fetches `ST_ALERTS_FEED_URL`, caches successful responses for 25s unless `bypassCache = true`, deduplicates concurrent in-flight requests, and rejects cleanly on HTTP error / timeout / abort without caching failures.

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/alerts-api.test.ts`
Expected: FAIL — `Cannot find module '../src/services/alerts-api'`.

- [ ] **Step 3: Add types to `src/types/transit.ts` and implement `src/services/alerts-api.ts`**

- Add `AlertSeverity`, `ServiceAlert`, and `ServiceAlertsFeed` to `src/types/transit.ts`.
- Implement `src/services/alerts-api.ts` mirroring `src/services/oba-api.ts` patterns (`CACHE_TTL_MS = 25 * 1000`, `REQUEST_TIMEOUT_MS = 6000`, `inFlightAlertsPromise` ref-counted abort handling, English translation extraction preferring `language === 'en'` or first non-empty entry, trimming CRLF whitespace cleanly, `sanitizeAlertUrl`).

- [ ] **Step 4: Run tests and typecheck to verify pass**

Run: `npx vitest run tests/alerts-api.test.ts && npm run typecheck`
Expected: PASS and exit 0.

- [ ] **Step 5: Commit**

```bash
git add src/types/transit.ts src/services/alerts-api.ts tests/alerts-api.test.ts
git commit -m "feat: add GTFS-RT Sound Transit Link service alerts parser and fetcher"
```

---

### Task 3: `AlertsView` Component & Alerts Stylesheet

**Files:**
- Modify: `src/utils/dom.ts` (add `alertTriangle` SVG to `ICONS`)
- Create: `src/components/AlertsView.ts`
- Create: `src/styles/alerts.css`
- Modify: `tests/css-performance.test.ts:4-13` (`STYLE_FILES`)
- Test: `tests/alerts-view.test.ts`

**Interfaces:**
- Consumes: `ServiceAlert`, `TransitLineId` (`src/types/transit.ts`), `ST_ALERTS_WEB_URL` (`src/services/alerts-api.ts`), `createElement`, `ICONS` (`src/utils/dom.ts`), `formatClockTime` (`src/utils/time.ts`)
- Produces in `src/components/AlertsView.ts`:
  - `export interface AlertsViewCallbacks { onBackToStations: () => void; onRetry: () => void; }`
  - `export interface AlertsRenderState { alerts: ServiceAlert[]; activeLine: TransitLineId; updatedAt: number | null; isLoading: boolean; error: string | null; timeFormat24Hour: boolean; }`
  - `export class AlertsViewComponent { constructor(callbacks: AlertsViewCallbacks); getElement(): HTMLElement; update(state: AlertsRenderState): void; }`

- [ ] **Step 1: Add `'alerts.css'` to `STYLE_FILES` in `tests/css-performance.test.ts` and write failing `tests/alerts-view.test.ts`**

Test cases in `tests/alerts-view.test.ts`:
1. Renders loading skeleton when `isLoading: true && updatedAt === null`.
2. Renders `"No active Link service alerts"` good-service card with external link to `ST_ALERTS_WEB_URL` and a `"Back to Stations"` button that invokes `onBackToStations` when `alerts: [] && !error`.
3. Renders error card with `"Retry"` button calling `onRetry` and link to `ST_ALERTS_WEB_URL` when `error` is set and `updatedAt === null`.
4. Orders alerts prioritizing `SEVERE` then `WARNING`/`INFO` (and prioritizing `activeLine` within equal severity), escapes HTML strings safely (`<script>` rendered as text, never executed/injected as DOM element), displays `1 Line` / `2 Line` badges, formats paragraphs safely without innerHTML injection, and renders external `target="_blank" rel="noopener noreferrer"` links only when `url` is non-null.

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/alerts-view.test.ts tests/css-performance.test.ts`
Expected: FAIL — `Cannot find module '../src/components/AlertsView'` and missing `alerts.css`.

- [ ] **Step 3: Add `ICONS.alertTriangle`, implement `src/components/AlertsView.ts`, and create `src/styles/alerts.css`**

- Ensure all alert header/description text uses DOM `.textContent` (creating paragraph elements per blank-line block) — never raw HTML interpolation of feed strings.
- Style `.alerts-view`, `.alert-card`, `.alert-card.severity-severe`, `.alert-card.severity-warning`, `.alert-card.severity-info`, `.alerts-empty-card`, `.alerts-error-card`, plus `.view-mode-btn.alerts-tab-btn` indicator styles (quiet state, `.has-warning`, `.has-severe`, `.alert-indicator-dot`, `.alert-count-badge`) and `.disruption-banner` strip using explicit non-layout transition properties only.

- [ ] **Step 4: Run tests and typecheck to verify they pass**

Run: `npx vitest run tests/alerts-view.test.ts tests/css-performance.test.ts && npm run typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/utils/dom.ts src/components/AlertsView.ts src/styles/alerts.css tests/css-performance.test.ts tests/alerts-view.test.ts
git commit -m "feat: add AlertsView component and accessible alert card styles"
```

---

### Task 4: Wire Dashboard `Alerts` Tab, Indicator States, Active Banner & Live Sync in `TransitTrackerApp`

**Files:**
- Modify: `src/main.ts`
- Modify: `src/styles/layout.css` (ensure 3-pill toolbar sizing wraps gracefully if needed without changing existing `.line-switcher` behavior)
- Modify: `tests/mobile-optimizations.test.ts:237-249` (scope OBA stop-fetch count assertions to `onebusaway.org` URLs so background `alerts_pb.json` polling is tested independently)
- Test: `tests/alerts-view.test.ts` (integration suite for `TransitTrackerApp`)

**Interfaces:**
- Consumes: `fetchServiceAlerts`, `clearAlertsCache` (`src/services/alerts-api.ts`), `AlertsViewComponent` (`src/components/AlertsView.ts`), `./styles/alerts.css`
- Produces in `src/main.ts`:
  - `viewMode: 'pinned' | 'all' | 'alerts'` state (replaces boolean `showOnlyPinned`, preserving default `'pinned'` on launch)
  - 3rd pill `alertsBtn` in `.toolbar-controls .line-switcher` with accessible label (`"Alerts"` when `0`, `"Alerts, N active"` when `> 0`), dot/badge visual states (`has-severe`, `has-warning`, quiet neutral when `0`)
  - `disruptionBannerEl` strip (`button` or banner with clickable CTA) shown above toolbar whenever `activeAlerts.length > 0 && viewMode !== 'alerts'`, hidden otherwise; clicking switches to `viewMode = 'alerts'`
  - Parallel `fetchAlerts()` triggered alongside `fetchVisibleArrivals()` on initial poll, 60s `PollScheduler` tick, reconnect (`bypassCache = true`), and manual brand/retry refresh; cancels cleanly on `destroy()` without triggering false `staleBannerEl` errors when OBA station requests succeed

- [ ] **Step 1: Write failing `TransitTrackerApp` integration tests in `tests/alerts-view.test.ts` and update OBA URL filter in `tests/mobile-optimizations.test.ts`**

Add integration tests in `tests/alerts-view.test.ts` verifying:
1. With `0` Link alerts in `alerts_pb.json`, the `Alerts` tab renders quiet styling (no `.has-warning` / `.has-severe`, no count badge `0`), `.disruption-banner` stays hidden, and clicking `Alerts` opens the `"No active Link service alerts"` view while keeping `★ My Stations` return clickable.
2. With active `WARNING` / `SEVERE` Link alerts in `alerts_pb.json`, the `Alerts` tab receives `.has-warning` or `.has-severe` + count badge (`2`), `.disruption-banner` becomes visible summarizing the disruption, and clicking either the banner or `Alerts` switches to `AlertsView` showing the alerts.
3. Returning to `★ My Stations` or clicking `1 Line` / `2 Line` properly restores station cards (`stationsGridEl`) and second ticker without losing arrival state or leaking intervals.
4. When `alerts_pb.json` fails while OBA arrivals succeed, station cards continue rendering normally and `AlertsView` shows the error + retry state rather than breaking the arrival board banner.

Also update lines 237-249 in `tests/mobile-optimizations.test.ts` to filter `fetchMock.mock.calls` by `String(url).includes('onebusaway.org')` so the existing platform lazy-fetch assertions remain exact.

- [ ] **Step 2: Run tests to verify new integration tests fail**

Run: `npx vitest run tests/alerts-view.test.ts tests/mobile-optimizations.test.ts`
Expected: FAIL — `TransitTrackerApp` does not yet render `.alerts-tab-btn`, `.disruption-banner`, or fetch `alerts_pb.json`.

- [ ] **Step 3: Implement `Alerts` tab, indicator, disruption banner, and polling in `src/main.ts` and `src/styles/layout.css`**

- Replace `showOnlyPinned` checks with `viewMode: 'pinned' | 'all' | 'alerts'`.
- Pause 1s card countdown ticker & hide `.stations-grid` when `viewMode === 'alerts'`; resume/re-sync cards cleanly when switching back to `'pinned'` / `'all'`, or when switching `1 Line` / `2 Line` in the header (when switching lines while in `'alerts'`, either keep `'alerts'` active and re-sort/highlight the newly selected line's alerts cleanly or switch cleanly — keeping `'alerts'` open and updating `activeLine` priority + header badge feels most natural).
- Guard `alertsAbortController` cleanly in `destroy()` and ignore `AbortError`.

- [ ] **Step 4: Run full verification suite**

Run: `npm test && TZ=UTC npm test && npm run typecheck && npm run build`
Expected: All test suites and tests PASS in both local timezone and `TZ=UTC`, `tsc` passes with 0 errors, and Vite production build succeeds.

- [ ] **Step 5: Commit**

```bash
git add src/main.ts src/styles/layout.css tests/alerts-view.test.ts tests/mobile-optimizations.test.ts
git commit -m "feat: add Service & Alerts dashboard tab, indicator, and live polling"
```
