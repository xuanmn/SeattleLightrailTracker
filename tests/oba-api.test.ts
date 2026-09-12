import { describe, it, expect } from 'vitest';
import { transformObaArrivals } from '../src/services/oba-api';
import { StationPlatform } from '../src/types/transit';

describe('OneBusAway API Transformer', () => {
  const mockPlatform: StationPlatform = {
    stopId: '1_99611',
    directionName: 'Northbound to Lynnwood City Center',
    cardinalDirection: 'Northbound',
    terminalDestination: 'Lynnwood City Center',
  };

  it('transforms raw OneBusAway JSON into typed TransitArrival items', () => {
    const now = 1700000000000;
    const rawData = {
      code: 200,
      text: 'OK',
      data: {
        entry: {
          stopId: '1_99611',
          arrivalsAndDepartures: [
            {
              tripId: '40_trip_01',
              routeId: '40_100479',
              routeShortName: '1 Line',
              tripHeadsign: 'Lynnwood City Center',
              scheduledDepartureTime: now + 5 * 60 * 1000,
              predictedDepartureTime: now + 6 * 60 * 1000, // 1 min late
              predicted: true,
            },
            {
              tripId: '40_trip_02',
              routeId: '40_100479',
              routeShortName: '1 Line',
              tripHeadsign: 'Lynnwood City Center',
              scheduledDepartureTime: now + 15 * 60 * 1000,
              predictedDepartureTime: null, // Scheduled only
              predicted: false,
            },
          ],
        },
      },
    };

    const arrivals = transformObaArrivals(rawData, mockPlatform, now);
    expect(arrivals.length).toBe(2);

    // First arrival (realtime)
    expect(arrivals[0].tripId).toBe('40_trip_01');
    expect(arrivals[0].destination).toBe('Lynnwood City Center');
    expect(arrivals[0].isRealtime).toBe(true);
    expect(arrivals[0].delaySeconds).toBe(60); // 1 minute late
    expect(arrivals[0].statusType).toBe('delayed');
    expect(arrivals[0].minutesUntilArrival).toBe(6);

    // Second arrival (scheduled)
    expect(arrivals[1].tripId).toBe('40_trip_02');
    expect(arrivals[1].isRealtime).toBe(false);
    expect(arrivals[1].statusType).toBe('scheduled');
    expect(arrivals[1].minutesUntilArrival).toBe(15);
  });

  it('filters out past arrivals and limits result size', () => {
    const now = 1700000000000;
    const rawData = {
      code: 200,
      data: {
        entry: {
          stopId: '1_99611',
          arrivalsAndDepartures: [
            {
              tripId: '40_past_trip',
              routeId: '40_100479',
              routeShortName: '1 Line',
              tripHeadsign: 'Lynnwood City Center',
              scheduledDepartureTime: now - 5 * 60 * 1000, // 5 min ago
              predictedDepartureTime: now - 3 * 60 * 1000,
              predicted: true,
            },
            {
              tripId: '40_upcoming_trip',
              routeId: '40_100479',
              routeShortName: '1 Line',
              tripHeadsign: 'Lynnwood City Center',
              scheduledDepartureTime: now + 4 * 60 * 1000,
              predictedDepartureTime: now + 4 * 60 * 1000,
              predicted: true,
            },
          ],
        },
      },
    };

    const arrivals = transformObaArrivals(rawData, mockPlatform, now);
    expect(arrivals.length).toBe(1);
    expect(arrivals[0].tripId).toBe('40_upcoming_trip');
  });

  it('transforms 2 Line arrivals with correct route styling and direction', () => {
    const mockLine2Platform: StationPlatform = {
      stopId: '40_E03-T1',
      directionName: 'Eastbound to Downtown Redmond',
      cardinalDirection: 'Eastbound',
      terminalDestination: 'Downtown Redmond',
    };

    const now = 1700000000000;
    const rawData = {
      code: 200,
      data: {
        entry: {
          stopId: '40_E03-T1',
          arrivalsAndDepartures: [
            {
              tripId: '40_2line_01',
              routeId: '40_2_LINE',
              routeShortName: '2 Line',
              tripHeadsign: 'Downtown Redmond',
              scheduledDepartureTime: now + 8 * 60 * 1000,
              predictedDepartureTime: now + 8 * 60 * 1000,
              predicted: true,
            },
          ],
        },
      },
    };

    const arrivals = transformObaArrivals(rawData, mockLine2Platform, now);
    expect(arrivals.length).toBe(1);
    expect(arrivals[0].routeName).toBe('2 Line');
    expect(arrivals[0].routeColor).toBe('#0072CE');
    expect(arrivals[0].direction).toBe('Eastbound');
    expect(arrivals[0].destination).toBe('Downtown Redmond');
  });

  it('handles terminus arrivals when departureEnabled is false and predictedDepartureTime is midnight sentinel', () => {
    const mockTerminusPlatform: StationPlatform = {
      stopId: '40_N23-T1',
      directionName: 'Northbound Platform (Terminus)',
      cardinalDirection: 'Northbound',
      terminalDestination: 'Lynnwood City Center',
    };

    const now = 1700000000000;
    const rawData = {
      code: 200,
      data: {
        entry: {
          stopId: '40_N23-T1',
          arrivalsAndDepartures: [
            {
              tripId: '40_terminus_01',
              routeId: '40_100479',
              routeShortName: '1 Line',
              tripHeadsign: 'Lynnwood City Center',
              arrivalEnabled: true,
              departureEnabled: false,
              scheduledArrivalTime: now + 5 * 60 * 1000, // 5 min
              predictedArrivalTime: now + 6 * 60 * 1000, // 6 min
              scheduledDepartureTime: now + 5 * 60 * 1000,
              predictedDepartureTime: now + 6 * 3600 * 1000, // 6 hours away midnight sentinel!
              predicted: true,
            },
            {
              tripId: '40_terminus_02',
              routeId: '40_2LINE',
              routeShortName: '2 Line',
              tripHeadsign: 'Lynnwood City Center',
              arrivalEnabled: true,
              departureEnabled: false,
              scheduledArrivalTime: now + 9 * 60 * 1000, // 9 min
              predictedArrivalTime: now + 9 * 60 * 1000,
              scheduledDepartureTime: now + 9 * 60 * 1000,
              predictedDepartureTime: 0,
              predicted: true,
            },
          ],
        },
      },
    };

    const arrivals = transformObaArrivals(rawData, mockTerminusPlatform, now);
    expect(arrivals.length).toBe(2);

    // Trip 1 should use predictedArrivalTime (6 min), NOT the 6-hour sentinel!
    expect(arrivals[0].tripId).toBe('40_terminus_01');
    expect(arrivals[0].minutesUntilArrival).toBe(6);
    expect(arrivals[0].isRealtime).toBe(true);
    expect(arrivals[0].predictedDepartureTime).toBe(now + 6 * 60 * 1000);

    // Trip 2 should use predictedArrivalTime (9 min)
    expect(arrivals[1].tripId).toBe('40_terminus_02');
    expect(arrivals[1].minutesUntilArrival).toBe(9);
    expect(arrivals[1].isRealtime).toBe(true);
    expect(arrivals[1].routeName).toBe('2 Line');
  });
});

