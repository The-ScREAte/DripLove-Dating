import { describe, it, expect, vi, beforeEach } from 'vitest';

// Minimal stand-in for the supabase client that behaves like supabase-js >= 2.5x:
// channel(topic) returns the EXISTING channel when the topic is already registered, and a channel
// that is subscribed rejects further postgres_changes listeners.
const state = vi.hoisted(() => ({ channels: [] as Array<{ topic: string; subscribed: boolean }> }));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    getChannels: () => state.channels,
    channel: (name: string) => {
      const topic = `realtime:${name}`;
      const existing = state.channels.find((c) => c.topic === topic);
      if (existing) return existing;
      const created = { topic, subscribed: false };
      state.channels.push(created);
      return created;
    },
    // removeChannel is async and the channel only disappears from the list a moment AFTER it resolves
    removeChannel: async (channel: { topic: string }) => {
      await Promise.resolve();
      setTimeout(() => {
        state.channels = state.channels.filter((c) => c !== channel);
      }, 30);
      return 'ok';
    },
  },
}));

import { uniqueTopic, acquireSharedChannel } from '../realtime';

beforeEach(() => {
  state.channels = [];
});

describe('uniqueTopic', () => {
  it('never returns the same topic twice, so two components can never share a subscribed channel', () => {
    const topics = new Set(Array.from({ length: 500 }, () => uniqueTopic('subscription-changes')));
    expect(topics.size).toBe(500);
  });

  it('keeps the readable base name as a prefix', () => {
    expect(uniqueTopic('likes-me-123').startsWith('likes-me-123~')).toBe(true);
  });
});

describe('acquireSharedChannel', () => {
  it('creates the channel when none exists', async () => {
    const ch = await acquireSharedChannel('typing:abc');
    expect(ch.topic).toBe('realtime:typing:abc');
    expect(state.channels).toHaveLength(1);
  });

  it('waits for a stale channel with the same topic to be fully gone and returns a FRESH one', async () => {
    const stale = { topic: 'realtime:typing:abc', subscribed: true };
    state.channels.push(stale);
    const fresh = (await acquireSharedChannel('typing:abc')) as unknown as { subscribed: boolean };
    expect(fresh).not.toBe(stale);
    expect(fresh.subscribed).toBe(false);
  });
});
