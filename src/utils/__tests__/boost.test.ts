import { describe, expect, it } from 'vitest';
import { boostProgress, boostSlotOffset, emptyBoostDeckState, formatBoostClock, formatBoostWait, insertBoostedIntoDeck, layoutBoostedDeck } from '../boost';

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

/* ------------------------------ fair placement for many boosters ------------------------------ */
describe('layoutBoostedDeck', () => {
  const NOW = 1_000_000;
  const LATER = NOW + 15 * 60_000;
  const normalDeck = (n: number) => Array.from({ length: n }, (_, i) => p(`n${i}`));
  const entries = (list: string[], endsAt: number | null = LATER) => list.map((id) => ({ id, endsAt }));
  const profiles = (list: string[]) => {
    const m = new Map(list.map((id) => [id, p(id, 'boost')]));
    return (id: string) => m.get(id);
  };
  const boostIds = (n: number) => Array.from({ length: n }, (_, i) => `b${i}`);
  const offsetsOf = (deck: Item[], list: string[]) => list.map((id) => deck.findIndex((x) => x.id === id));
  const noDupes = (deck: Item[]) => expect(new Set(ids(deck.filter((x) => !x.isAd))).size).toBe(deck.filter((x) => !x.isAd).length);

  it('slot offsets: alternate in the first 5, then every 3rd card', () => {
    expect([0, 1, 2, 3, 4, 5].map((k) => boostSlotOffset(k))).toEqual([1, 3, 5, 8, 11, 14]);
    expect(boostSlotOffset(0, [2, 4], 3)).toBe(2);
    expect(boostSlotOffset(2, [2, 4], 3)).toBe(7);
  });

  it('2 boosters: both within the first 5 cards, alternating with normal cards', () => {
    const deck = normalDeck(20);
    const b = boostIds(2);
    const r = layoutBoostedDeck(deck, 0, entries(b), profiles(b), emptyBoostDeckState<Item>(), { now: NOW });
    expect(r.deck[0]).toBe(deck[0]);
    expect(ids(r.deck).slice(0, 6)).toEqual(['n0', 'b0', 'n1', 'b1', 'n2', 'n3']);
    expect(r.fronted.sort()).toEqual(['b0', 'b1']);
    expect(r.deck.length).toBe(22);
    noDupes(r.deck);
  });

  it('5 boosters: three up front (+1, +3, +5), the rest every 3rd card after', () => {
    const deck = normalDeck(30);
    const b = boostIds(5);
    const r = layoutBoostedDeck(deck, 0, entries(b), profiles(b), emptyBoostDeckState<Item>(), { now: NOW });
    expect(offsetsOf(r.deck, b)).toEqual([1, 3, 5, 8, 11]);
    expect(r.fronted).toEqual(['b0', 'b1', 'b2']);
    // never two boosted cards next to each other in the front
    expect(ids(r.deck).slice(0, 6)).toEqual(['n0', 'b0', 'n1', 'b1', 'n2', 'b2']);
    noDupes(r.deck);
  });

  it('12 boosters: everyone gets a front slot within four polls, nobody twice before everyone once', () => {
    const deck = normalDeck(60);
    const b = boostIds(12);
    let state = emptyBoostDeckState<Item>();
    let current = deck;
    const frontedPerPoll: string[][] = [];
    for (let poll = 0; poll < 4; poll++) {
      const r = layoutBoostedDeck(current, 0, entries(b), profiles(b), state, { now: NOW + poll * 75_000 });
      frontedPerPoll.push(r.fronted);
      state = r.state;
      current = r.deck;
      expect(current[0]).toBe(deck[0]);
      expect(r.fronted.length).toBe(3);
      noDupes(current);
      // every booster is somewhere in the deck: 3 up front, 9 further back
      expect(offsetsOf(current, b).every((i) => i > 0)).toBe(true);
      expect(current.length).toBe(72);
    }
    const all = frontedPerPoll.flat();
    expect(new Set(all).size).toBe(12);
    expect(all.length).toBe(12);
  });

  it('rotation also breaks ties by soonest-ending boost', () => {
    const deck = normalDeck(20);
    const list = [
      { id: 'late', endsAt: NOW + 20 * 60_000 },
      { id: 'soon', endsAt: NOW + 60_000 },
      { id: 'mid', endsAt: NOW + 5 * 60_000 },
      { id: 'later', endsAt: NOW + 19 * 60_000 },
    ];
    const r = layoutBoostedDeck(deck, 0, list, profiles(list.map((e) => e.id)), emptyBoostDeckState<Item>(), { now: NOW });
    expect(r.fronted).toEqual(['soon', 'mid', 'later']);
    const r2 = layoutBoostedDeck(r.deck, 0, list, profiles(list.map((e) => e.id)), r.state, { now: NOW + 30_000 });
    expect(r2.fronted[0]).toBe('late');
    expect(r2.fronted).toContain('soon'); // then the soonest-ending of the ones already fronted
  });

  it('never moves or replaces the current card, even when it is a booster or the deck is short', () => {
    const deck = [p('b0'), p('n1')];
    const b = ['b0', 'b1', 'b2'];
    const r = layoutBoostedDeck(deck, 0, entries(b), profiles(b), emptyBoostDeckState<Item>(), { now: NOW });
    expect(r.deck[0]).toBe(deck[0]);
    expect(ids(r.deck)).toEqual(['b0', 'b1', 'n1', 'b2']);
    noDupes(r.deck);
  });

  it('respects a non-zero current index: earlier cards stay untouched', () => {
    const deck = normalDeck(10);
    const r = layoutBoostedDeck(deck, 2, entries(['x']), profiles(['x']), emptyBoostDeckState<Item>(), { now: NOW });
    expect(ids(r.deck).slice(0, 4)).toEqual(['n0', 'n1', 'n2', 'x']);
  });

  it('moves a booster waiting far back forward instead of duplicating it (keeps the deck copy)', () => {
    const deck = normalDeck(20);
    const r = layoutBoostedDeck(deck, 0, entries(['n15']), profiles(['n15']), emptyBoostDeckState<Item>(), { now: NOW });
    expect(ids(r.deck).slice(0, 3)).toEqual(['n0', 'n15', 'n1']);
    expect(r.deck[1]).toBe(deck[15]);
    expect(r.deck.length).toBe(20);
    expect(r.state.placements.n15.kind).toBe('moved');
  });

  it('never pushes a booster behind its natural spot', () => {
    const deck = normalDeck(20);
    // n2 is naturally at +2; as the 2nd placed booster its slot would be +3 -> it stays where it is
    const r = layoutBoostedDeck(deck, 0, entries(['x', 'n2']), profiles(['x']), emptyBoostDeckState<Item>(), { now: NOW });
    expect(r.deck.findIndex((i) => i.id === 'n2')).toBeLessThanOrEqual(3);
    expect(r.state.placements.n2).toBeUndefined();
    expect(r.fronted.sort()).toEqual(['n2', 'x']);
  });

  it('skips excluded ids (swiped, waiting hellos, blocked, me), ended and duplicate entries', () => {
    const deck = normalDeck(10);
    const b = ['x', 'swiped', 'y', 'old'];
    const list = [...entries(['x', 'x', 'swiped', 'y']), { id: 'old', endsAt: NOW - 1 }];
    const r = layoutBoostedDeck(deck, 0, list, profiles(b), emptyBoostDeckState<Item>(), { now: NOW, excludedIds: ['swiped'] });
    expect(ids(r.deck).slice(0, 4)).toEqual(['n0', 'x', 'n1', 'y']);
    expect(ids(r.deck)).not.toContain('swiped');
    expect(ids(r.deck)).not.toContain('old');
    noDupes(r.deck);
  });

  it('a booster I swiped is not added back on the next poll', () => {
    const deck = normalDeck(10);
    const r1 = layoutBoostedDeck(deck, 0, entries(['x']), profiles(['x']), emptyBoostDeckState<Item>(), { now: NOW });
    // I swipe n0, then x (both leave the deck, x goes into my local exclusions)
    const afterSwipes = r1.deck.filter((i) => i.id !== 'n0' && i.id !== 'x');
    const r2 = layoutBoostedDeck(afterSwipes, 0, entries(['x']), profiles(['x']), r1.state, { now: NOW + 75_000, excludedIds: ['x'] });
    expect(ids(r2.deck)).not.toContain('x');
    expect(r2.deck).toBe(afterSwipes);
    expect(r2.state.placements.x).toBeUndefined();
  });

  it('boost over after a swipe: the moved one goes back between its old neighbours, the on-screen one stays', () => {
    const deck = normalDeck(20);
    const list = [{ id: 'x', endsAt: NOW + 60_000 }, { id: 'n12', endsAt: NOW + 60_000 }];
    const r1 = layoutBoostedDeck(deck, 0, list, profiles(['x']), emptyBoostDeckState<Item>(), { now: NOW });
    expect(offsetsOf(r1.deck, ['x', 'n12'])).toEqual([1, 3]);
    expect(r1.state.placements.x.kind).toBe('injected');
    expect(r1.state.placements.n12.kind).toBe('moved');
    expect(r1.nextExpiryAt).toBe(NOW + 60_000);
    // I swipe n0: x is now the current card
    const swiped = r1.deck.slice(1);
    const r2 = layoutBoostedDeck(swiped, 0, list, profiles(['x']), r1.state, { now: NOW + 61_000, rotate: false });
    expect(r2.restored).toEqual(['n12']);
    expect(r2.removed).toEqual([]);
    expect(ids(r2.deck)).toEqual(['x', ...ids(deck.slice(1))]);
    expect(r2.deck[0]).toBe(swiped[0]);
  });

  it('boost over while the booster is further back: everything returns to the natural order', () => {
    const deck = normalDeck(20);
    const list = [{ id: 'x', endsAt: NOW + 60_000 }, { id: 'n12', endsAt: NOW + 60_000 }, { id: 'n13', endsAt: NOW + 60_000 }];
    const r1 = layoutBoostedDeck(deck, 0, list, profiles(['x']), emptyBoostDeckState<Item>(), { now: NOW });
    expect(ids(r1.deck).slice(0, 6)).toEqual(['n0', 'x', 'n1', 'n12', 'n2', 'n13']);
    const r2 = layoutBoostedDeck(r1.deck, 0, [], profiles([]), r1.state, { now: NOW + 61_000, rotate: false });
    expect(ids(r2.deck)).toEqual(ids(deck));
    expect(r2.removed).toEqual(['x']);
    expect(r2.restored.sort()).toEqual(['n12', 'n13']);
    expect(Object.keys(r2.state.placements)).toEqual([]);
    expect(r2.nextExpiryAt).toBeNull();
  });

  it('boost over after a few swipes and a refill: moved ones go back before the same next card', () => {
    const deck = normalDeck(12);
    const list = [{ id: 'n9', endsAt: NOW + 60_000 }];
    const r1 = layoutBoostedDeck(deck, 0, list, profiles([]), emptyBoostDeckState<Item>(), { now: NOW });
    expect(ids(r1.deck).slice(0, 3)).toEqual(['n0', 'n9', 'n1']);
    // a refill appends more cards meanwhile
    const refilled = [...r1.deck, p('n12'), p('n13')];
    // the boost ends (the poll no longer lists n9)
    const r2 = layoutBoostedDeck(refilled, 0, [], profiles([]), r1.state, { now: NOW + 10_000 });
    expect(ids(r2.deck)).toEqual([...ids(deck), 'n12', 'n13']);
    expect(r2.restored).toEqual(['n9']);
  });

  it('a booster on screen when its boost ends is left alone (never disturb the current card)', () => {
    const deck = normalDeck(6);
    const r1 = layoutBoostedDeck(deck, 0, entries(['x']), profiles(['x']), emptyBoostDeckState<Item>(), { now: NOW });
    const xCurrent = r1.deck.slice(1); // swiped n0, x is now the current card
    expect(xCurrent[0].id).toBe('x');
    const r2 = layoutBoostedDeck(xCurrent, 0, [], profiles([]), r1.state, { now: LATER + 1 });
    expect(r2.deck).toBe(xCurrent);
    expect(r2.removed).toEqual([]);
  });

  it('a moved booster whose natural spot was already passed comes right after the current card', () => {
    const deck = normalDeck(8);
    const r1 = layoutBoostedDeck(deck, 0, entries(['n4']), profiles([]), emptyBoostDeckState<Item>(), { now: NOW });
    expect(ids(r1.deck)).toEqual(['n0', 'n4', 'n1', 'n2', 'n3', 'n5', 'n6', 'n7']);
    // n0..n3 and n5 are swiped meanwhile (n4 still waits behind a new card c)
    const after = [p('c'), r1.deck[1], ...r1.deck.slice(6)]; // ['c', 'n4', 'n6', 'n7']
    const r2 = layoutBoostedDeck(after, 0, [], profiles([]), r1.state, { now: LATER + 1 });
    // n4's neighbours n3 / n5 are gone: its natural spot is behind us, so it is due right away
    expect(ids(r2.deck)).toEqual(['c', 'n4', 'n6', 'n7']);
  });

  it('is pure and returns the same array when nothing changes', () => {
    const deck = normalDeck(10);
    const r1 = layoutBoostedDeck(deck, 0, entries(['x']), profiles(['x']), emptyBoostDeckState<Item>(), { now: NOW });
    const again = layoutBoostedDeck(deck, 0, entries(['x']), profiles(['x']), emptyBoostDeckState<Item>(), { now: NOW });
    expect(ids(again.deck)).toEqual(ids(r1.deck));
    const r2 = layoutBoostedDeck(r1.deck, 0, entries(['x']), profiles(['x']), r1.state, { now: NOW + 1, rotate: false });
    expect(r2.deck).toBe(r1.deck);
    expect(layoutBoostedDeck(deck, 0, [], profiles([]), emptyBoostDeckState<Item>(), { now: NOW }).deck).toBe(deck);
  });

  it('a deck rebuilt from scratch drops stale records instead of removing the new copies', () => {
    const deck = normalDeck(6);
    const r1 = layoutBoostedDeck(deck, 0, entries(['x']), profiles(['x']), emptyBoostDeckState<Item>(), { now: NOW });
    const rebuilt = [p('n0'), p('n1'), p('x'), p('n2')]; // a fresh fetch happens to contain x naturally
    const r2 = layoutBoostedDeck(rebuilt, 0, [], profiles([]), r1.state, { now: LATER + 1 });
    expect(r2.deck).toBe(rebuilt);
  });

  it('counts ads as positions but never moves them', () => {
    const deck = [p('n0'), ad('ad1'), p('n1'), p('n2'), ad('ad2'), p('n3'), p('n4')];
    const r = layoutBoostedDeck(deck, 0, entries(['x', 'y']), profiles(['x', 'y']), emptyBoostDeckState<Item>(), { now: NOW, isAd });
    expect(ids(r.deck)).toEqual(['n0', 'x', 'ad1', 'y', 'n1', 'n2', 'ad2', 'n3', 'n4']);
    const r2 = layoutBoostedDeck(r.deck, 0, [], profiles([]), r.state, { now: LATER + 1, isAd });
    expect(ids(r2.deck)).toEqual(ids(deck));
  });

  it('no current card -> nothing changes', () => {
    const empty: Item[] = [];
    expect(layoutBoostedDeck(empty, 0, entries(['x']), profiles(['x']), emptyBoostDeckState<Item>(), { now: NOW }).deck).toBe(empty);
  });
});
