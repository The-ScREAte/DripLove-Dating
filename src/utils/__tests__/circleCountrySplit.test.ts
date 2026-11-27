import { describe, it, expect, vi } from 'vitest';

vi.mock('@/integrations/supabase/client', () => ({ supabase: {} }));

import { getCircleCountrySplit } from '../circlePoolFetch';

describe('getCircleCountrySplit before the profile has loaded', () => {
  it('does not throw on a null/undefined user (a page refresh restores the Circle tab before the profile loads)', () => {
    expect(() => getCircleCountrySplit(null)).not.toThrow();
    expect(() => getCircleCountrySplit(undefined, true)).not.toThrow();
    expect(getCircleCountrySplit(null)).toEqual({ baseCountryCode: '', homeCountryCodes: [], unlockedCountryCodes: [] });
  });
});
