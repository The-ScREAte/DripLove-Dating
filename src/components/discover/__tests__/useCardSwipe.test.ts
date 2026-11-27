import { describe, it, expect } from 'vitest';
import { decideSwipe, dragTransform, exitTransform, minSwipeDistance, stampLook } from '../useCardSwipe';

describe('minSwipeDistance', () => {
  it('uses 25% of the viewport on touch, capped at 120px', () => {
    expect(minSwipeDistance(320, 'touch')).toBe(80);
    expect(minSwipeDistance(390, 'touch')).toBeCloseTo(97.5);
    expect(minSwipeDistance(1280, 'touch')).toBe(120);
  });
  it('is a fixed 80px for the mouse', () => {
    expect(minSwipeDistance(1280, 'mouse')).toBe(80);
  });
});

describe('decideSwipe', () => {
  const base = { vx: 0, viewportWidth: 390, source: 'touch' as const };
  it('snaps back for a short, slow drag', () => {
    expect(decideSwipe({ ...base, deltaX: 60 })).toBeNull();
    expect(decideSwipe({ ...base, deltaX: -97 })).toBeNull();
  });
  it('commits past the distance threshold in the dragged direction', () => {
    expect(decideSwipe({ ...base, deltaX: 100 })).toBe('right');
    expect(decideSwipe({ ...base, deltaX: -100 })).toBe('left');
  });
  it('commits a short but quick flick in the same direction', () => {
    expect(decideSwipe({ ...base, deltaX: 50, vx: 0.9 })).toBe('right');
    expect(decideSwipe({ ...base, deltaX: -50, vx: -0.9 })).toBe('left');
  });
  it('ignores a flick that is too short or opposite to the drag', () => {
    expect(decideSwipe({ ...base, deltaX: 30, vx: 0.9 })).toBeNull();
    expect(decideSwipe({ ...base, deltaX: 50, vx: -0.9 })).toBeNull();
  });
  it('uses the mouse threshold for desktop drags', () => {
    expect(decideSwipe({ deltaX: 85, vx: 0, viewportWidth: 1280, source: 'mouse' })).toBe('right');
    expect(decideSwipe({ deltaX: 85, vx: 0, viewportWidth: 1280, source: 'touch' })).toBeNull();
  });
});

describe('transforms', () => {
  it('drag transform follows both axes and tilts with x', () => {
    expect(dragTransform(100, 20)).toBe('translate3d(100px, 20px, 0) rotate(6deg) scale(1)');
  });
  it('exit flies off the correct side', () => {
    expect(exitTransform('right', 400, 800)).toContain('translate3d(600px, 240px, 0) rotate(24deg) scale(0.55)');
    expect(exitTransform('left', 400, 800)).toContain('translate3d(-600px, 240px, 0) rotate(-24deg)');
  });
  it('reduced-motion exit is a plain slide without tilt or shrink', () => {
    expect(exitTransform('right', 400, 800, true)).toBe('translate3d(600px, 0, 0) rotate(0deg) scale(1)');
  });
});

describe('stampLook', () => {
  it('grows and brightens continuously with distance, capped', () => {
    const a = stampLook(10, 'right');
    const b = stampLook(60, 'right');
    const c = stampLook(400, 'right');
    expect(b.opacity).toBeGreaterThan(a.opacity);
    expect(c.opacity).toBe(1);
    expect(c.transform).toContain('scale(1.25)'); // 0.85 + 0.8*0.5
  });
  it('mirrors rotation for the pass stamp', () => {
    expect(stampLook(100, 'right').transform).toContain('rotate(8deg)');
    expect(stampLook(100, 'left').transform).toContain('rotate(-8deg)');
  });
});
