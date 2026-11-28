import { describe, it, expect } from 'vitest';
import { formatLocationLabel } from '../profileCardUtils';

describe('formatLocationLabel', () => {
  it('joins city and country', () => {
    expect(formatLocationLabel('Provo', 'United States')).toBe('Provo, USA');
  });
  it('drops postal codes and does not repeat the country (the "Camargo, OK 73835 United States, United States" case)', () => {
    expect(formatLocationLabel('Camargo, OK 73835 United States', 'United States')).toBe('Camargo, OK, USA');
  });
  it('handles one side missing and blanks', () => {
    expect(formatLocationLabel('Accra', '')).toBe('Accra');
    expect(formatLocationLabel(null, 'Ghana')).toBe('GH');
    expect(formatLocationLabel('  ', null)).toBe('');
  });
  it('keeps a plain city that merely contains digits-free text', () => {
    expect(formatLocationLabel('Kumasi', 'Ghana')).toBe('Kumasi, GH');
  });
});

describe('countryShort', () => {
  it('uses short international labels', async () => {
    const { countryShort, placeShort } = await import('@/utils/countryShort');
    expect(countryShort('United States')).toBe('USA');
    expect(countryShort('Ghana')).toBe('GH');
    expect(countryShort('United Kingdom')).toBe('UK');
    expect(countryShort('Nigeria')).toBe('NG');
    expect(countryShort('GH')).toBe('GH');
    expect(countryShort('Germany')).toBe('DE');
    expect(countryShort('Atlantis')).toBe('Atlantis');
    expect(placeShort("Prince George's County", 'United States')).toBe("Prince George's County, USA");
  });
});
