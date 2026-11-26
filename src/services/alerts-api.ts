import type {
  AlertSeverity,
  ServiceAlert,
  ServiceAlertsFeed,
  TransitLineId,
} from '../types/transit';
import { STATIONS } from '../data/stations';

export const ST_ALERTS_FEED_URL =
  'https://s3.amazonaws.com/st-service-alerts-prod/alerts_pb.json';
export const ST_ALERTS_WEB_URL =
  'https://www.soundtransit.org/ride-with-us/service-alerts';

const CACHE_TTL_MS = 25 * 1000;
const REQUEST_TIMEOUT_MS = 6000;

const ALERTS_POLL_INTERVAL_MS = 60 * 60 * 1000;
const ALERTS_MIN_REFETCH_GAP_MS = 15 * 60 * 1000;
const ALERTS_ERROR_RETRY_MS = 5 * 60 * 1000;
const CLOCK_SKEW_TOLERANCE_MS = 60 * 1000;

/**
 * Determine whether cached alerts should be refreshed on the next poll tick or tab open.
 * Aligns healthy refreshes to :00 clock boundaries, skipping the upcoming :00 if fetched
 * within 15 minutes before it. Retries failed fetches every 5 minutes regardless of :00.
 */
export function isAlertsFetchStale(
  lastFetchAt: number | null,
  nowEpochMs: number = Date.now(),
  hasError: boolean = false
): boolean {
  if (lastFetchAt === null) return true;
  // Recover from significant backward wall-clock adjustments while ignoring minor NTP jitter
  if (lastFetchAt - nowEpochMs > CLOCK_SKEW_TOLERANCE_MS) return true;
  if (hasError) {
    return nowEpochMs - lastFetchAt >= ALERTS_ERROR_RETRY_MS;
  }
  const nextHourBoundary =
    (Math.floor(lastFetchAt / ALERTS_POLL_INTERVAL_MS) + 1) * ALERTS_POLL_INTERVAL_MS;
  const nextSyncAt =
    nextHourBoundary - lastFetchAt < ALERTS_MIN_REFETCH_GAP_MS
      ? nextHourBoundary + ALERTS_POLL_INTERVAL_MS
      : nextHourBoundary;
  return nowEpochMs >= nextSyncAt;
}

const LINK_ROUTE_TO_LINE: Record<string, TransitLineId> = {
  '100479': 'line-1',
  '1-SHUTTLE': 'line-1',
  '2LINE': 'line-2',
  '2-SHUTTLE': 'line-2',
};

const LINE_ORDER: Record<TransitLineId, number> = {
  'line-1': 0,
  'line-2': 1,
};

const SEVERITY_RANK: Record<AlertSeverity, number> = {
  SEVERE: 0,
  WARNING: 1,
  INFO: 2,
};

const FACILITY_PREFIX_RE = /^([NSE]\d{2})(?:-|$)/;

const DIRECTIONAL_TOWARD_RE =
  /\b(?:(?:trains?|service)\s+)?(?:(?:heading|headed|traveling|travelling|going)\s+)?(?:toward|towards|bound\s+for)\s+(?:the\s+)?(?:lynnwood(?:\s+city\s+center)?|federal\s+way(?:\s+downtown)?|angle\s+lake|downtown\s+redmond|northgate)\b/gi;

const DIRECTIONAL_TRAINS_TO_RE =
  /\btrains?\s+(?:(?:heading|headed|traveling|travelling|going)\s+)?to\s+(?:lynnwood(?:\s+city\s+center)?|federal\s+way(?:\s+downtown)?|angle\s+lake|downtown\s+redmond|northgate)\b/gi;

function normalizeStopId(raw: string): string {
  return raw.trim().replace(/^\d+_/, '').toUpperCase();
}

const STATION_ORDER = new Map<string, number>();
const STOP_ID_TO_STATION_ID = new Map<string, string>();
const FACILITY_CODE_TO_STATION_ID = new Map<string, string>();

STATIONS.forEach((station, index) => {
  STATION_ORDER.set(station.id, index);
  const platforms = [
    station.platforms.northbound,
    station.platforms.southbound,
    station.platforms.eastbound,
    station.platforms.westbound,
  ];
  for (const platform of platforms) {
    if (!platform?.stopId) continue;
    const normalized = normalizeStopId(platform.stopId);
    STOP_ID_TO_STATION_ID.set(normalized, station.id);
    const prefixMatch = normalized.match(FACILITY_PREFIX_RE);
    if (prefixMatch) {
      FACILITY_CODE_TO_STATION_ID.set(prefixMatch[1], station.id);
    }
  }
});

/**
 * Fallback station-name matchers applied ONLY to alert headers when Sound Transit
 * omits `stop_id` entries from `informed_entity`. Ordered canonically by STATIONS.
 */
