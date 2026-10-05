import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';
import { DAILY_LIMIT_PER_ACCOUNT, kickEmailQueue, loadAccounts, loadPausedAccounts } from '../_shared/email-utils.ts';
import { composeLikeMatchEmail } from '../_shared/notification-email.ts';

// Likes and matches that couldn't be announced the moment they happened -
// night-time, grouped with an earlier like push, daily cap, no device,
// notifications off, push failed - wait in notification_email_queue.
// Every 15 minutes (see 20261005120000_missed_like_match_notifications.sql)
// this sends what's due:
//   phone can show notifications -> one push ("3 people liked you")
//   notifications blocked / app deleted -> one email (max 2 a day, daytime)
// The rules for who gets what, and when, live in claim_missed_notifications.

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const LOCK_NAME = 'process-missed-notifications';
const MAX_USERS_PER_RUN = 150;

declare const EdgeRuntime: { waitUntil(promise: Promise<unknown>): void } | undefined;

type Due = {
  user_id: string;
  route: 'push' | 'email';
  reason: string;
  local_hour: number | null;
  email: string | null;
  first_name: string | null;
  like_count: number;
  match_count: number;
  match_sender_ids: string[] | null;
  item_ids: number[];
};

async function setItems(supabase: SupabaseClient, ids: number[], fields: Record<string, unknown>) {
  const { error } = await supabase.from('notification_email_queue').update(fields).in('id', ids);
  if (error) console.error('Failed to update missed-notification items:', error);
}

/** How many more emails the sending accounts can take today, after what's already queued. */
async function emailBudget(supabase: SupabaseClient): Promise<number> {
  const paused = await loadPausedAccounts(supabase);
  const accounts = loadAccounts().filter((a) => !paused.has(a.email));
  if (accounts.length === 0) return 0;
  const today = new Date().toISOString().slice(0, 10);
  const { data: usage } = await supabase
    .from('email_account_usage')
    .select('account_email, sent_count')
    .in('account_email', accounts.map((a) => a.email))
    .eq('send_date', today);
  const used = (usage || []).reduce((sum: number, r: { sent_count: number }) => sum + (r.sent_count || 0), 0);
  const { count: pending } = await supabase
    .from('email_send_queue')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'pending')
    .eq('kind', 'notification');
  return Math.max(0, accounts.length * DAILY_LIMIT_PER_ACCOUNT - used - (pending || 0));
}

async function sendPush(supabase: SupabaseClient, due: Due, names: Map<string, string>): Promise<boolean> {
  const pushes: Array<Record<string, unknown>> = [];
  if (due.match_count > 0) {
    const name = due.match_count === 1 ? names.get(due.match_sender_ids?.[0] ?? '') : undefined;
    pushes.push({
      title: "It's a match! 💕",
      body: name ? `You and ${name} liked each other. Say hello!` : `You have ${due.match_count} new matches. Say hello!`,
      type: 'match',
      kind: 'match',
      data: { catchup: 'true', ...(due.match_count === 1 && due.match_sender_ids?.[0] ? { senderId: due.match_sender_ids[0] } : {}) },
    });
  }
  if (due.like_count > 0) {
    // send-push-notification turns this into "N people liked you" from the
    // real count since their last like push.
    pushes.push({
      title: due.like_count > 1 ? `${due.like_count} people liked you 👀` : 'Someone liked you 👀',
      body: "See who's interested in you",
      type: 'like',
      kind: 'like',
      data: { catchup: 'true' },
    });
  }

  let delivered = false;
  for (const push of pushes) {
    const { data, error } = await supabase.functions.invoke('send-push-notification', {
      body: { userId: due.user_id, category: 'event', ...push },
    });
    if (error) {
      console.error(`Catch-up push failed for ${due.user_id}:`, error);
      continue;
    }
    if (data?.pushSuccess) delivered = true;
  }
  return delivered;
}

