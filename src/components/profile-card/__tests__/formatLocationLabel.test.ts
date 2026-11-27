import { describe, it, expect } from 'vitest';
import { formatLocationLabel } from '../profileCardUtils';

describe('formatLocationLabel', () => {
  it('joins city and country', () => {
    expect(formatLocationLabel('Provo', 'United States')).toBe('Provo, United States');
  });
  it('drops postal codes and does not repeat the country (the "Camargo, OK 73835 United States, United States" case)', () => {
    expect(formatLocationLabel('Camargo, OK 73835 United States', 'United States')).toBe('Camargo, OK, United States');
  });
  it('handles one side missing and blanks', () => {
    expect(formatLocationLabel('Accra', '')).toBe('Accra');
    expect(formatLocationLabel(null, 'Ghana')).toBe('Ghana');
    expect(formatLocationLabel('  ', null)).toBe('');
  });
  it('keeps a plain city that merely contains digits-free text', () => {
    expect(formatLocationLabel('Kumasi', 'Ghana')).toBe('Kumasi, Ghana');
  });
});
