// Bounding-box helper for the server-side distance pre-filter
// (p_radius_degrees in get_random_discover_profiles / get_circle_category_profiles).
//
// The RPCs apply ONE number to both axes: lat BETWEEN lat+-r AND lon BETWEEN lon+-r.
// A degree of longitude is only ~111.32 * cos(lat) km, so km/111.32 is too NARROW on
// the longitude axis away from the equator (at 60N a 600 km radius needs ~10.8 deg
// of longitude, not 5.4) and silently dropped real in-range candidates. The client
// then narrows the box to a true circle with the haversine calculateDistance, so a
// box that is a little too big is harmless and one that is too small is a bug.
export const KM_PER_DEGREE = 111.32;

const MAX_BOX_DEGREES = 180;

// Degrees to use for BOTH axes of the box. Returns null (= "no box, rely on the
// client haversine filter") when a box cannot be trusted: the box would cross the
// +-180 antimeridian (a plain BETWEEN cannot wrap) or reach a pole.
export function boundingBoxDegrees(
  maxDistanceKm: number,
  lat: number | null | undefined,
  lon?: number | null,
): number | null {
  const la = Number(lat);
  if (lat === null || lat === undefined || !Number.isFinite(la) || Math.abs(la) > 90) return null;
  if (!Number.isFinite(maxDistanceKm) || maxDistanceKm <= 0) return null;
  const latDeg = maxDistanceKm / KM_PER_DEGREE;
  if (Math.abs(la) + latDeg >= 90) return null; // box touches a pole
  const cos = Math.cos((la * Math.PI) / 180);
  // Worst latitude inside the box has the smallest cos, so widen for that one.
  const worstLat = Math.abs(la) + latDeg;
  const worstCos = Math.min(cos, Math.cos((worstLat * Math.PI) / 180));
  if (worstCos <= 0.01) return null;
  const degrees = Math.min(latDeg / worstCos, MAX_BOX_DEGREES);
  if (lon !== undefined && lon !== null) {
    const lo = Number(lon);
    if (Number.isFinite(lo) && (lo + degrees > 180 || lo - degrees < -180)) return null;
  }
  return degrees;
}
