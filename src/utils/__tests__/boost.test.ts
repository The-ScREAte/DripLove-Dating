import { describe, expect, it } from 'vitest';
import { boostProgress, formatBoostClock, formatBoostWait, insertBoostedIntoDeck } from '../boost';

type Item = { id: string; isAd?: boolean; tag?: string };
const p = (id: string, tag?: string): Item => ({ id, tag });
const ad = (id: string): Item => ({ id, isAd: true });
const ids = (d: Item[]) => d.map((x) => x.id);
const isAd = (x: Item) => x.isAd === true;

describe('formatBoostClock', () => {
  it('formats minutes and seconds', () => {
    expect(formatBoostClock(15 * 60_000)).toBe('15:00');
    expect(formatBoostClock(14 * 60_000 + 59_000)).toBe('14:59');
    expect(formatBoostClock(5_000)).toBe('0:05');
  });
  it('rounds partial seconds up so it never shows 0:00 while time is left', () => {
    expect(formatBoostClock(300)).toBe('0:01');
    expect(formatBoostClock(59_001)).toBe('1:00');
  });
  it('never goes negative', () => {
    expect(formatBoostClock(0)).toBe('0:00');
    expect(formatBoostClock(-5000)).toBe('0:00');
  });
  it('shows hours when needed', () => {
    expect(formatBoostClock(3600_000 + 2 * 60_000 + 3_000)).toBe('1:02:03');
  });
});

describe('formatBoostWait', () => {
  it('minutes under an hour, rounded up', () => {
    expect(formatBoostWait(45 * 60_000)).toBe('45m');
    expect(formatBoostWait(10_000)).toBe('1m');
  });
  it('hours above', () => {
    expect(formatBoostWait(5 * 3600_000)).toBe('5h');
    expect(formatBoostWait(4.6 * 3600_000)).toBe('5h');
    expect(formatBoostWait(61 * 60_000)).toBe('1h');
  });
  it('handles past / invalid values', () => {
    expect(formatBoostWait(0)).toBe('1m');
    expect(formatBoostWait(Number.NaN)).toBe('1m');
  });
});

describe('boostProgress', () => {
  it('goes 0 -> 1 over the duration', () => {
    const now = 1_000_000;
    expect(boostProgress(now + 15 * 60_000, 15, now)).toBe(0);
    expect(boostProgress(now + 7.5 * 60_000, 15, now)).toBeCloseTo(0.5);
    expect(boostProgress(now - 1, 15, now)).toBe(1);
  });
});

describe('insertBoostedIntoDeck', () => {
  const deck = [p('a'), p('b'), p('c'), p('d')];

  it('inserts two cards after the current one by default', () => {
    const r = insertBoostedIntoDeck(deck, 0, [p('x')]);
    expect(ids(r.deck)).toEqual(['a', 'b', 'x', 'c', 'd']);
    expect(r.inserted).toEqual(['x']);
  });

  it('inserts right after the current card with offset 1', () => {
    const r = insertBoostedIntoDeck(deck, 0, [p('x')], { offset: 1 });
    expect(ids(r.deck)).toEqual(['a', 'x', 'b', 'c', 'd']);
  });

  it('respects a non-zero currentIndex', () => {
    const r = insertBoostedIntoDeck(deck, 1, [p('x'), p('y')]);
    expect(ids(r.deck)).toEqual(['a', 'b', 'c', 'x', 'y', 'd']);
  });

  it('never replaces or moves the current card', () => {
    const r = insertBoostedIntoDeck(deck, 0, [p('a'), p('x')]);
    expect(r.deck[0]).toBe(deck[0]);
    expect(ids(r.deck)).toEqual(['a', 'b', 'x', 'c', 'd']);
  });

  it('skips excluded ids (swiped, blocked, waiting hellos)', () => {
    const r = insertBoostedIntoDeck(deck, 0, [p('x'), p('y')], { excludedIds: ['x'] });
    expect(ids(r.deck)).toEqual(['a', 'b', 'y', 'c', 'd']);
  });

  it('collapses duplicates in the incoming list', () => {
    const r = insertBoostedIntoDeck(deck, 0, [p('x'), p('x'), p('y')]);
    expect(ids(r.deck)).toEqual(['a', 'b', 'x', 'y', 'c', 'd']);
  });

  it('leaves a profile that is already next up where it is', () => {
    const r = insertBoostedIntoDeck(deck, 0, [p('b')]);
    expect(r.deck).toBe(deck);
    expect(r.inserted).toEqual([]);
  });

  it('moves a profile waiting further back forward instead of duplicating it', () => {
    const r = insertBoostedIntoDeck(deck, 0, [p('d', 'fresh')]);
    expect(ids(r.deck)).toEqual(['a', 'b', 'd', 'c']);
    // keeps the deck's own copy
    expect(r.deck[2]).toBe(deck[3]);
    expect(new Set(ids(r.deck)).size).toBe(r.deck.length);
  });

  it('appends right after the current card when the deck is short', () => {
    const r = insertBoostedIntoDeck([p('a')], 0, [p('x')]);
    expect(ids(r.deck)).toEqual(['a', 'x']);
  });

  it('does nothing without a current card', () => {
    const empty: Item[] = [];
    expect(insertBoostedIntoDeck(empty, 0, [p('x')]).deck).toBe(empty);
    expect(insertBoostedIntoDeck(deck, 4, [p('x')]).deck).toBe(deck);
  });

  it('returns the same array when nothing is inserted', () => {
    expect(insertBoostedIntoDeck(deck, 0, []).deck).toBe(deck);
    expect(insertBoostedIntoDeck(deck, 0, [p('x')], { excludedIds: ['x'] }).deck).toBe(deck);
  });

  it('caps how many are inserted at once', () => {
    const r = insertBoostedIntoDeck(deck, 0, [p('x'), p('y'), p('z'), p('w')], { maxInsert: 2 });
    expect(r.inserted).toEqual(['x', 'y']);
  });

  it('counts ads as positions but never dedupes or moves them', () => {
    const withAds = [p('a'), ad('ad1'), p('b'), ad('ad1')];
    const r = insertBoostedIntoDeck(withAds, 0, [p('x'), ad('ad1')], { isAd });
    expect(ids(r.deck)).toEqual(['a', 'ad1', 'x', 'b', 'ad1']);
  });
});
