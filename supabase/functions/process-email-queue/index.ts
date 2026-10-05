import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';
import nodemailer from 'npm:nodemailer@6.9.14';
import {
  DAILY_LIMIT_PER_ACCOUNT,
  MAX_SEND_ATTEMPTS,
  MAX_PER_ACCOUNT_PER_RUN,
  SEND_CONCURRENCY,
  SEND_PAUSE_MS,
  SmtpAccount,
  classifyEmailError,
  isSenderProblem,
  loadPausedAccounts,
  pauseSender,
  markSenderHealthy,
  loadUnsubscribeSecret,
  buildUnsubscribeUrl,
  unsubscribeHeaders,
  fromAddress,
  smtpConfig,
  htmlToText,
  normalizeBodyHtml,
  buildDripLoveHtml,
  getErrorMessage,
  loadAccounts,
} from '../_shared/email-utils.ts';

// Sends everything in email_send_queue - admin email broadcasts and the
// likes/matches emails - in small steady batches (every 5 minutes, see
// 20261005110000_email_sender_health.sql), likes/matches first.
//
// When a send fails, who is at fault decides what happens:
//   our account (sending limit, login, blocked, connection)
//       -> the email stays queued, the account is paused and pinged later by
//          email-sender-health-check; nothing is held against the recipient
//   the address doesn't exist -> failed, and never emailed again
//   anything else (mailbox full, "try later", refused) -> retried later with
//       growing gaps, then given up after MAX_SEND_ATTEMPTS

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const LOCK_NAME = 'process-email-queue';
const LOCK_SECONDS = 240;
const RETRY_MINUTES = [15, 60, 180, 720];

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

type Broadcast = { id: string; subject: string; message: string; successful_sends: number | null; failed_sends: number | null };

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function updateRow(supabase: SupabaseClient, id: string, fields: Record<string, unknown>) {
  const { error } = await supabase.from('email_send_queue').update(fields).eq('id', id);
  if (error) console.error(`Failed to update queue row ${id}:`, error);
}

