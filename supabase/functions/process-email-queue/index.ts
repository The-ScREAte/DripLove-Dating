import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';
import nodemailer from 'npm:nodemailer@6.9.14';
import {
  MAX_PER_ACCOUNT_PER_RUN,
  PRIMARY_CONCURRENCY,
  SEND_CONCURRENCY,
  SEND_PAUSE_MS,
  SmtpAccount,
  EmailFailureType,
  classifyEmailError,
  isSenderProblem,
  loadPausedAccounts,
  pauseSender,
  markSenderHealthy,
  holdRecipient,
  loadUnsubscribeSecret,
  buildUnsubscribeUrl,
  unsubscribeHeaders,
  fromAddress,
  smtpTransportOptions,
  htmlToText,
  normalizeBodyHtml,
  buildDripLoveHtml,
  getErrorMessage,
  kickEmailQueue,
  loadAccounts,
} from '../_shared/email-utils.ts';

// Sends everything in email_send_queue - admin email broadcasts, scheduled
// broadcasts and the likes/matches emails - the moment it's due. A new row
// starts a run straight away (trigger on email_send_queue); a schedule every
// minute is the safety net and sends scheduled emails at their time.
//
// Every email goes out through the primary account (info@driplove.love). The
// Gmail backups only send while the primary is paused - and if a send fails
// because of OUR account, the same email is tried on the next account at once.
//
// When a send fails because of the recipient:
//   address doesn't exist         -> the address is put on hold right away
//   anything else (mailbox full,  -> retried after 2, 10 and 30 minutes, then
//   "try later", refused)            put on hold
// Held emails wait; email-sender-health-check checks the address again later
// and puts them back in the queue once it's reachable.

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const LOCK_NAME = 'process-email-queue';
const LOCK_SECONDS = 240;
// Stop picking up new batches after this long; a fresh run carries on.
const RUN_BUDGET_MS = 100_000;
const BATCH_SIZE = 60;
const QUICK_RETRY_MINUTES = [2, 10, 30];

declare const EdgeRuntime: { waitUntil(promise: Promise<unknown>): void } | undefined;

type QueueRow = {
  id: string;
  broadcast_id: string | null;
  recipient: string;
  attempt_count: number | null;
  kind: string;
  subject: string | null;
  preheader: string | null;
  html: string | null;
  text_body: string | null;
};

type Broadcast = { id: string; subject: string; message: string };

type Outcome =
  | { ok: true; account: SmtpAccount }
  | { ok: false; senderOnly: true; message: string }
  | { ok: false; senderOnly: false; type: EmailFailureType; message: string };

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function updateRow(supabase: SupabaseClient, id: string, fields: Record<string, unknown>) {
  const { error } = await supabase.from('email_send_queue').update(fields).eq('id', id);
  if (error) console.error(`Failed to update queue row ${id}:`, error);
}

