import { describe, expect, it } from 'vitest';
import {
  asList,
  displayValue,
  isLongText,
  isSpecified,
  pickCaptionedPhotos,
  pickSecondPhotoAnchor,
  relationshipIntentLabel,
  traitText,
} from '../profileCardUtils';
import { PHOTO_ANCHORS } from '../types';

describe('isSpecified', () => {
  it('rejects empty, whitespace, null and not_specified', () => {
    expect(isSpecified('')).toBe(false);
    expect(isSpecified('   ')).toBe(false);
    expect(isSpecified(null)).toBe(false);
    expect(isSpecified(undefined)).toBe(false);
    expect(isSpecified('not_specified')).toBe(false);
  });
  it('accepts real values', () => {
    expect(isSpecified('Never')).toBe(true);
  });
});

describe('displayValue / traitText', () => {
  it('prettifies identifiers', () => {
    expect(displayValue('night_owl')).toBe('Night owl');
    expect(displayValue('socially')).toBe('Socially');
  });
  it('uses the option label when known, a prettified value otherwise', () => {
    const options = [{ value: 'wants_kids', label: 'Wants kids' }];
    expect(traitText(options, 'wants_kids')).toBe('Wants kids');
    expect(traitText(options, 'dog_lover')).toBe('Dog lover');
  });
});

describe('relationshipIntentLabel', () => {
  it('maps known intents and prettifies the rest', () => {
    expect(relationshipIntentLabel('serious')).toBe('Looking for something serious');
    expect(relationshipIntentLabel('open_to_anything')).toBe('Open to anything');
    expect(relationshipIntentLabel('long_term')).toBe('Looking for long term');
  });
  it('is empty for missing intent', () => {
    expect(relationshipIntentLabel(null)).toBe('');
    expect(relationshipIntentLabel('')).toBe('');
  });
  it('goes through the translator when given one', () => {
    const t = (key: string, fallback: string) => `${key}|${fallback}`;
    expect(relationshipIntentLabel('serious', t)).toContain('lookingForSerious');
  });
});

describe('isLongText', () => {
  it('folds long or many-line text only', () => {
    expect(isLongText('short')).toBe(false);
    expect(isLongText('x'.repeat(181))).toBe(true);
    expect(isLongText('a\nb\nc\nd')).toBe(true);
  });
});

describe('pickCaptionedPhotos', () => {
  const captions = {
    'a.jpg': { caption: 'A', label: 'Trip' },
    'b.jpg': { caption: 'B', label: null },
    'c.jpg': { caption: 'C' },
    'd.jpg': { caption: '' },
  };
  it('returns at most 2, only captioned, deterministically per seed', () => {
    const one = pickCaptionedPhotos(captions, 'user-1');
    const two = pickCaptionedPhotos(captions, 'user-1');
    expect(one).toEqual(two);
    expect(one).toHaveLength(2);
    expect(one.every((p) => p.caption)).toBe(true);
  });
  it('respects the allowed photo list', () => {
    const only = pickCaptionedPhotos(captions, 'user-1', ['b.jpg']);
    expect(only.map((p) => p.url)).toEqual(['b.jpg']);
    expect(pickCaptionedPhotos(captions, 'user-1', [])).toEqual([]);
  });
  it('handles missing captions', () => {
    expect(pickCaptionedPhotos(undefined, 'x')).toEqual([]);
    expect(pickCaptionedPhotos(null, 'x')).toEqual([]);
  });
});

describe('pickSecondPhotoAnchor', () => {
  it('needs two photos and returns a known anchor', () => {
    expect(pickSecondPhotoAnchor('u', 0)).toBeNull();
    expect(pickSecondPhotoAnchor('u', 1)).toBeNull();
    const anchor = pickSecondPhotoAnchor('u', 2);
    expect(PHOTO_ANCHORS).toContain(anchor);
    expect(pickSecondPhotoAnchor('u', 2)).toBe(anchor);
  });
});

describe('asList', () => {
  it('never throws on odd DB shapes', () => {
    expect(asList(null)).toEqual([]);
    expect(asList({})).toEqual([]);
    expect(asList('x')).toEqual([]);
    expect(asList(['a', '', null, 'b'])).toEqual(['a', 'b']);
  });
});
