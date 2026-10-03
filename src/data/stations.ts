import { Station, TransitLineId } from '../types/transit';

export const STATIONS: Station[] = [
  // ==========================================
  // Line 1 Stations (North to South)
  // ==========================================
  {
    id: 'lynnwood-city-center',
    name: 'Lynnwood City Center',
    shortName: 'Park & Ride / Transit Center',
    lines: ['line-1'],
    platforms: {
      northbound: {
        stopId: '40_N23-T1',
        cardinalDirection: 'Northbound',
        terminalDestination: 'Lynnwood City Center',
      },
      southbound: {
        stopId: '40_N23-T2',
        cardinalDirection: 'Southbound',
        terminalDestination: 'Federal Way Downtown',
      },
    },
  },
  {
    id: 'mountlake-terrace',
    name: 'Mountlake Terrace',
    shortName: 'Park & Ride / Freeway Station',
    lines: ['line-1'],
    platforms: {
      northbound: {
        stopId: '40_N19-T1',
        cardinalDirection: 'Northbound',
        terminalDestination: 'Lynnwood City Center',
      },
      southbound: {
        stopId: '40_N19-T2',
        cardinalDirection: 'Southbound',
        terminalDestination: 'Federal Way Downtown',
      },
    },
  },
  {
    id: 'shoreline-north-185th',
    name: 'Shoreline North',
    shortName: 'Park & Ride / NE 185th St',
    lines: ['line-1'],
    platforms: {
      northbound: {
        stopId: '40_N17-T1',
        cardinalDirection: 'Northbound',
        terminalDestination: 'Lynnwood City Center',
      },
      southbound: {
        stopId: '40_N17-T2',
        cardinalDirection: 'Southbound',
        terminalDestination: 'Federal Way Downtown',
      },
    },
  },
  {
    id: 'shoreline-south-148th',
    name: 'Shoreline South',
    shortName: 'Park & Ride / NE 148th St',
    lines: ['line-1'],
    platforms: {
      northbound: {
        stopId: '40_N15-T1',
        cardinalDirection: 'Northbound',
        terminalDestination: 'Lynnwood City Center',
      },
      southbound: {
        stopId: '40_N15-T2',
        cardinalDirection: 'Southbound',
        terminalDestination: 'Federal Way Downtown',
      },
    },
  },
  {
    id: 'pinehurst',
    name: 'Pinehurst',
    shortName: 'NE 130th St / 5th Ave NE',
    address: '13110 5th Ave NE, Seattle, WA 98125',
    lines: ['line-1'],
    platforms: {
      northbound: {
        stopId: '40_N13-T1',
        cardinalDirection: 'Northbound',
        terminalDestination: 'Lynnwood City Center',
      },
      southbound: {
        stopId: '40_N13-T2',
        cardinalDirection: 'Southbound',
        terminalDestination: 'Federal Way Downtown',
      },
    },
  },
  {
    id: 'northgate',
    name: 'Northgate',
    shortName: 'Park & Ride / Kraken Iceplex',
    lines: ['line-1'],
    platforms: {
      northbound: {
        stopId: '40_990006',
        cardinalDirection: 'Northbound',
        terminalDestination: 'Lynnwood City Center',
      },
      southbound: {
        stopId: '40_990005',
        cardinalDirection: 'Southbound',
        terminalDestination: 'Federal Way Downtown',
      },
    },
  },
  {
    id: 'roosevelt',
    name: 'Roosevelt',
    shortName: 'Park & Ride / Roosevelt High',
    lines: ['line-1'],
    platforms: {
      northbound: {
        stopId: '40_990004',
        cardinalDirection: 'Northbound',
        terminalDestination: 'Lynnwood City Center',
      },
      southbound: {
        stopId: '40_990003',
        cardinalDirection: 'Southbound',
        terminalDestination: 'Federal Way Downtown',
      },
    },
  },
  {
    id: 'u-district',
    name: 'U District',
    shortName: 'UW Tower / The Ave',
    lines: ['line-1'],
    platforms: {
      northbound: {
        stopId: '40_990002',
        cardinalDirection: 'Northbound',
        terminalDestination: 'Lynnwood City Center',
      },
      southbound: {
        stopId: '40_990001',
        cardinalDirection: 'Southbound',
        terminalDestination: 'Federal Way Downtown',
      },
    },
  },
  {
    id: 'university-of-washington',
    name: 'University of Washington',
    shortName: 'Husky Stadium / UW Medical',
    lines: ['line-1'],
    platforms: {
      northbound: {
        stopId: '40_99605',
        cardinalDirection: 'Northbound',
        terminalDestination: 'Lynnwood City Center',
      },
      southbound: {
        stopId: '40_99604',
        cardinalDirection: 'Southbound',
        terminalDestination: 'Federal Way Downtown',
      },
    },
  },
  {
    id: 'capitol-hill',
    name: 'Capitol Hill',
    shortName: 'Broadway / First Hill Streetcar',
    lines: ['line-1'],
    platforms: {
      northbound: {
        stopId: '40_99603',
        cardinalDirection: 'Northbound',
        terminalDestination: 'Lynnwood City Center',
      },
      southbound: {
        stopId: '40_99610',
        cardinalDirection: 'Southbound',
        terminalDestination: 'Federal Way Downtown',
      },
    },
  },
  {
    id: 'westlake',
    name: 'Westlake',
    shortName: 'Seattle Center Monorail / Pine St',
    lines: ['line-1'],
    platforms: {
      northbound: {
        stopId: '40_1121',
        cardinalDirection: 'Northbound',
        terminalDestination: 'Lynnwood City Center',
      },
      southbound: {
        stopId: '40_1108',
        cardinalDirection: 'Southbound',
        terminalDestination: 'Federal Way Downtown',
      },
    },
  },
  {
    id: 'symphony',
    name: 'Symphony',
    shortName: 'Benaroya Hall / University St',
    lines: ['line-1'],
    platforms: {
      northbound: {
        stopId: '40_565',
        cardinalDirection: 'Northbound',
        terminalDestination: 'Lynnwood City Center',
      },
      southbound: {
        stopId: '40_455',
        cardinalDirection: 'Southbound',
        terminalDestination: 'Federal Way Downtown',
      },
    },
  },
  {
    id: 'pioneer-square',
    name: 'Pioneer Square',
    shortName: 'WA State Ferries / Streetcar',
    lines: ['line-1'],
    platforms: {
      northbound: {
        stopId: '40_532',
        cardinalDirection: 'Northbound',
        terminalDestination: 'Lynnwood City Center',
      },
      southbound: {
        stopId: '40_501',
        cardinalDirection: 'Southbound',
        terminalDestination: 'Federal Way Downtown',
      },
    },
  },
  {
    id: 'international-district-chinatown',
    name: 'Intl. District / Chinatown',
    shortName: '1 Line ⇄ 2 Line Transfer Hub',
    lines: ['line-1'],
    platforms: {
      northbound: {
        stopId: '40_621',
        cardinalDirection: 'Northbound',
        terminalDestination: 'Lynnwood City Center',
      },
      southbound: {
        stopId: '40_623',
        cardinalDirection: 'Southbound',
        terminalDestination: 'Federal Way Downtown',
      },
    },
  },
  {
    id: 'stadium',
    name: 'Stadium',
    shortName: 'Lumen Field / T-Mobile Park',
    lines: ['line-1'],
    platforms: {
      northbound: {
        stopId: '40_99260',
        cardinalDirection: 'Northbound',
        terminalDestination: 'Lynnwood City Center',
      },
      southbound: {
        stopId: '40_99101',
        cardinalDirection: 'Southbound',
        terminalDestination: 'Federal Way Downtown',
      },
    },
  },
  {
    id: 'sodo',
    name: 'SODO',
    shortName: 'SODO Busway / Industrial District',
    lines: ['line-1'],
    platforms: {
      northbound: {
        stopId: '40_99256',
        cardinalDirection: 'Northbound',
        terminalDestination: 'Lynnwood City Center',
      },
      southbound: {
        stopId: '40_99111',
        cardinalDirection: 'Southbound',
        terminalDestination: 'Federal Way Downtown',
      },
    },
  },
  {
    id: 'beacon-hill',
    name: 'Beacon Hill',
    shortName: 'Tunnel Station / El Centro',
    lines: ['line-1'],
    platforms: {
      northbound: {
        stopId: '40_99240',
        cardinalDirection: 'Northbound',
        terminalDestination: 'Lynnwood City Center',
      },
      southbound: {
        stopId: '40_99121',
        cardinalDirection: 'Southbound',
        terminalDestination: 'Federal Way Downtown',
      },
    },
  },
  {
    id: 'mount-baker',
    name: 'Mount Baker',
    shortName: 'Transit Center / Franklin High',
    lines: ['line-1'],
    platforms: {
      northbound: {
        stopId: '40_55860',
        cardinalDirection: 'Northbound',
        terminalDestination: 'Lynnwood City Center',
      },
      southbound: {
        stopId: '40_55949',
        cardinalDirection: 'Southbound',
        terminalDestination: 'Federal Way Downtown',
      },
    },
  },
  {
    id: 'columbia-city',
    name: 'Columbia City',
    shortName: 'Historic District / Rainier Ave',
    lines: ['line-1'],
    platforms: {
      northbound: {
        stopId: '40_55778',
        cardinalDirection: 'Northbound',
        terminalDestination: 'Lynnwood City Center',
      },
      southbound: {
        stopId: '40_56039',
        cardinalDirection: 'Southbound',
        terminalDestination: 'Federal Way Downtown',
      },
    },
  },
  {
    id: 'othello',
    name: 'Othello',
    shortName: 'Rainier Valley / Othello Park',
    lines: ['line-1'],
    platforms: {
      northbound: {
        stopId: '40_55656',
        cardinalDirection: 'Northbound',
        terminalDestination: 'Lynnwood City Center',
      },
      southbound: {
        stopId: '40_56159',
        cardinalDirection: 'Southbound',
        terminalDestination: 'Federal Way Downtown',
      },
    },
  },
  {
    id: 'rainier-beach',
    name: 'Rainier Beach',
    shortName: 'Rainier Beach / Chief Sealth Trail',
    lines: ['line-1'],
    platforms: {
      northbound: {
        stopId: '40_55578',
        cardinalDirection: 'Northbound',
        terminalDestination: 'Lynnwood City Center',
      },
      southbound: {
        stopId: '40_56173',
        cardinalDirection: 'Southbound',
        terminalDestination: 'Federal Way Downtown',
      },
    },
  },
  {
    id: 'tukwila-intl-blvd',
    name: 'Tukwila Intl. Blvd.',
    shortName: 'Park & Ride / RapidRide A',
    lines: ['line-1'],
    platforms: {
      northbound: {
        stopId: '40_99900',
        cardinalDirection: 'Northbound',
        terminalDestination: 'Lynnwood City Center',
      },
      southbound: {
        stopId: '40_99905',
        cardinalDirection: 'Southbound',
        terminalDestination: 'Federal Way Downtown',
      },
    },
  },
  {
    id: 'seatac-airport',
    name: 'SeaTac / Airport',
    shortName: "Seattle-Tacoma Int'l Airport",
    lines: ['line-1'],
    platforms: {
      northbound: {
        stopId: '40_99903',
        cardinalDirection: 'Northbound',
        terminalDestination: 'Lynnwood City Center',
      },
      southbound: {
        stopId: '40_99904',
        cardinalDirection: 'Southbound',
        terminalDestination: 'Federal Way Downtown',
      },
    },
  },
  {
    id: 'angle-lake',
    name: 'Angle Lake',
    shortName: 'Park & Ride / S 200th St',
    lines: ['line-1'],
    platforms: {
      northbound: {
        stopId: '40_99913',
        cardinalDirection: 'Northbound',
        terminalDestination: 'Lynnwood City Center',
      },
      southbound: {
        stopId: '40_99914',
        cardinalDirection: 'Southbound',
        terminalDestination: 'Federal Way Downtown',
      },
    },
  },
  {
    id: 'kent-des-moines',
    name: 'Kent Des Moines',
    shortName: 'Highline College / Park & Ride',
    lines: ['line-1'],
    platforms: {
      northbound: {
        stopId: '40_S03-T1',
        cardinalDirection: 'Northbound',
        terminalDestination: 'Lynnwood City Center',
      },
      southbound: {
        stopId: '40_S03-T2',
        cardinalDirection: 'Southbound',
        terminalDestination: 'Federal Way Downtown',
      },
    },
  },
  {
    id: 'star-lake',
    name: 'Star Lake',
    shortName: 'Park & Ride / S 272nd St',
    lines: ['line-1'],
    platforms: {
      northbound: {
        stopId: '40_S05-T1',
        cardinalDirection: 'Northbound',
        terminalDestination: 'Lynnwood City Center',
      },
      southbound: {
        stopId: '40_S05-T2',
        cardinalDirection: 'Southbound',
        terminalDestination: 'Federal Way Downtown',
      },
    },
  },
  {
    id: 'federal-way-downtown',
    name: 'Federal Way Downtown',
    shortName: 'Park & Ride / Transit Center',
    lines: ['line-1'],
    platforms: {
      northbound: {
        stopId: '40_S07-T1',
        cardinalDirection: 'Northbound',
        terminalDestination: 'Lynnwood City Center',
      },
      southbound: {
        stopId: '40_S07-T2',
        cardinalDirection: 'Southbound',
        terminalDestination: 'Federal Way Downtown',
      },
    },
  },

  // ==========================================
  // Line 2 Stations (North to South / East to West)
  // ==========================================
  {
    id: 'downtown-redmond',
    name: 'Downtown Redmond',
    shortName: 'Redmond Town Center',
    lines: ['line-2'],
    platforms: {
      eastbound: {
        stopId: '40_E31-T2',
        cardinalDirection: 'Eastbound',
        terminalDestination: 'Downtown Redmond',
      },
      westbound: {
        stopId: '40_E31-T1',
        cardinalDirection: 'Westbound',
        terminalDestination: 'Lynnwood City Center',
      },
    },
  },
  {
    id: 'marymoor-village',
    name: 'Marymoor Village',
    shortName: 'Park & Ride / Marymoor Park',
    lines: ['line-2'],
    platforms: {
      eastbound: {
        stopId: '40_E29-T2',
        cardinalDirection: 'Eastbound',
        terminalDestination: 'Downtown Redmond',
      },
      westbound: {
        stopId: '40_E29-T1',
        cardinalDirection: 'Westbound',
        terminalDestination: 'Lynnwood City Center',
      },
    },
  },
  {
    id: 'redmond-technology',
    name: 'Redmond Technology',
    shortName: 'Microsoft Campus / Transit Center',
    lines: ['line-2'],
    platforms: {
      eastbound: {
        stopId: '40_E27-T2',
        cardinalDirection: 'Eastbound',
        terminalDestination: 'Downtown Redmond',
      },
      westbound: {
        stopId: '40_E27-T1',
        cardinalDirection: 'Westbound',
        terminalDestination: 'Lynnwood City Center',
      },
    },
  },
  {
    id: 'overlake-village',
    name: 'Overlake Village',
    shortName: '152nd Ave NE / Overlake Village',
    lines: ['line-2'],
    platforms: {
      eastbound: {
        stopId: '40_E25-T2',
        cardinalDirection: 'Eastbound',
        terminalDestination: 'Downtown Redmond',
      },
      westbound: {
        stopId: '40_E25-T1',
        cardinalDirection: 'Westbound',
        terminalDestination: 'Lynnwood City Center',
      },
    },
  },
  {
    id: 'bel-red',
    name: 'BelRed',
    shortName: 'Park & Ride / 130th Station',
    lines: ['line-2'],
    platforms: {
      eastbound: {
        stopId: '40_E23-T2',
        cardinalDirection: 'Eastbound',
        terminalDestination: 'Downtown Redmond',
      },
      westbound: {
        stopId: '40_E23-T1',
        cardinalDirection: 'Westbound',
        terminalDestination: 'Lynnwood City Center',
      },
    },
  },
  {
    id: 'spring-district',
    name: 'Spring District',
    shortName: '120th Station / Spring District',
    lines: ['line-2'],
    platforms: {
      eastbound: {
        stopId: '40_E21-T2',
        cardinalDirection: 'Eastbound',
        terminalDestination: 'Downtown Redmond',
      },
      westbound: {
        stopId: '40_E21-T1',
        cardinalDirection: 'Westbound',
        terminalDestination: 'Lynnwood City Center',
      },
    },
  },
  {
    id: 'wilburton',
    name: 'Wilburton',
    shortName: 'Overlake Medical Center',
    lines: ['line-2'],
    platforms: {
      eastbound: {
        stopId: '40_E19-T1',
        cardinalDirection: 'Eastbound',
        terminalDestination: 'Downtown Redmond',
      },
      westbound: {
        stopId: '40_E19-T2',
        cardinalDirection: 'Westbound',
        terminalDestination: 'Lynnwood City Center',
      },
    },
  },
  {
    id: 'bellevue-downtown',
    name: 'Bellevue Downtown',
    shortName: 'Bellevue Transit Center',
    lines: ['line-2'],
    platforms: {
      eastbound: {
        stopId: '40_E15-T2',
        cardinalDirection: 'Eastbound',
        terminalDestination: 'Downtown Redmond',
      },
      westbound: {
        stopId: '40_E15-T1',
        cardinalDirection: 'Westbound',
        terminalDestination: 'Lynnwood City Center',
      },
    },
  },
  {
    id: 'east-main',
    name: 'East Main',
    shortName: 'Surrey Downs / 112th Ave SE',
    lines: ['line-2'],
    platforms: {
      eastbound: {
        stopId: '40_E11-T1',
        cardinalDirection: 'Eastbound',
        terminalDestination: 'Downtown Redmond',
      },
      westbound: {
        stopId: '40_E11-T2',
        cardinalDirection: 'Westbound',
        terminalDestination: 'Lynnwood City Center',
      },
    },
  },
  {
    id: 'south-bellevue',
    name: 'South Bellevue',
    shortName: 'Park & Ride / Mercer Slough',
    lines: ['line-2'],
    platforms: {
      eastbound: {
        stopId: '40_E09-T1',
        cardinalDirection: 'Eastbound',
        terminalDestination: 'Downtown Redmond',
      },
      westbound: {
        stopId: '40_E09-T2',
        cardinalDirection: 'Westbound',
        terminalDestination: 'Lynnwood City Center',
      },
    },
  },
  {
    id: 'mercer-island',
    name: 'Mercer Island',
    shortName: 'Park & Ride / I-90 Trail',
    lines: ['line-2'],
    platforms: {
      eastbound: {
        stopId: '40_E07-T1',
        cardinalDirection: 'Eastbound',
        terminalDestination: 'Downtown Redmond',
      },
      westbound: {
        stopId: '40_E07-T2',
        cardinalDirection: 'Westbound',
        terminalDestination: 'Lynnwood City Center',
      },
    },
  },
  {
    id: 'judkins-park',
    name: 'Judkins Park',
    shortName: 'Rainier Ave S / I-90 Trail',
    lines: ['line-2'],
    platforms: {
      eastbound: {
        stopId: '40_E05-T1',
        cardinalDirection: 'Eastbound',
        terminalDestination: 'Downtown Redmond',
      },
      westbound: {
        stopId: '40_E05-T2',
        cardinalDirection: 'Westbound',
        terminalDestination: 'Lynnwood City Center',
      },
    },
  },
];

// Pre-computed lookup maps (static data, computed once at module load)
const stationMap = new Map<string, Station>(STATIONS.map(s => [s.id, s]));
const lineStationsMap = new Map<TransitLineId, Station[]>(
  (['line-1', 'line-2'] as TransitLineId[]).map(line => [
    line,
    STATIONS.filter(s => s.lines.includes(line)),
  ])
);

export function getStationsByLine(lineId: TransitLineId): Station[] {
  return lineStationsMap.get(lineId) || [];
}

export function getStationById(id: string): Station | undefined {
  return stationMap.get(id);
}

export const LINE_CONFIG = {
  'line-1': {
    name: '1 Line',
    terminusNorth: 'Lynnwood City Center',
    terminusSouth: 'Federal Way Downtown',
  },
  'line-2': {
    name: '2 Line',
    terminusNorth: 'Lynnwood City Center',
    terminusSouth: 'Downtown Redmond',
  },
};

