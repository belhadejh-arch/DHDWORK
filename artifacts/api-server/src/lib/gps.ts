/**
 * Calculate distance between two GPS coordinates using the Haversine formula.
 * Returns distance in meters.
 */
export function haversineDistance(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number
): number {
  const R = 6371000; // Earth radius in meters
  const φ1 = (lat1 * Math.PI) / 180;
  const φ2 = (lat2 * Math.PI) / 180;
  const Δφ = ((lat2 - lat1) * Math.PI) / 180;
  const Δλ = ((lng2 - lng1) * Math.PI) / 180;

  const a =
    Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
    Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return R * c;
}

/**
 * Office coordinates — fixed, cannot be changed.
 */
export const OFFICE_COORDINATES: Record<number, { lat: number; lng: number }> = {
  1: { lat: 35.8707722, lng: 7.1101606 }, // Oum El Bouaghi
  2: { lat: 35.9700208, lng: 6.8771648 }, // Ain El Fekroun
};

export const MAX_ATTENDANCE_RADIUS_METERS = 150;
