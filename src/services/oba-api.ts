import { Station, StationPlatform, TransitArrival } from '../types/transit';
import { formatDelayStatus } from '../utils/time';

const OBA_BASE = 'https://api.pugetsound.onebusaway.org/api/where';
const OBA_KEY = '5654bb33-edab-4322-8688-94b9d262abe4'; // Sound Transit official public client key

interface RawObaArrival {
  tripId: string;
  routeId: string;
  routeShortName?: string;
  routeLongName?: string;
  tripHeadsign: string;
  scheduledDepartureTime?: number; // ms
  predictedDepartureTime?: number | null; // ms
  scheduledArrivalTime?: number; // ms
  predictedArrivalTime?: number | null; // ms
  arrivalEnabled?: boolean;
  departureEnabled?: boolean;
  predicted?: boolean;
  status?: string;
}

interface RawObaResponse {
  code: number;
  text?: string;
  data?: {
    entry?: {
      stopId: string;
      arrivalsAndDepartures?: RawObaArrival[];
    };
  };
}

export function transformObaArrivals(
  raw: RawObaResponse,
  platform: StationPlatform,
  nowEpochMs: number = Date.now(),
  limit: number = 4
): TransitArrival[] {
  const items = raw.data?.entry?.arrivalsAndDepartures || [];

  const results: TransitArrival[] = [];

  for (const item of items) {
    const isTerminusArrival = item.departureEnabled === false;
    const schedArr = item.scheduledArrivalTime || 0;
    const schedDep = item.scheduledDepartureTime || 0;
    const predArr = item.predictedArrivalTime && item.predictedArrivalTime > 0 ? item.predictedArrivalTime : null;

    // Detect midnight / sentinel departure timestamp (e.g., set to 11:59:59 PM for terminating trips)
    const rawPredDep = item.predictedDepartureTime && item.predictedDepartureTime > 0 ? item.predictedDepartureTime : null;
    const isSentinelDep = Boolean(
      rawPredDep &&
      rawPredDep - nowEpochMs > 3 * 3600 * 1000 &&
      predArr &&
      predArr - nowEpochMs < 2 * 3600 * 1000
    );
    const predDep = isSentinelDep ? null : rawPredDep;

    let targetTime: number;
    let schedTime: number;
    let isRealtime = false;

    if (isTerminusArrival) {
      schedTime = schedArr || schedDep;
      if (item.predicted && predArr) {
        targetTime = predArr;
        isRealtime = true;
      } else if (item.predicted && predDep) {
        targetTime = predDep;
        isRealtime = true;
      } else {
        targetTime = schedTime;
      }
    } else {
      schedTime = schedDep || schedArr;
      if (item.predicted && predDep) {
        targetTime = predDep;
        isRealtime = true;
      } else if (item.predicted && predArr) {
        targetTime = predArr;
        isRealtime = true;
      } else {
        targetTime = schedTime;
      }
    }

    // Filter out trips that left/arrived more than 60 seconds ago
    if (targetTime < nowEpochMs - 60 * 1000) {
      continue;
    }

    const delaySeconds = isRealtime && schedTime > 0
      ? Math.round((targetTime - schedTime) / 1000)
      : 0;

    const delayInfo = formatDelayStatus(delaySeconds, isRealtime);

    const rawRoute = item.routeShortName || item.routeLongName || '';
    const headsign = item.tripHeadsign || platform.terminalDestination;
    const isLine2 =
      rawRoute.includes('2') ||
      headsign.includes('Redmond') ||
      headsign.includes('Bellevue') ||
      platform.cardinalDirection === 'Eastbound' ||
      platform.cardinalDirection === 'Westbound';

    results.push({
      tripId: item.tripId || `trip_${targetTime}`,
      routeName: isLine2 ? '2 Line' : '1 Line',
      destination: headsign,
      direction: platform.cardinalDirection,
      scheduledDepartureTime: schedTime,
      predictedDepartureTime: isRealtime ? targetTime : null,
      isRealtime,
      delaySeconds,
      statusText: delayInfo.text,
      statusType: delayInfo.type,
    });
  }

  // Sort chronologically
  results.sort((a, b) => {
    const timeA = a.predictedDepartureTime || a.scheduledDepartureTime;
    const timeB = b.predictedDepartureTime || b.scheduledDepartureTime;
    return timeA - timeB;
  });

  return results.slice(0, limit);
}

/**
 * In-Memory Stop Arrival Cache
 * Caches arrival predictions per stopId with a short TTL (25s) to eliminate redundant
 * network requests across shared 1 Line & 2 Line platforms and fast view toggles.
 * Keyed by stopId, so size is naturally bounded by the number of platforms.
 * Only successful API responses are cached — failures and aborts never are.
 */
interface CacheEntry {
  timestamp: number;
  arrivals: TransitArrival[];
}

const stopArrivalsCache = new Map<string, CacheEntry>();
const CACHE_TTL_MS = 25 * 1000;
const REQUEST_TIMEOUT_MS = 6000;

/**
 * Clear the in-memory arrivals cache (useful on manual refresh or test resets)
 */
export function clearArrivalsCache(): void {
  stopArrivalsCache.clear();
}

/**
 * Fetch live departures for a single stop ID with TTL caching and a request timeout.
 * Rejects on network/HTTP errors, timeouts, and aborts.
 */
async function fetchArrivalsForStop(
  platform: StationPlatform,
  bypassCache: boolean,
  signal?: AbortSignal
): Promise<TransitArrival[]> {
  const now = Date.now();

  if (!bypassCache) {
    const cached = stopArrivalsCache.get(platform.stopId);
    if (cached && now - cached.timestamp < CACHE_TTL_MS) {
      return cached.arrivals;
    }
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  const onParentAbort = () => controller.abort();

  // If caller provided an abort signal, abort our controller if parent signal aborts
  if (signal) {
    if (signal.aborted) {
      controller.abort();
    } else {
      signal.addEventListener('abort', onParentAbort, { once: true });
    }
  }

  const url = `${OBA_BASE}/arrivals-and-departures-for-stop/${platform.stopId}.json?key=${encodeURIComponent(
    OBA_KEY
  )}&minutesBefore=5&minutesAfter=75`;

  try {
    const response = await fetch(url, { signal: controller.signal });

    if (!response.ok) {
      throw new Error(`API returned HTTP ${response.status}`);
    }

    const data: RawObaResponse = await response.json();
    const arrivals = transformObaArrivals(data, platform, now);
    stopArrivalsCache.set(platform.stopId, { timestamp: now, arrivals });
    return arrivals;
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', onParentAbort);
  }
}

/**
 * Fetch live departures for both directions of a Station with caching support
 */
export async function fetchArrivalsForStation(
  station: Station,
  bypassCache: boolean = false,
  signal?: AbortSignal
): Promise<{
  direction1: { platform: StationPlatform; arrivals: TransitArrival[] };
  direction2: { platform: StationPlatform; arrivals: TransitArrival[] };
}> {
  const p1 = station.platforms.northbound || station.platforms.eastbound;
  const p2 = station.platforms.southbound || station.platforms.westbound;

  if (!p1 || !p2) {
    throw new Error(`Station ${station.name} missing platform definitions`);
  }

  const [arr1, arr2] = await Promise.all([
    fetchArrivalsForStop(p1, bypassCache, signal),
    fetchArrivalsForStop(p2, bypassCache, signal),
  ]);

  return {
    direction1: { platform: p1, arrivals: arr1 },
    direction2: { platform: p2, arrivals: arr2 },
  };
}
