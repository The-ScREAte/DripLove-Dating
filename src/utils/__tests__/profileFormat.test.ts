import { describe, it, expect } from 'vitest';
import { formatHeightLabel, truncateCaption } from '../profileFormat';
import { extractDuplicateFaceDetails, formatDuplicateFaceMessage } from '../faceReference';
import { getSupabaseErrorMessage } from '../../lib/edgeFunctionError';

describe('profileFormat', () => {
  it('formats height in feet/inches and cm', () => {
    expect(formatHeightLabel(180)).toBe(`5'11" (180 cm)`);
  });
  it('truncates long captions only', () => {
    expect(truncateCaption('short')).toBe('short');
    expect(truncateCaption('a'.repeat(60))).toBe(`${'a'.repeat(50)}…`);
  });
});

describe('face + error helpers', () => {
  it('prefers a nested duplicateFace payload', () => {
    expect(extractDuplicateFaceDetails({ duplicateFace: { faceId: 'x' } })).toEqual({ faceId: 'x' });
    expect(extractDuplicateFaceDetails({ faceId: 'abc' }).faceId).toBe('abc');
    expect(formatDuplicateFaceMessage(null)).toContain('FACE-UNKNOWN');
  });
  it('extracts error messages', () => {
    expect(getSupabaseErrorMessage(new Error('e'))).toBe('e');
    expect(getSupabaseErrorMessage({ message: 'm' })).toBe('m');
    expect(getSupabaseErrorMessage({})).toBeUndefined();
  });
});
