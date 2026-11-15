import type {
  AlertSeverity,
  ServiceAlert,
  ServiceAlertsFeed,
  TransitLineId,
} from '../types/transit';

export const ST_ALERTS_FEED_URL =
  'https://s3.amazonaws.com/st-service-alerts-prod/alerts_pb.json';
export const ST_ALERTS_WEB_URL =
  'https://www.soundtransit.org/ride-with-us/service-alerts';

const CACHE_TTL_MS = 25 * 1000;
const REQUEST_TIMEOUT_MS = 6000;

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

export interface RawTranslatedTextEntry {
  text?: string;
  language?: string;
}

export interface RawTranslatedText {
  translation?: RawTranslatedTextEntry[];
}

export interface RawActivePeriod {
  start?: number | string;
  end?: number | string;
}

export interface RawInformedEntity {
  route_id?: string;
  stop_id?: string;
  agency_id?: string;
}

export interface RawGtfsAlert {
  active_period?: RawActivePeriod[];
  informed_entity?: RawInformedEntity[];
  cause?: string;
  effect?: string;
  severity_level?: string;
  url?: RawTranslatedText;
  header_text?: RawTranslatedText;
  description_text?: RawTranslatedText;
}

export interface RawGtfsAlertEntity {
  id?: string;
  alert?: RawGtfsAlert;
}

export interface RawGtfsAlertsFeed {
  header?: {
    gtfs_realtime_version?: string;
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

    const rawUrl = extractTranslatedText(alert.url);
    alerts.push({
      id: entity.id?.trim() || `alert-${i}`,
      severity: normalizeSeverity(alert.severity_level),
      effect: normalizeText(alert.effect ?? ''),
      cause: normalizeText(alert.cause ?? ''),
      lines,
      header: extractTranslatedText(alert.header_text),
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
