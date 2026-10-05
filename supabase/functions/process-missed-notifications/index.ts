import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';
import { DAILY_LIMIT_PER_ACCOUNT, kickEmailQueue, loadAccounts, loadPausedAccounts } from '../_shared/email-utils.ts';
import { composeLikeMatchEmail } from '../_shared/notification-email.ts';

// Likes and matches the phone couldn't show - no app, notifications off, or
// the push failed - land in notification_email_queue. send-push-notification
// starts a run for that person immediately; a schedule every 5 minutes is the
// safety net (see 20261005130000_send_when_it_happens_and_local_time_schedules.sql).
//   phone works again -> the push is retried
//   no app / notifications blocked -> an email right away, at most 2 a day;
//     anything beyond that is counted into their next email
// The rules live in claim_missed_notifications.

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

type Item = { id: number; user_id: string; kind: string; title: string | null; body: string | null; data: Record<string, string> | null };

/** What one person is owed, read from the held items themselves. */
type Summary = {
  likes: number;
  matches: number;
  matchSenders: string[];
  messages: number;
  messageSenders: string[];
  notices: Array<{ title: string; body: string | null }>;
};

const summarize = (items: Item[]): Summary => {
  const sum: Summary = { likes: 0, matches: 0, matchSenders: [], messages: 0, messageSenders: [], notices: [] };
  for (const item of items) {
    const sender = item.data?.senderId;
    if (item.kind === 'like') sum.likes += 1;
    else if (item.kind === 'match') {
      sum.matches += 1;
      if (sender) sum.matchSenders.push(sender);
    } else if (item.kind === 'message') {
      sum.messages += 1;
      if (sender) sum.messageSenders.push(sender);
    } else if (item.title) {
      sum.notices.push({ title: item.title, body: item.body });
    }
  }
  return sum;
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

// Retry for pushes that failed (the person's phone can get pushes again).
async function sendPush(supabase: SupabaseClient, due: Due, sum: Summary, names: Map<string, string>): Promise<boolean> {
  const pushes: Array<Record<string, unknown>> = [];
  if (sum.matches > 0) {
    const name = sum.matches === 1 ? names.get(sum.matchSenders[0] ?? '') : undefined;
    pushes.push({
      title: "It's a match! 💕",
      body: name ? `You and ${name} liked each other. Say hello!` : `You have ${sum.matches} new matches. Say hello!`,
      type: 'match', kind: 'match', category: 'event',
      data: { catchup: 'true', ...(sum.matches === 1 && sum.matchSenders[0] ? { senderId: sum.matchSenders[0] } : {}) },
    });
  }
  if (sum.messages > 0) {
    const senders = Array.from(new Set(sum.messageSenders));
    const name = senders.length === 1 ? names.get(senders[0]) : undefined;
    pushes.push({
      title: name ?? 'New messages 💬',
      body: name ? (sum.messages > 1 ? `Sent you ${sum.messages} messages` : 'Sent you a message') : `You have ${sum.messages} new messages`,
      type: 'message', kind: 'message', category: 'event',
      data: { catchup: 'true' },
    });
  }
  if (sum.likes > 0) {
    pushes.push({
      title: sum.likes > 1 ? `${sum.likes} people liked you 👀` : 'Someone liked you 👀',
      body: "See who's interested in you",
      type: 'like', kind: 'like', category: 'event',
      data: { catchup: 'true' },
    });
  }
  for (const notice of sum.notices) {
    pushes.push({
      title: notice.title, body: notice.body ?? '', type: 'system', kind: 'notice', category: 'transactional',
      data: { catchup: 'true' },
    });
  }

  let delivered = false;
  for (const push of pushes) {
    const { data, error } = await supabase.functions.invoke('send-push-notification', {
      body: { userId: due.user_id, ...push },
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

  // The held items themselves (likes, matches, messages, notices).
  const allIds = dueList.flatMap((d) => d.item_ids);
  const itemsByUser = new Map<string, Item[]>();
  for (let i = 0; i < allIds.length; i += 200) {
    const { data: rows, error: itemsError } = await supabase
      .from('notification_email_queue')
      .select('id, user_id, kind, title, body, data')
      .in('id', allIds.slice(i, i + 200));
    if (itemsError) throw itemsError;
    (rows || []).forEach((row: Item) => itemsByUser.set(row.user_id, [...(itemsByUser.get(row.user_id) || []), row]));
  }
  const summaries = new Map(dueList.map((d) => [d.user_id, summarize(itemsByUser.get(d.user_id) || [])]));

  // First names of new matches and of people who sent messages.
  const senderIds = Array.from(new Set(
    Array.from(summaries.values()).flatMap((sum) => [...sum.matchSenders, ...sum.messageSenders]),
  ));
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
    const sum = summaries.get(due.user_id) ?? summarize([]);
    if (due.route === 'push') {
      const ok = await sendPush(supabase, due, sum, names);
      if (ok) {
        tally.pushed += 1;
        await setItems(supabase, due.item_ids, { status: 'pushed', handled_at: now, sent_at: now });
      } else {
        // The push failed again: back in the queue; if the device turned out
        // to be gone, the next run emails them instead.
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
      likeCount: sum.likes,
      matchCount: sum.matches,
      matchNames: sum.matchSenders.map((id) => names.get(id)).filter(Boolean) as string[],
      messageCount: sum.messages,
      messageNames: sum.messageSenders.map((id) => names.get(id)).filter(Boolean) as string[],
      notices: sum.notices,
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

  // Optional { onlyUserIds: [...] } limits a run to those people - the
  // instant run for one person (from send-push-notification) and tests on
  // test accounts.
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

  // One full run at a time; a one-person run only waits for that person
  // (the database also locks per person, so the two can't double-send).
  const lockName = onlyUserIds && onlyUserIds.length === 1 ? `${LOCK_NAME}:${onlyUserIds[0]}` : LOCK_NAME;
  const { data: gotLock, error: lockError } = await supabase.rpc('try_acquire_worker_lock', {
    p_name: lockName,
    p_seconds: 300,
  });
  if (lockError) return json({ error: 'Could not take the lock' }, 500);
  if (!gotLock) return json({ message: 'Another run is in progress' });

  const work = run(supabase, supabaseUrl, serviceKey, onlyUserIds)
    .catch((error) => {
      console.error('process-missed-notifications error:', error);
      return { error: error instanceof Error ? error.message : 'Unknown error' };
    })
    .finally(() => supabase.rpc('release_worker_lock', { p_name: lockName }));

  // Answer straight away and keep working in the background, so the
  // scheduler's request timeout can't cut a run off part-way.
  if (typeof EdgeRuntime !== 'undefined' && EdgeRuntime?.waitUntil) {
    EdgeRuntime.waitUntil(work);
    return json({ message: 'Run started' }, 202);
  }
  return json(await work);
});