async function runQueue(supabase: SupabaseClient, supabaseUrl: string) {
  const summary = { sent: 0, failed: 0, retrying: 0, suppressed: 0, pausedNow: [] as string[], message: '' };

  const smtp = smtpConfig();
  const configured = loadAccounts();
  if (!smtp || configured.length === 0) {
    summary.message = 'SMTP not configured';
    return summary;
  }

  const paused = await loadPausedAccounts(supabase);
  const accounts = configured.filter((a) => !paused.has(a.email));
  if (accounts.length === 0) {
    summary.message = 'Every sending account is paused - waiting for the health check';
    return summary;
  }

  // How many each account may send this run (daily limit and pacing).
  const today = new Date().toISOString().slice(0, 10);
  const { data: usageRows } = await supabase
    .from('email_account_usage')
    .select('account_email, sent_count')
    .in('account_email', accounts.map((a) => a.email))
    .eq('send_date', today);
  const used = new Map<string, number>();
  (usageRows || []).forEach((r: { account_email: string; sent_count: number }) => used.set(r.account_email, r.sent_count));

  const slots = accounts
    .map((account) => ({
      account,
      take: Math.min(MAX_PER_ACCOUNT_PER_RUN, Math.max(0, DAILY_LIMIT_PER_ACCOUNT - (used.get(account.email) || 0))),
    }))
    .filter((s) => s.take > 0);
  const capacity = slots.reduce((sum, s) => sum + s.take, 0);
  if (capacity === 0) {
    summary.message = 'Daily limit reached on every account - continuing tomorrow';
    return summary;
  }

  const nowIso = new Date().toISOString();
  const { data: due, error: dueError } = await supabase
    .from('email_send_queue')
    .select('id, broadcast_id, recipient, attempt_count, kind, subject, preheader, html, text_body')
    .eq('status', 'pending')
    .or(`next_attempt_at.is.null,next_attempt_at.lte.${nowIso}`)
    .order('priority', { ascending: true })
    .order('created_at', { ascending: true })
    .limit(capacity * 2);
  if (dueError) throw dueError;
  const rows = (due || []) as QueueRow[];
  if (rows.length === 0) {
    summary.message = 'Nothing due';
    return summary;
  }

  // Never email blocked addresses (bounced or unsubscribed).
  const recipients = Array.from(new Set(rows.map((r) => r.recipient.trim().toLowerCase())));
  const { data: blockedRows } = await supabase
    .from('email_suppression_list')
    .select('email')
    .in('email', recipients)
    .is('released_at', null);
  const blocked = new Set((blockedRows || []).map((r: { email: string }) => r.email));
  const sendable: QueueRow[] = [];
  for (const row of rows) {
    if (blocked.has(row.recipient.trim().toLowerCase())) {
      await updateRow(supabase, row.id, {
        status: 'failed',
        failure_type: 'suppressed',
        error: 'Not sent: address bounced before or unsubscribed',
      });
      summary.suppressed += 1;
    } else if (sendable.length < capacity) {
      sendable.push(row);
    }
  }
  if (sendable.length === 0) {
    summary.message = 'Only blocked addresses were due';
    return summary;
  }

  const broadcastIds = Array.from(new Set(sendable.map((r) => r.broadcast_id).filter(Boolean))) as string[];
  const broadcastMap = new Map<string, Broadcast>();
  if (broadcastIds.length > 0) {
    const { data: broadcasts, error } = await supabase
      .from('email_broadcast_history')
      .select('id, subject, message, successful_sends, failed_sends')
      .in('id', broadcastIds);
    if (error) throw error;
    (broadcasts || []).forEach((b: Broadcast) => broadcastMap.set(b.id, b));
  }
  const sentByBroadcast = new Map<string, number>();
  const failedByBroadcast = new Map<string, number>();
  const bump = (map: Map<string, number>, id: string | null) => {
    if (id) map.set(id, (map.get(id) || 0) + 1);
  };

  const unsubscribeSecret = await loadUnsubscribeSecret(supabase);
  const newlySuppressed: Array<{ email: string; error: string; broadcastId: string | null }> = [];

  // Hand rows to accounts in queue order.
  let cursor = 0;
  const assignments: Array<{ account: SmtpAccount; rows: QueueRow[] }> = [];
  for (const slot of slots) {
    if (cursor >= sendable.length) break;
    const chunk = sendable.slice(cursor, cursor + slot.take);
    cursor += chunk.length;
    assignments.push({ account: slot.account, rows: chunk });
  }

  for (const { account, rows: accountRows } of assignments) {
    const transporter = nodemailer.createTransport({
      host: smtp.host,
      port: smtp.port,
      secure: smtp.secure,
      auth: { user: account.email, pass: account.pass },
    });

    let attempts = 0;
    let successes = 0;
    let accountPaused = false;

    for (let i = 0; i < accountRows.length && !accountPaused; i += SEND_CONCURRENCY) {
      const chunk = accountRows.slice(i, i + SEND_CONCURRENCY);
      const results = await Promise.allSettled(chunk.map(async (row) => {
        const recipient = row.recipient.trim().toLowerCase();
        let subject = row.subject;
        let bodyHtml = row.html;
        let bodyText = row.text_body;
        if (row.kind === 'broadcast' || !bodyHtml) {
          const broadcast = row.broadcast_id ? broadcastMap.get(row.broadcast_id) : undefined;
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
        return transporter.sendMail({
          from: fromAddress(account),
          to: recipient,
          subject: subject || 'DripLove',
          html: buildDripLoveHtml(subject || 'DripLove', bodyHtml || '', {
            preheader: row.preheader || undefined,
            unsubscribeUrl,
          }),
          text,
          headers: unsubscribeUrl ? unsubscribeHeaders(unsubscribeUrl) : undefined,
        });
      }));

      for (let idx = 0; idx < results.length; idx++) {
        const result = results[idx];
        const row = chunk[idx];
        attempts += 1;

        if (result.status === 'fulfilled') {
          successes += 1;
          summary.sent += 1;
          bump(sentByBroadcast, row.broadcast_id);
          await updateRow(supabase, row.id, {
            status: 'sent',
            sent_at: new Date().toISOString(),
            account_email: account.email,
            error: null,
            failure_type: null,
            next_attempt_at: null,
          });
          continue;
        }

        const message = getErrorMessage(result.reason);
        const type = classifyEmailError(message);

        if (isSenderProblem(type)) {
          // Our account's problem - keep the email exactly as it was (no
          // attempt used up) and stop using this account until it's checked.
          summary.retrying += 1;
          await updateRow(supabase, row.id, { status: 'pending', error: message, failure_type: type });
          if (!accountPaused) {
            accountPaused = true;
            summary.pausedNow.push(account.email);
            await pauseSender(supabase, account.email, type, message);
          }
          continue;
        }

        const attempt = (row.attempt_count || 0) + 1;
        if (type === 'recipient_invalid') {
          summary.failed += 1;
          bump(failedByBroadcast, row.broadcast_id);
          newlySuppressed.push({ email: row.recipient.trim().toLowerCase(), error: message, broadcastId: row.broadcast_id });
          await updateRow(supabase, row.id, { status: 'failed', error: message, failure_type: type, attempt_count: attempt });
        } else if (attempt < MAX_SEND_ATTEMPTS) {
          summary.retrying += 1;
          const waitMinutes = RETRY_MINUTES[Math.min(attempt - 1, RETRY_MINUTES.length - 1)];
          await updateRow(supabase, row.id, {
            status: 'pending',
            error: message,
            failure_type: type,
            attempt_count: attempt,
            next_attempt_at: new Date(Date.now() + waitMinutes * 60_000).toISOString(),
          });
        } else {
          summary.failed += 1;
          bump(failedByBroadcast, row.broadcast_id);
          await updateRow(supabase, row.id, { status: 'failed', error: message, failure_type: type, attempt_count: attempt });
        }
      }

      if (!accountPaused && i + SEND_CONCURRENCY < accountRows.length) await sleep(SEND_PAUSE_MS);
    }

    if (attempts > 0) {
      const { error } = await supabase.rpc('increment_email_account_usage', {
        p_account_email: account.email,
        p_amount: attempts,
      });
      if (error) console.error('Failed to record account usage:', error);
    }
    if (successes > 0 && !accountPaused) await markSenderHealthy(supabase, account.email);
  }

  if (newlySuppressed.length > 0) {
    const { error } = await supabase.from('email_suppression_list').upsert(
      newlySuppressed.map(({ email, error: lastError, broadcastId }) => ({
        email,
        reason: 'hard_bounce',
        last_error: lastError,
        broadcast_id: broadcastId,
        released_at: null,
        released_reason: null,
      })),
      { onConflict: 'email' },
    );
    if (error) console.error('Failed to record bounced addresses:', error);
  }

  for (const broadcastId of broadcastIds) {
    const broadcast = broadcastMap.get(broadcastId);
    if (!broadcast) continue;
    const { count: stillPending } = await supabase
      .from('email_send_queue')
      .select('id', { count: 'exact', head: true })
      .eq('broadcast_id', broadcastId)
      .eq('status', 'pending');
    await supabase
      .from('email_broadcast_history')
      .update({
        successful_sends: (broadcast.successful_sends || 0) + (sentByBroadcast.get(broadcastId) || 0),
        failed_sends: (broadcast.failed_sends || 0) + (failedByBroadcast.get(broadcastId) || 0),
        status: stillPending ? 'partial' : 'completed',
      })
      .eq('id', broadcastId);
  }

  summary.message = 'Queue run complete';
  console.log('process-email-queue:', JSON.stringify(summary));
  return summary;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
  const supabase = createClient(supabaseUrl, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '');

  // One run at a time - the schedule, a new broadcast and the likes/matches
  // job can all start one, and overlapping runs would send duplicates.
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
      return { error: error instanceof Error ? error.message : 'Unknown error' };
    })
    .finally(() => supabase.rpc('release_worker_lock', { p_name: LOCK_NAME }));

  // Answer straight away and keep sending in the background, so callers (the
  // schedule, the admin screen) aren't cut off mid-batch by their timeouts.
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