async function runQueue(supabase: SupabaseClient, supabaseUrl: string) {
  const started = Date.now();
  const summary = {
    sent: 0, held: 0, retrying: 0, unsubscribed: 0,
    sentBy: {} as Record<string, number>, pausedNow: [] as string[], more: false, message: '',
  };

  const configured = loadAccounts();
  if (configured.length === 0) {
    summary.message = 'SMTP not configured';
    return summary;
  }

  const paused = await loadPausedAccounts(supabase);
  const today = new Date().toISOString().slice(0, 10);
  const { data: usageRows } = await supabase
    .from('email_account_usage')
    .select('account_email, sent_count')
    .in('account_email', configured.map((a) => a.email))
    .eq('send_date', today);
  const usedToday = new Map<string, number>();
  (usageRows || []).forEach((r: { account_email: string; sent_count: number }) => usedToday.set(r.account_email, r.sent_count));

  // Per-run bookkeeping.
  const attemptsThisRun = new Map<string, number>();
  const successesThisRun = new Map<string, number>();
  const transporters = new Map<string, ReturnType<typeof nodemailer.createTransport>>();
  const transporterFor = (account: SmtpAccount) => {
    let t = transporters.get(account.email);
    if (!t) {
      t = nodemailer.createTransport({
        ...smtpTransportOptions(account),
        pool: true,
        maxConnections: account.primary ? PRIMARY_CONCURRENCY : SEND_CONCURRENCY,
      });
      transporters.set(account.email, t);
    }
    return t;
  };

  // Accounts that can take another email right now, primary first.
  const usable = () => configured.filter((a) => {
    if (paused.has(a.email)) return false;
    const attempts = attemptsThisRun.get(a.email) || 0;
    if ((usedToday.get(a.email) || 0) + attempts >= a.dailyLimit) return false;
    return a.primary || attempts < MAX_PER_ACCOUNT_PER_RUN;
  });

  const pauseInRun = async (account: SmtpAccount, type: EmailFailureType, message: string) => {
    if (paused.has(account.email)) return;
    paused.add(account.email);
    summary.pausedNow.push(account.email);
    await pauseSender(supabase, account.email, type, message);
  };

  const unsubscribeSecret = await loadUnsubscribeSecret(supabase);
  const broadcastCache = new Map<string, Broadcast | null>();
  const sentByBroadcast = new Map<string, number>();
  const touchedBroadcasts = new Set<string>();

  const compose = async (row: QueueRow) => {
    const recipient = row.recipient.trim().toLowerCase();
    let subject = row.subject;
    let bodyHtml = row.html;
    let bodyText = row.text_body;
    if (row.kind === 'broadcast' || !bodyHtml) {
      const broadcast = row.broadcast_id ? broadcastCache.get(row.broadcast_id) : undefined;
      if (!broadcast) throw new Error('Broadcast no longer exists');
      subject = broadcast.subject;
      bodyHtml = broadcast.message;
      bodyText = null;
    }
    const unsubscribeUrl = unsubscribeSecret
      ? await buildUnsubscribeUrl(supabaseUrl, unsubscribeSecret, recipient)
      : undefined;
    const text = (bodyText || htmlToText(normalizeBodyHtml(bodyHtml || '')))
      + (unsubscribeUrl ? `\n\n--\nDripLove\nUnsubscribe: ${unsubscribeUrl}` : '');
    return {
      to: recipient,
      subject: subject || 'DripLove',
      html: buildDripLoveHtml(subject || 'DripLove', bodyHtml || '', {
        preheader: row.preheader || undefined,
        unsubscribeUrl,
      }),
      text,
      headers: unsubscribeUrl ? unsubscribeHeaders(unsubscribeUrl) : undefined,
    };
  };

  // Try the email on each usable account in turn until one takes it or the
  // recipient is clearly the problem.
  const deliver = async (row: QueueRow): Promise<Outcome> => {
    const mail = await compose(row);
    let lastMessage = 'No sending account available';
    for (const account of usable()) {
      attemptsThisRun.set(account.email, (attemptsThisRun.get(account.email) || 0) + 1);
      try {
        await transporterFor(account).sendMail({ from: fromAddress(account), ...mail });
        successesThisRun.set(account.email, (successesThisRun.get(account.email) || 0) + 1);
        return { ok: true, account };
      } catch (error) {
        const message = getErrorMessage(error);
        const type = classifyEmailError(message);
        if (!isSenderProblem(type)) return { ok: false, senderOnly: false, type, message };
        lastMessage = message;
        await pauseInRun(account, type, message);
      }
    }
    return { ok: false, senderOnly: true, message: lastMessage };
  };

  let stop = '';
  while (!stop) {
    if (Date.now() - started > RUN_BUDGET_MS) {
      stop = 'time';
      break;
    }
    const accountsNow = usable();
    if (accountsNow.length === 0) {
      stop = paused.size >= configured.length ? 'all_paused' : 'limits';
      break;
    }

    const { data: due, error: dueError } = await supabase
      .from('email_send_queue')
      .select('id, broadcast_id, recipient, attempt_count, kind, subject, preheader, html, text_body')
      .eq('status', 'pending')
      .or(`next_attempt_at.is.null,next_attempt_at.lte.${new Date().toISOString()}`)
      .order('priority', { ascending: true })
      .order('created_at', { ascending: true })
      .limit(BATCH_SIZE);
    if (dueError) throw dueError;
    const rows = (due || []) as QueueRow[];
    if (rows.length === 0) {
      stop = 'done';
      break;
    }

    // Addresses that unsubscribed never get email; addresses on hold wait.
    const recipients = Array.from(new Set(rows.map((r) => r.recipient.trim().toLowerCase())));
    const { data: blockedRows } = await supabase
      .from('email_suppression_list')
      .select('email, reason')
      .in('email', recipients)
      .is('released_at', null);
    const blocked = new Map((blockedRows || []).map((r: { email: string; reason: string }) => [r.email, r.reason]));
    const sendable: QueueRow[] = [];
    for (const row of rows) {
      const reason = blocked.get(row.recipient.trim().toLowerCase());
      if (reason === 'unsubscribed') {
        summary.unsubscribed += 1;
        await updateRow(supabase, row.id, {
          status: 'failed', failure_type: 'suppressed', error: 'Not sent: unsubscribed',
        });
      } else if (reason) {
        summary.held += 1;
        await updateRow(supabase, row.id, {
          status: 'held', failure_type: 'suppressed', error: `On hold: the address failed before (${reason})`,
        });
      } else {
        sendable.push(row);
      }
    }

    const missing = Array.from(new Set(sendable.map((r) => r.broadcast_id).filter((id) => id && !broadcastCache.has(id)))) as string[];
    if (missing.length > 0) {
      const { data: broadcasts, error } = await supabase
        .from('email_broadcast_history')
        .select('id, subject, message')
        .in('id', missing);
      if (error) throw error;
      missing.forEach((id) => broadcastCache.set(id, null));
      (broadcasts || []).forEach((b: Broadcast) => broadcastCache.set(b.id, b));
    }
    // A broadcast deleted after it was queued has nothing left to send.
    for (let i = sendable.length - 1; i >= 0; i--) {
      const row = sendable[i];
      if ((row.kind === 'broadcast' || !row.html) && !(row.broadcast_id && broadcastCache.get(row.broadcast_id))) {
        sendable.splice(i, 1);
        await updateRow(supabase, row.id, { status: 'failed', failure_type: 'cancelled', error: 'Broadcast no longer exists' });
      }
    }

    const newlyHeld = new Set<string>();
    for (let i = 0; i < sendable.length; ) {
      const primaryUp = usable().some((a) => a.primary);
      const width = primaryUp ? PRIMARY_CONCURRENCY : SEND_CONCURRENCY;
      const chunk = sendable.slice(i, i + width);
      i += chunk.length;
      const outcomes = await Promise.all(chunk.map((row) => deliver(row)));

      for (let idx = 0; idx < chunk.length; idx++) {
        const row = chunk[idx];
        const outcome = outcomes[idx];
        const recipient = row.recipient.trim().toLowerCase();
        if (row.broadcast_id) touchedBroadcasts.add(row.broadcast_id);

        if (outcome.ok) {
          summary.sent += 1;
          summary.sentBy[outcome.account.email] = (summary.sentBy[outcome.account.email] || 0) + 1;
          if (row.broadcast_id) sentByBroadcast.set(row.broadcast_id, (sentByBroadcast.get(row.broadcast_id) || 0) + 1);
          await updateRow(supabase, row.id, {
            status: 'sent',
            sent_at: new Date().toISOString(),
            account_email: outcome.account.email,
            error: null,
            failure_type: null,
            next_attempt_at: null,
          });
          continue;
        }

        if (outcome.senderOnly) {
          // Every account failed on its own side - nothing to hold against
          // the recipient. It goes as soon as an account is back.
          summary.retrying += 1;
          await updateRow(supabase, row.id, { status: 'pending', error: outcome.message, failure_type: 'sender_unavailable' });
          continue;
        }

        const attempt = (row.attempt_count || 0) + 1;
        const quickRetry = outcome.type !== 'recipient_invalid' && attempt <= QUICK_RETRY_MINUTES.length
          && !newlyHeld.has(recipient);
        if (quickRetry) {
          summary.retrying += 1;
          await updateRow(supabase, row.id, {
            status: 'pending',
            error: outcome.message,
            failure_type: outcome.type,
            attempt_count: attempt,
            next_attempt_at: new Date(Date.now() + QUICK_RETRY_MINUTES[attempt - 1] * 60_000).toISOString(),
          });
          continue;
        }

        summary.held += 1;
        await updateRow(supabase, row.id, {
          status: 'held', error: outcome.message, failure_type: outcome.type, attempt_count: attempt, next_attempt_at: null,
        });
        if (!newlyHeld.has(recipient)) {
          newlyHeld.add(recipient);
          await holdRecipient(supabase, recipient, outcome.type, outcome.message);
        }
      }

      if (usable().length === 0) break;
      if (!primaryUp && i < sendable.length) await sleep(SEND_PAUSE_MS);
    }
  }

  transporters.forEach((t) => t.close());

  for (const [accountEmail, attempts] of attemptsThisRun) {
    const { error } = await supabase.rpc('increment_email_account_usage', {
      p_account_email: accountEmail,
      p_amount: attempts,
    });
    if (error) console.error('Failed to record account usage:', error);
    if ((successesThisRun.get(accountEmail) || 0) > 0 && !paused.has(accountEmail)) {
      await markSenderHealthy(supabase, accountEmail);
    }
  }

  for (const broadcastId of touchedBroadcasts) {
    const [{ data: history }, { count: stillWaiting }] = await Promise.all([
      supabase.from('email_broadcast_history').select('successful_sends').eq('id', broadcastId).maybeSingle(),
      supabase
        .from('email_send_queue')
        .select('id', { count: 'exact', head: true })
        .eq('broadcast_id', broadcastId)
        .in('status', ['pending', 'held']),
    ]);
    if (!history) continue;
    await supabase
      .from('email_broadcast_history')
      .update({
        successful_sends: (history.successful_sends || 0) + (sentByBroadcast.get(broadcastId) || 0),
        status: stillWaiting ? 'partial' : 'completed',
      })
      .eq('id', broadcastId);
  }

  summary.more = stop === 'time';
  summary.message = `Queue run complete (${stop})`;
  console.log('process-email-queue:', JSON.stringify(summary));
  return summary;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
  const supabase = createClient(supabaseUrl, serviceKey);

  // One run at a time - new emails, the schedule and the admin screen can all
  // start one, and overlapping runs would send duplicates. A run already going
  // picks up new emails on its next batch.
  const { data: gotLock, error: lockError } = await supabase.rpc('try_acquire_worker_lock', {
    p_name: LOCK_NAME,
    p_seconds: LOCK_SECONDS,
  });
  if (lockError) {
    console.error('Worker lock error:', lockError);
    return new Response(JSON.stringify({ error: 'Could not take the queue lock' }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500,
    });
  }
  if (!gotLock) {
    return new Response(JSON.stringify({ message: 'Another run is in progress' }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const work = runQueue(supabase, supabaseUrl)
    .catch((error) => {
      console.error('Email queue processor error:', error);
      return { error: error instanceof Error ? error.message : 'Unknown error', more: false };
    })
    .then(async (result) => {
      await supabase.rpc('release_worker_lock', { p_name: LOCK_NAME });
      // Out of time with emails still due: carry straight on in a fresh run.
      if ((result as { more?: boolean }).more) await kickEmailQueue(supabaseUrl, serviceKey);
      return result;
    });

  // Answer straight away and keep sending in the background, so callers (the
  // trigger, the schedule, the admin screen) aren't cut off by their timeouts.
  if (typeof EdgeRuntime !== 'undefined' && EdgeRuntime?.waitUntil) {
    EdgeRuntime.waitUntil(work);
    return new Response(JSON.stringify({ message: 'Queue run started' }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 202,
    });
  }
  const result = await work;
  return new Response(JSON.stringify(result), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
});
