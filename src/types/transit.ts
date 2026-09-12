export type TransitLineId = 'line-1' | 'line-2';

export interface StationPlatform {
  stopId: string;       // OneBusAway stop ID, e.g. "1_99611" or "40_99611"
  directionName: string; // "Northbound to Lynnwood City Center", "Southbound to Angle Lake"
  cardinalDirection: 'Northbound' | 'Southbound' | 'Eastbound' | 'Westbound';
  terminalDestination: string; // e.g. "Lynnwood City Center", "Angle Lake", "Downtown Redmond"
}

export interface Station {
  id: string;             // Unique slug e.g. "capitol-hill"
  name: string;           // "Capitol Hill"
  shortName?: string;     // Optional abbreviated name
  lines: TransitLineId[]; // ['line-1']
  platforms: {
    northbound?: StationPlatform;
    southbound?: StationPlatform;
    eastbound?: StationPlatform;
    westbound?: StationPlatform;
  };
}

export interface TransitArrival {
  tripId: string;
  routeId: string;
  routeName: string;           // "1 Line" or "2 Line"
  routeColor: string;          // "#008542" (1 Line) or "#0072CE" (2 Line)
  destination: string;         // e.g. "Angle Lake"
  direction: 'Northbound' | 'Southbound' | 'Eastbound' | 'Westbound';
  scheduledDepartureTime: number; // Unix timestamp in ms
  predictedDepartureTime: number | null; // Unix timestamp in ms
  minutesUntilArrival: number; // Derived countdown
  isRealtime: boolean;         // True if live GPS tracking available
  delaySeconds: number;        // Real-time delay (>0 late, <0 early, 0 on-time)
  statusText: string;          // "On Time", "+2m Delay", "Early", "Scheduled"
  statusType: 'ontime' | 'delayed' | 'delayed-severe' | 'early' | 'scheduled';
}

export interface StationArrivals {
  station: Station;
  lastUpdated: number;
  direction1: {
    platform: StationPlatform;
    arrivals: TransitArrival[];
  };
  direction2: {
    platform: StationPlatform;
    arrivals: TransitArrival[];
  };
}

export interface AppSettings {
  timeFormat24Hour: boolean;
}