const STATION_HEADER_PATTERNS: Record<string, RegExp> = {
  'lynnwood-city-center': /\blynnwood\s+city\s+center\b/i,
  'mountlake-terrace': /\bmountlake\s+terrace\b/i,
  'shoreline-north-185th': /\bshoreline\s+north\b/i,
  'shoreline-south-148th': /\bshoreline\s+south\b/i,
  pinehurst: /\bpinehurst\b/i,
  northgate: /\bnorthgate\b/i,
  roosevelt: /\broosevelt\b/i,
  'u-district': /\bu[\s-]+district\b/i,
  'university-of-washington': /\buniversity\s+of\s+washington\b|\buw\s+station\b/i,
  'capitol-hill': /\bcapitol\s+hill\b/i,
  westlake: /\bwestlake\b/i,
  symphony: /\bsymphony\b|\buniversity\s+st(?:reet)?\s+station\b/i,
  'pioneer-square': /\bpioneer\s+square\b/i,
  'international-district-chinatown':
    /\b(?:int['’]?l\.?|international)\s+dist(?:rict)?\.?(?:\s*[/&-]\s*chinatown)?\b|\bchinatown\s+station\b|\bid\s*\/\s*chinatown\b/i,
  stadium: /\bstadium\b/i,
  sodo: /\bsodo\b/i,
  'beacon-hill': /\bbeacon\s+hill\b/i,
  'mount-baker': /\b(?:mount|mt\.?)\s+baker\b/i,
  'columbia-city': /\bcolumbia\s+city\b/i,
  othello: /\bothello\b/i,
  'rainier-beach': /\brainier\s+beach\b/i,
  'tukwila-intl-blvd':
    /\btukwila\s+(?:int['’]?l\.?|international)\s+(?:blvd\.?|boulevard)\b|\btukwila\s+station\b/i,
  'seatac-airport': /\bsea-?tac(?:\s*\/\s*airport)?\b/i,
  'angle-lake': /\bangle\s+lake\b/i,
  'kent-des-moines': /\bkent[\s/-]+des\s+moines\b/i,
  'star-lake': /\bstar\s+lake\b/i,
  'federal-way-downtown': /\bfederal\s+way\s+(?:downtown|transit\s+center|station)\b/i,
  'downtown-redmond': /\bdowntown\s+redmond\b/i,
  'marymoor-village': /\bmarymoor\s+village\b/i,
  'redmond-technology': /\bredmond\s+tech(?:nology)?\b/i,
  'overlake-village': /\boverlake\s+village\b/i,
  'bel-red': /\bbel-?red\b/i,
  'spring-district': /\bspring\s+district\b/i,
  wilburton: /\bwilburton\b/i,
  'bellevue-downtown': /\bbellevue\s+downtown\b/i,
  'east-main': /\beast\s+main\b/i,
  'south-bellevue': /\bsouth\s+bellevue\b/i,
  'mercer-island': /\bmercer\s+island\b/i,
  'judkins-park': /\bjudkins\s+park\b/i,
};

const STATION_HEADER_MATCHERS = STATIONS.flatMap((station) => {
  const pattern = STATION_HEADER_PATTERNS[station.id];
  return pattern ? [{ id: station.id, pattern }] : [];
});

interface RawTranslatedTextEntry {
  text?: string;
  language?: string;
}

interface RawTranslatedText {
  translation?: RawTranslatedTextEntry[];
}

interface RawActivePeriod {
  start?: number | string;
  end?: number | string;
}

interface RawInformedEntity {
  route_id?: string;
  stop_id?: string;
}

interface RawGtfsAlert {
  active_period?: RawActivePeriod[];
  informed_entity?: RawInformedEntity[];
  effect?: string;
  severity_level?: string;
  url?: RawTranslatedText;
  header_text?: RawTranslatedText;
  description_text?: RawTranslatedText;
}

interface RawGtfsAlertEntity {
  id?: string;
  alert?: RawGtfsAlert;
}

export interface RawGtfsAlertsFeed {
  header?: {
    timestamp?: number | string;
  };
  entity?: RawGtfsAlertEntity[];
}

interface CachedAlertsEntry {
  timestamp: number;
  feed: ServiceAlertsFeed;
}

interface InFlightAlertsEntry {
  promise: Promise<ServiceAlertsFeed>;
  controller: AbortController;
  subscribers: number;
}

let cachedAlerts: CachedAlertsEntry | null = null;
let inFlightAlerts: InFlightAlertsEntry | null = null;

function createAbortError(): Error {
  const err = new Error('The operation was aborted');
  err.name = 'AbortError';
  return err;
}

function normalizeText(value: string): string {
  return value.replace(/\r\n?/g, '\n').trim();
}

function extractTranslatedText(translated?: RawTranslatedText): string {
  const entries = translated?.translation;
  if (!entries || entries.length === 0) return '';

  const englishEntry = entries.find(
    (entry) =>
      typeof entry.language === 'string' &&
      entry.language.toLowerCase().startsWith('en') &&
      typeof entry.text === 'string' &&
      normalizeText(entry.text).length > 0
  );
  if (englishEntry?.text) {
    return normalizeText(englishEntry.text);
  }

  const fallbackEntry = entries.find(
    (entry) => typeof entry.text === 'string' && normalizeText(entry.text).length > 0
  );
  return fallbackEntry?.text ? normalizeText(fallbackEntry.text) : '';
}

function toEpochMs(secondsValue: number | string | undefined): number | null {
  if (secondsValue === undefined || secondsValue === null || secondsValue === '') {
    return null;
  }
  const num = Number(secondsValue);
  if (!Number.isFinite(num) || num <= 0) return null;
  return Math.round(num * 1000);
}

function findMatchingPeriod(
  periods: RawActivePeriod[] | undefined,
  nowEpochMs: number
): { matched: boolean; activeStartMs: number | null; activeEndMs: number | null } {
  if (!periods || periods.length === 0) {
    return { matched: true, activeStartMs: null, activeEndMs: null };
  }

  for (const period of periods) {
    const startMs = toEpochMs(period.start);
    const endMs = toEpochMs(period.end);
    const startsOk = startMs === null || startMs <= nowEpochMs;
    const endsOk = endMs === null || endMs >= nowEpochMs;
    if (startsOk && endsOk) {
      return { matched: true, activeStartMs: startMs, activeEndMs: endMs };
    }
  }

  return { matched: false, activeStartMs: null, activeEndMs: null };
}

function extractLinkLines(informed?: RawInformedEntity[]): TransitLineId[] {
  if (!informed || informed.length === 0) return [];
  const lines = new Set<TransitLineId>();
  for (const item of informed) {
    const routeId = item.route_id?.trim();
    if (!routeId) continue;
    const mapped = LINK_ROUTE_TO_LINE[routeId];
    if (mapped) {
      lines.add(mapped);
    }
  }
  return Array.from(lines).sort((a, b) => LINE_ORDER[a] - LINE_ORDER[b]);
}

function extractAffectedStationIds(
  informed: RawInformedEntity[] | undefined,
  header: string
): string[] {
  const matched = new Set<string>();

  if (informed && informed.length > 0) {
    for (const item of informed) {
      const routeId = item.route_id?.trim();
      if (routeId && !LINK_ROUTE_TO_LINE[routeId]) {
        continue;
      }
      const rawStopId = item.stop_id?.trim();
      if (!rawStopId) continue;
      const normalized = normalizeStopId(rawStopId);
      const exactStationId = STOP_ID_TO_STATION_ID.get(normalized);
      if (exactStationId) {
        matched.add(exactStationId);
        continue;
      }
      const prefixMatch = normalized.match(FACILITY_PREFIX_RE);
      if (prefixMatch) {
        const facilityStationId = FACILITY_CODE_TO_STATION_ID.get(prefixMatch[1]);
        if (facilityStationId) {
          matched.add(facilityStationId);
        }
      }
    }
  }

  if (matched.size > 0) {
    return Array.from(matched).sort(
      (a, b) => (STATION_ORDER.get(a) ?? Infinity) - (STATION_ORDER.get(b) ?? Infinity)
    );
  }

  if (!header) return [];

  // Strip directional terminus phrases and "Husky Stadium" before header station matching
  const sanitizedHeader = header
    .replace(DIRECTIONAL_TOWARD_RE, '')
    .replace(DIRECTIONAL_TRAINS_TO_RE, '');
  const sanitizedForStadium = sanitizedHeader.replace(/\bhusky\s+stadium\b/gi, '');
  const fallbackIds: string[] = [];
  for (const matcher of STATION_HEADER_MATCHERS) {
    const targetText = matcher.id === 'stadium' ? sanitizedForStadium : sanitizedHeader;
    if (matcher.pattern.test(targetText)) {
      fallbackIds.push(matcher.id);
    }
  }
  return fallbackIds;
}

function normalizeSeverity(raw?: string): AlertSeverity {
  if (raw === 'SEVERE' || raw === 'WARNING' || raw === 'INFO') {
    return raw;
  }
  return 'INFO';
}

/**
 * Validate and normalize an external alert URL, allowing only HTTP(S) schemes.
 */
export function sanitizeAlertUrl(rawUrl?: string): string | null {
  if (typeof rawUrl !== 'string') return null;
  const trimmed = rawUrl.trim();
  if (!trimmed) return null;

  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol === 'https:' || parsed.protocol === 'http:') {
      return parsed.href;
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Transform raw Sound Transit GTFS-RT v2.0 alert entities into active, sorted
 * Link Light Rail alerts.
 */
export function transformGtfsAlerts(
  raw: RawGtfsAlertsFeed,
  nowEpochMs: number = Date.now()
): ServiceAlert[] {
  const entities = raw.entity;
  if (!Array.isArray(entities) || entities.length === 0) {
    return [];
  }

  const alerts: ServiceAlert[] = [];

  for (let i = 0; i < entities.length; i++) {
    const entity = entities[i];
    const alert = entity?.alert;
    if (!alert) continue;

    const lines = extractLinkLines(alert.informed_entity);
    if (lines.length === 0) continue;

    const periodMatch = findMatchingPeriod(alert.active_period, nowEpochMs);
    if (!periodMatch.matched) continue;

    const header = extractTranslatedText(alert.header_text);
    const stationIds = extractAffectedStationIds(alert.informed_entity, header);
    const rawUrl = extractTranslatedText(alert.url);
    alerts.push({
      id: entity.id?.trim() || `alert-${i}`,
      severity: normalizeSeverity(alert.severity_level),
      effect: normalizeText(alert.effect ?? ''),
      lines,
      stationIds,
      header,
      description: extractTranslatedText(alert.description_text),
      url: sanitizeAlertUrl(rawUrl),
      activeStartMs: periodMatch.activeStartMs,
      activeEndMs: periodMatch.activeEndMs,
    });
  }

  alerts.sort((a, b) => {
    const severityDiff = SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity];
    if (severityDiff !== 0) return severityDiff;
    return (b.activeStartMs ?? 0) - (a.activeStartMs ?? 0);
  });

  return alerts;
}

function getOrStartAlertsRequest(): InFlightAlertsEntry {
  if (inFlightAlerts && !inFlightAlerts.controller.signal.aborted) {
    return inFlightAlerts;
  }

  const controller = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, REQUEST_TIMEOUT_MS);

  const entry: InFlightAlertsEntry = {
    promise: Promise.resolve({ alerts: [], updatedAt: 0 }),
    controller,
    subscribers: 0,
  };
  inFlightAlerts = entry;

  entry.promise = (async () => {
    try {
      const response = await fetch(ST_ALERTS_FEED_URL, { signal: controller.signal });
      if (!response.ok) {
        throw new Error(`Service alerts API returned HTTP ${response.status}`);
      }
      const data: RawGtfsAlertsFeed = await response.json();
      const now = Date.now();
      const feedTimestampMs = toEpochMs(data.header?.timestamp);
      const feed: ServiceAlertsFeed = {
        alerts: transformGtfsAlerts(data, now),
        updatedAt: feedTimestampMs ?? now,
      };
      cachedAlerts = { timestamp: now, feed };
      return feed;
    } catch (err) {
      if (timedOut) {
        throw new Error('Service alerts request timed out');
      }
      throw err;
    } finally {
      clearTimeout(timer);
      if (inFlightAlerts === entry) {
        inFlightAlerts = null;
      }
    }
  })();
  entry.promise.catch(() => undefined);

  return entry;
}

/**
 * Fetch active Sound Transit Link Light Rail service alerts with 25s TTL
 * caching, in-flight request deduplication, timeout, and caller abort support.
 */
export async function fetchServiceAlerts(
  bypassCache: boolean = false,
  signal?: AbortSignal
): Promise<ServiceAlertsFeed> {
  if (signal?.aborted) throw createAbortError();

  if (!bypassCache && cachedAlerts && Date.now() - cachedAlerts.timestamp < CACHE_TTL_MS) {
    return cachedAlerts.feed;
  }

  const entry = getOrStartAlertsRequest();
  entry.subscribers++;

  if (!signal) {
    try {
      return await entry.promise;
    } finally {
      entry.subscribers--;
    }
  }

  let subscriberReleased = false;
  const releaseSubscriber = () => {
    if (subscriberReleased) return;
    subscriberReleased = true;
    entry.subscribers--;
    if (signal.aborted && entry.subscribers === 0) {
      entry.controller.abort();
      if (inFlightAlerts === entry) {
        inFlightAlerts = null;
      }
    }
  };

  let onAbort!: () => void;
  const abortPromise = new Promise<never>((_, reject) => {
    onAbort = () => {
      releaseSubscriber();
      reject(createAbortError());
    };
    signal.addEventListener('abort', onAbort, { once: true });
  });

  try {
    return await Promise.race([entry.promise, abortPromise]);
  } finally {
    signal.removeEventListener('abort', onAbort);
    releaseSubscriber();
  }
}

export function clearAlertsCache(): void {
  cachedAlerts = null;
  if (inFlightAlerts) {
    inFlightAlerts.controller.abort();
    inFlightAlerts = null;
  }
}
