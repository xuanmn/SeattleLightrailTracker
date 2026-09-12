/**
 * Station Display Formatting Utilities
 */

export function formatSimpleDestination(dest: string, stationId?: string, isCol1?: boolean): string {
  if (stationId === 'lynnwood-city-center') {
    return isCol1 ? 'To Lynnwood' : 'To Federal Way / Redmond';
  }
  if (stationId === 'federal-way-downtown') {
    return isCol1 ? 'To Lynnwood' : 'To Federal Way';
  }
  if (stationId === 'downtown-redmond') {
    return isCol1 ? 'To Redmond' : 'To Lynnwood';
  }
  if (stationId === 'south-bellevue') {
    return isCol1 ? 'To Redmond' : 'To Lynnwood';
  }

  if (!dest) return 'To Terminal';
  const clean = dest.replace(/^to\s+/i, '').trim();
  if (/federal way/i.test(clean)) return 'To Federal Way';
  if (/lynnwood/i.test(clean)) return 'To Lynnwood';
  if (/angle lake/i.test(clean)) return 'To Angle Lake';
  if (/bellevue/i.test(clean)) return 'To South Bellevue';
  if (/redmond/i.test(clean)) return 'To Redmond';
  return `To ${clean}`;
}
