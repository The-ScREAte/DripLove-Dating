import { describe, it, expect } from 'vitest';
import { boundingBoxDegrees, KM_PER_DEGREE } from '../geoBox';
import { calculateDistance } from '@/constants/locationData';

describe('boundingBoxDegrees', () => {
  it('equals km/111.32 at the equator', () => {
    expect(boundingBoxDegrees(600, 0, 10)!).toBeCloseTo(600 / KM_PER_DEGREE, 1);
  });
  it('widens with latitude so the longitude axis still covers the radius', () => {
    const lat = 60;
    const deg = boundingBoxDegrees(600, lat, 10)!;
    expect(deg).toBeGreaterThan(600 / KM_PER_DEGREE * 1.9);
    // a point exactly 590 km due east must fall inside the box
    const dLon = 590 / (KM_PER_DEGREE * Math.cos((lat * Math.PI) / 180));
    expect(calculateDistance(lat, 10, lat, 10 + dLon)).toBeLessThan(600);
    expect(dLon).toBeLessThanOrEqual(deg);
  });
  it('returns null (no box) across the antimeridian, near poles, or for bad input', () => {
    expect(boundingBoxDegrees(600, -17, 179)).toBeNull();
    expect(boundingBoxDegrees(600, 85, 0)).toBeNull();
    expect(boundingBoxDegrees(0, 10, 10)).toBeNull();
    expect(boundingBoxDegrees(600, null, 10)).toBeNull();
    expect(boundingBoxDegrees(600, NaN, 10)).toBeNull();
  });
});