describe('OneBusAway Stop Arrival Caching & In-Memory TTL', () => {
  const testStation = {
    id: 'westlake',
    name: 'Westlake',
    lines: ['line-1' as const, 'line-2' as const],
    platforms: {
      northbound: {
        stopId: '40_1121',
        directionName: 'Northbound',
        cardinalDirection: 'Northbound' as const,
        terminalDestination: 'Lynnwood City Center',
      },
      southbound: {
        stopId: '40_1108',
        directionName: 'Southbound',
        cardinalDirection: 'Southbound' as const,
        terminalDestination: 'Federal Way Downtown',
      },
    },
  };

  it('populates and reuses in-memory cache for consecutive station arrival requests', async () => {
    const { clearArrivalsCache, getArrivalsCacheSize, fetchArrivalsForStation } = await import(
      '../src/services/oba-api'
    );
    clearArrivalsCache();
    expect(getArrivalsCacheSize()).toBe(0);

    const first = await fetchArrivalsForStation(testStation);
    expect(getArrivalsCacheSize()).toBe(2); // 2 platforms cached

    const second = await fetchArrivalsForStation(testStation);
    expect(second.direction1.arrivals.length).toBe(first.direction1.arrivals.length);
    expect(second.direction2.arrivals.length).toBe(first.direction2.arrivals.length);

    // Trip IDs should match cached results
    expect(second.direction1.arrivals[0].tripId).toBe(first.direction1.arrivals[0].tripId);
  });

  it('bypasses cache when bypassCache parameter is true', async () => {
    const { clearArrivalsCache, fetchArrivalsForStation } = await import('../src/services/oba-api');
    clearArrivalsCache();

    const first = await fetchArrivalsForStation(testStation);
    const forced = await fetchArrivalsForStation(testStation, undefined, true);
    expect(forced.direction1.arrivals.length).toBeGreaterThan(0);
    expect(first.direction1.arrivals.length).toBeGreaterThan(0);
  });

  it('clears cache entries when clearArrivalsCache is invoked', async () => {
    const { clearArrivalsCache, getArrivalsCacheSize, fetchArrivalsForStation } = await import(
      '../src/services/oba-api'
    );
    await fetchArrivalsForStation(testStation);
    expect(getArrivalsCacheSize()).toBeGreaterThan(0);

    clearArrivalsCache();
    expect(getArrivalsCacheSize()).toBe(0);
  });
});

