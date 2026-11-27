import { supabase } from '@/integrations/supabase/client';
import type { RealtimeChannel, RealtimeChannelOptions } from '@supabase/supabase-js';

// Why this file exists
// --------------------
// supabase-js >= 2.5x makes `supabase.channel(name)` RETURN THE EXISTING CHANNEL when one with the
// same topic is already registered (older versions always created a new one). Two things follow:
//
//  1. `.on('postgres_changes' | 'presence', …)` THROWS on a channel that is already joined or
//     joining ("cannot add `postgres_changes` callbacks … after `subscribe()`"). With a fixed
//     name that happens whenever two components use the same channel (e.g. `useSubscription`
//     is mounted by BOTH the Discover and Profile tabs), whenever an effect re-runs, and on every
//     StrictMode double-mount, because `removeChannel()` is async and the old channel is still
//     registered when the effect runs again. An uncaught throw in an effect unmounts the whole
//     React tree → the "Something went wrong" screen.
//  2. For channels whose topic must be SHARED between devices (broadcast channels such as the
//     typing indicator and the call signalling) we cannot just invent a new name; we have to wait
//     for the previous channel with that topic to be fully gone first.
//
// Rules:
//  - postgres_changes / presence listeners → `supabase.channel(uniqueTopic('my-name'))`. The topic of
//    a postgres_changes channel is only a local label (the server matches rows by the filter),
//    so a unique suffix is safe and removes every collision.
//  - broadcast channels that peers must join by name → `await acquireSharedChannel('name', opts)`.

let sequence = 0;
const instanceId = Math.random().toString(36).slice(2, 6);

/** A topic that can never collide with another channel created by this client. */
export const uniqueTopic = (base: string): string => `${base}~${instanceId}${++sequence}`;

const fullTopic = (topic: string) => `realtime:${topic}`;

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * Returns a brand-new channel for a topic that has to stay identical across devices (broadcast).
 * If this client already has a channel with that topic, it is removed and we wait (bounded) until
 * the client has actually forgotten it, so `.on(...)` is never called on a stale, subscribed one.
 */
export const acquireSharedChannel = async (
  topic: string,
  opts?: RealtimeChannelOptions,
): Promise<RealtimeChannel> => {
  const find = () => supabase.getChannels().find((channel) => channel.topic === fullTopic(topic));
  const existing = find();
  if (existing) {
    try {
      await supabase.removeChannel(existing);
    } catch {
      // ignore - we re-check below
    }
    // removeChannel resolves once the leave is acknowledged; the client drops the channel from its
    // list right after. Give it a short, bounded moment instead of racing it.
    for (let i = 0; i < 20 && find(); i += 1) {
      await sleep(25);
    }
  }
  return supabase.channel(topic, opts);
};
