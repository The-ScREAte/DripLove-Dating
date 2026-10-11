import { describe, expect, it } from 'vitest';
import { takeNext } from '../useImagePreloader';

describe('takeNext', () => {
  it('takes the most urgent photo first, oldest first within a priority', () => {
    const queue = [
      { url: 'far-1', priority: 'low' as const },
      { url: 'far-2', priority: 'low' as const },
      { url: 'next-extra', priority: 'medium' as const },
      { url: 'next-card', priority: 'high' as const },
      { url: 'card-after', priority: 'high' as const },
    ];
    const order: string[] = [];
    let item = takeNext(queue);
    while (item) {
      order.push(item.url);
      item = takeNext(queue);
    }
    expect(order).toEqual(['next-card', 'card-after', 'next-extra', 'far-1', 'far-2']);
    expect(queue).toHaveLength(0);
  });

  it('returns nothing for an empty queue', () => {
    expect(takeNext([])).toBeUndefined();
  });
});
