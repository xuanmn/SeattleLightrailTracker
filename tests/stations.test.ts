import { describe, it, expect } from 'vitest';
import { getStationsByLine, getStationById } from '../src/data/stations';

describe('Station Catalog', () => {
  it('should include all 27 Line 1 stations', () => {
    const line1Stations = getStationsByLine('line-1');
    expect(line1Stations.length).toBe(27);

    // Verify key terminal & extension stations
    const lynnwood = line1Stations.find(s => s.id === 'lynnwood-city-center');
    expect(lynnwood).toBeDefined();
    expect(lynnwood?.name).toBe('Lynnwood City Center');
    expect(lynnwood?.platforms.northbound).toBeDefined();
    expect(lynnwood?.platforms.southbound).toBeDefined();

    const pinehurst = line1Stations.find(s => s.id === 'pinehurst');
    expect(pinehurst).toBeDefined();
    expect(pinehurst?.name).toBe('Pinehurst');
    expect(pinehurst?.shortName).toBe('NE 130th St / 5th Ave NE');
    expect(pinehurst?.address).toBe('13110 5th Ave NE, Seattle, WA 98125');
    expect(pinehurst?.platforms.northbound?.stopId).toBe('40_N13-T1');
    expect(pinehurst?.platforms.southbound?.stopId).toBe('40_N13-T2');

    // Verify ordering between Shoreline South and Northgate
    const shorelineIndex = line1Stations.findIndex(s => s.id === 'shoreline-south-148th');
    const pinehurstIndex = line1Stations.findIndex(s => s.id === 'pinehurst');
    const northgateIndex = line1Stations.findIndex(s => s.id === 'northgate');
    expect(pinehurstIndex).toBe(shorelineIndex + 1);
    expect(northgateIndex).toBe(pinehurstIndex + 1);

    const angleLake = line1Stations.find(s => s.id === 'angle-lake');
    expect(angleLake).toBeDefined();
    expect(angleLake?.name).toBe('Angle Lake');

    const federalWay = line1Stations.find(s => s.id === 'federal-way-downtown');
    expect(federalWay).toBeDefined();
    expect(federalWay?.name).toBe('Federal Way Downtown');

    const westlake = line1Stations.find(s => s.id === 'westlake');
    expect(westlake).toBeDefined();
    expect(westlake?.name).toBe('Westlake');
  });

  it('should include all 12 Line 2 stations', () => {
    const line2Stations = getStationsByLine('line-2');
    expect(line2Stations.length).toBe(12);

    const southBellevue = line2Stations.find(s => s.id === 'south-bellevue');
    expect(southBellevue).toBeDefined();

    const downtownRedmond = line2Stations.find(s => s.id === 'downtown-redmond');
    expect(downtownRedmond).toBeDefined();

    const mercerIsland = line2Stations.find(s => s.id === 'mercer-island');
    expect(mercerIsland).toBeDefined();

    const judkinsPark = line2Stations.find(s => s.id === 'judkins-park');
    expect(judkinsPark).toBeDefined();
  });

  it('uses official Sound Transit naming for updated stations', () => {
    expect(getStationById('shoreline-north-185th')?.name).toBe('Shoreline North');
    expect(getStationById('shoreline-south-148th')?.name).toBe('Shoreline South');
    expect(getStationById('international-district-chinatown')?.name).toBe('Intl. District / Chinatown');
    expect(getStationById('tukwila-intl-blvd')?.name).toBe('Tukwila Intl. Blvd.');
    expect(getStationById('bel-red')?.name).toBe('BelRed');
    expect(getStationById('symphony')?.name).toBe('Symphony');
    expect(getStationById('kent-des-moines')?.name).toBe('Kent Des Moines');
    expect(getStationById('star-lake')?.name).toBe('Star Lake');
    expect(getStationById('federal-way-downtown')?.name).toBe('Federal Way Downtown');
  });

  it('retains valid stop IDs for Puget Sound OneBusAway', () => {
    const westlake = getStationById('westlake');
    expect(westlake?.platforms.northbound?.stopId).toBe('40_1121');
    expect(westlake?.platforms.southbound?.stopId).toBe('40_1108');

    const lynnwood = getStationById('lynnwood-city-center');
    expect(lynnwood?.platforms.northbound?.stopId).toBe('40_N23-T1');
    expect(lynnwood?.platforms.southbound?.stopId).toBe('40_N23-T2');
  });

  it('should find station by id', () => {
    const capitolHill = getStationById('capitol-hill');
    expect(capitolHill).toBeDefined();
    expect(capitolHill?.name).toBe('Capitol Hill');
    expect(capitolHill?.lines).toContain('line-1');
  });

  it('should correctly filter pinned stations by active line', () => {
    // 1 station on Line 1 (westlake), 1 station on Line 2 (bellevue-downtown)
    const pinnedIds = ['westlake', 'bellevue-downtown'];

    const line1Pinned = getStationsByLine('line-1').filter((s) => pinnedIds.includes(s.id));
    const line2Pinned = getStationsByLine('line-2').filter((s) => pinnedIds.includes(s.id));

    expect(line1Pinned.length).toBe(1);
    expect(line1Pinned[0].name).toBe('Westlake');

    expect(line2Pinned.length).toBe(1);
    expect(line2Pinned[0].name).toBe('Bellevue Downtown');
  });
});