async function run(supabase: SupabaseClient, supabaseUrl: string, serviceKey: string, onlyUserIds: string[] | null) {
  const budget = await emailBudget(supabase);
  const { data, error } = await supabase.rpc('claim_missed_notifications', {
    p_max_users: MAX_USERS_PER_RUN,
    p_email_budget: budget,
    p_dry_run: false,
    p_only_users: onlyUserIds,
  });
  if (error) throw error;
  const dueList = (data || []) as Due[];

  // First names of new matches (for "You matched with Ama").
  const senderIds = Array.from(new Set(dueList.flatMap((d) => d.match_sender_ids || []).filter(Boolean)));
  const names = new Map<string, string>();
  if (senderIds.length > 0) {
    const { data: profiles } = await supabase.from('profiles').select('id, first_name').in('id', senderIds);
    (profiles || []).forEach((p: { id: string; first_name: string | null }) => {
      const first = String(p.first_name ?? '').trim().split(/\s+/)[0];
      if (first) names.set(p.id, first.charAt(0).toUpperCase() + first.slice(1).toLowerCase());
    });
  }

  const tally = { pushed: 0, pushRetry: 0, emailed: 0, emailFailed: 0, budget };
  for (const due of dueList) {
    const now = new Date().toISOString();
    if (due.route === 'push') {
      const ok = await sendPush(supabase, due, names);
      if (ok) {
        tally.pushed += 1;
        await setItems(supabase, due.item_ids, { status: 'pushed', handled_at: now, sent_at: now });
      } else {
        // Held again (rules changed since the check) or the push failed:
        // back in the queue; if the device turned out to be gone, the next
        // run sends an email instead.
        tally.pushRetry += 1;
        await setItems(supabase, due.item_ids, { status: 'pending', handled_at: null, channel: null });
      }
      continue;
    }

    if (!due.email) {
      await setItems(supabase, due.item_ids, { status: 'dropped', channel: 'no_email', handled_at: now });
      continue;
    }
    const content = composeLikeMatchEmail({
      firstName: due.first_name,
      likeCount: due.like_count,
      matchCount: due.match_count,
      matchNames: (due.match_sender_ids || []).map((id) => names.get(id)).filter(Boolean) as string[],
    });
    const { error: queueError } = await supabase.from('email_send_queue').insert({
      kind: 'notification',
      priority: 1,
      user_id: due.user_id,
      recipient: due.email,
      subject: content.subject,
      preheader: content.preheader,
      html: content.html,
      text_body: content.text,
      attempt_count: 0,
    });
    if (queueError) {
      tally.emailFailed += 1;
      console.error(`Could not queue email for ${due.user_id}:`, queueError);
      await setItems(supabase, due.item_ids, { status: 'pending', handled_at: null, channel: null });
      continue;
    }
    tally.emailed += 1;
    await setItems(supabase, due.item_ids, { status: 'emailed', handled_at: now, sent_at: now });
  }

  if (tally.emailed > 0) await kickEmailQueue(supabaseUrl, serviceKey);
  console.log('process-missed-notifications:', JSON.stringify(tally));
  return tally;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
  const supabase = createClient(supabaseUrl, serviceKey);
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status });

  const { data: gotLock, error: lockError } = await supabase.rpc('try_acquire_worker_lock', {
    p_name: LOCK_NAME,
    p_seconds: 300,
  });
  if (lockError) return json({ error: 'Could not take the lock' }, 500);
  if (!gotLock) return json({ message: 'Another run is in progress' });

  // Optional { onlyUserIds: [...] } limits a run to those people - used to
  // test on test accounts without touching anyone else's queued items.
  let onlyUserIds: string[] | null = null;
  try {
    const body = await req.json();
    if (Array.isArray(body?.onlyUserIds)) {
      onlyUserIds = body.onlyUserIds.filter((id: unknown) =>
        typeof id === 'string' && /^[0-9a-f-]{36}$/i.test(id));
    }
  } catch {
    // no body - normal scheduled run
  }

  const work = run(supabase, supabaseUrl, serviceKey, onlyUserIds)
    .catch((error) => {
      console.error('process-missed-notifications error:', error);
      return { error: error instanceof Error ? error.message : 'Unknown error' };
    })
    .finally(() => supabase.rpc('release_worker_lock', { p_name: LOCK_NAME }));

  // Answer straight away and keep working in the background, so the
  // scheduler's request timeout can't cut a run off part-way.
  if (typeof EdgeRuntime !== 'undefined' && EdgeRuntime?.waitUntil) {
    EdgeRuntime.waitUntil(work);
    return json({ message: 'Run started' }, 202);
  }
  return json(await work);
});
