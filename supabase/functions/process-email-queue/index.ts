import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';
import nodemailer from 'npm:nodemailer@6.9.14';
import {
  DEFAULT_BATCH_SIZE,
  DEFAULT_BATCH_DELAY_MS,
  DAILY_LIMIT_PER_ACCOUNT,
  MAX_SEND_ATTEMPTS,
  SmtpAccount,
  isTemporaryError,
  isPermanentEmailError,
  htmlToText,
  normalizeBodyHtml,
  buildDripLoveHtml,
  getErrorMessage,
  loadAccounts,
} from '../_shared/email-utils.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const MAX_QUEUE_ROWS_PER_RUN = 2000; // Safety cap per cron tick.

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const host = Deno.env.get('SMTP_HOST');
    const port = Number(Deno.env.get('SMTP_PORT') || 587);
    const secure = (Deno.env.get('SMTP_SECURE') || String(port === 465)).toLowerCase() === 'true';
    const accounts = loadAccounts();

    if (!host || accounts.length === 0) {
      return new Response(
        JSON.stringify({ message: 'SMTP not configured, nothing to do', processed: 0 }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { data: pendingRows, error: fetchError } = await supabase
      .from('email_send_queue')
      .select('id, broadcast_id, recipient, attempt_count')
      .eq('status', 'pending')
      .order('created_at', { ascending: true })
      .limit(MAX_QUEUE_ROWS_PER_RUN);

    if (fetchError) throw fetchError;

    if (!pendingRows || pendingRows.length === 0) {
      return new Response(
        JSON.stringify({ message: 'No queued emails to send', processed: 0 }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Skip (and immediately fail) any queued recipient that already hard-bounced on
    // an earlier broadcast, instead of leaving it "pending" forever and re-attempting
    // it on every future run of this processor.
    const suppressedEmails = Array.from(new Set(pendingRows.map((r) => r.recipient)));
    const { data: suppressedRows } = await supabase
      .from('email_suppression_list')
      .select('email')
      .in('email', suppressedEmails);
    const suppressedSet = new Set((suppressedRows || []).map((r: { email: string }) => r.email));

    const suppressedRowIds = pendingRows.filter((r) => suppressedSet.has(r.recipient)).map((r) => r.id);
    if (suppressedRowIds.length > 0) {
      await supabase
        .from('email_send_queue')
        .update({ status: 'failed', error: 'Suppressed: previously failed permanently (invalid/non-existent mailbox)' })
        .in('id', suppressedRowIds);
    }
    const sendableRows = pendingRows.filter((r) => !suppressedSet.has(r.recipient));

    if (sendableRows.length === 0) {
      return new Response(
        JSON.stringify({ message: 'All queued emails were suppressed', processed: 0, suppressed: suppressedRowIds.length }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Figure out remaining quota per account for today.
    const today = new Date().toISOString().slice(0, 10);
    const { data: usageRows } = await supabase
      .from('email_account_usage')
      .select('account_email, sent_count')
      .in('account_email', accounts.map((a) => a.email))
      .eq('send_date', today);

    const usedByAccount = new Map<string, number>();
    (usageRows || []).forEach((row: { account_email: string; sent_count: number }) => {
      usedByAccount.set(row.account_email, row.sent_count);
    });

    // Assign pending rows to accounts with remaining capacity, in queue order.
    let cursor = 0;
    const assignments: Array<{ account: SmtpAccount; rows: typeof sendableRows }> = [];
    for (const account of accounts) {
      const used = usedByAccount.get(account.email) || 0;
      const remaining = Math.max(0, DAILY_LIMIT_PER_ACCOUNT - used);
      if (remaining === 0 || cursor >= sendableRows.length) continue;

      const rows = sendableRows.slice(cursor, cursor + remaining);
      cursor += rows.length;
      if (rows.length > 0) assignments.push({ account, rows });
    }

    if (assignments.length === 0) {
      return new Response(
        JSON.stringify({ message: 'All accounts are out of quota today; will retry next run', processed: 0, stillQueued: sendableRows.length, suppressed: suppressedRowIds.length }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Group the assigned rows by broadcast so we can batch-fetch each broadcast's content once.
    const broadcastIds = Array.from(new Set(sendableRows.slice(0, cursor).map((r) => r.broadcast_id)));
    const { data: broadcasts, error: broadcastsError } = await supabase
      .from('email_broadcast_history')
      .select('id, subject, message, successful_sends, failed_sends')
      .in('id', broadcastIds);

    if (broadcastsError) throw broadcastsError;

    const broadcastMap = new Map((broadcasts || []).map((b) => [b.id, b]));
    const successByBroadcast = new Map<string, number>();
    const failedByBroadcast = new Map<string, number>();

    let totalSent = 0;
    let totalFailed = 0;
    let totalRetrying = 0;
    const newlySuppressed: Array<{ email: string; error: string; broadcastId: string }> = [];

    for (const { account, rows } of assignments) {
      const transporter = nodemailer.createTransport({
        host,
        port,
        secure,
        auth: { user: account.email, pass: account.pass },
      });

      let sentFromThisAccount = 0;
      let hitQuota = false;
      let nextIndex = 0;

      for (; nextIndex < rows.length; nextIndex += DEFAULT_BATCH_SIZE) {
        if (hitQuota) break;
        const chunk = rows.slice(nextIndex, nextIndex + DEFAULT_BATCH_SIZE);

        const results = await Promise.allSettled(
          chunk.map(async (row) => {
            const broadcast = broadcastMap.get(row.broadcast_id);
            if (!broadcast) throw new Error('Broadcast no longer exists');

            const brandedHtml = buildDripLoveHtml(broadcast.subject, broadcast.message);
            const brandedText = htmlToText(normalizeBodyHtml(broadcast.message));

            return transporter.sendMail({
              from: account.fromName ? `${account.fromName} <${account.email}>` : account.email,
              to: row.recipient,
              subject: broadcast.subject,
              html: brandedHtml,
              text: brandedText,
            });
          })
        );

        const rowUpdates: Array<{ id: string; status: 'sent' | 'failed' | 'pending'; error?: string; attempt_count?: number }> = [];

        results.forEach((result, idx) => {
          const row = chunk[idx];
          if (result.status === 'fulfilled') {
            rowUpdates.push({ id: row.id, status: 'sent' });
            successByBroadcast.set(row.broadcast_id, (successByBroadcast.get(row.broadcast_id) || 0) + 1);
            totalSent += 1;
          } else {
            const message = getErrorMessage(result.reason);
            const nextAttempt = (row.attempt_count || 0) + 1;

            if (isPermanentEmailError(message)) {
              // Hard bounce: this address will never succeed. Suppress it from every
              // future broadcast instead of leaving it to be re-queued and re-attempted
              // forever.
              rowUpdates.push({ id: row.id, status: 'failed', error: message, attempt_count: nextAttempt });
              newlySuppressed.push({ email: row.recipient, error: message, broadcastId: row.broadcast_id });
              failedByBroadcast.set(row.broadcast_id, (failedByBroadcast.get(row.broadcast_id) || 0) + 1);
              totalFailed += 1;
            } else if (isTemporaryError(message) && nextAttempt < MAX_SEND_ATTEMPTS) {
              // Rate-limited / temporarily rejected, and still has retries left -
              // put it back to pending so the *next* run of this processor (once
              // any account has quota again) picks it up automatically.
              rowUpdates.push({ id: row.id, status: 'pending', error: message, attempt_count: nextAttempt });
              totalRetrying += 1;
              hitQuota = true; // Stop using this account for the rest of this run.
            } else {
              // Either a non-transient error we don't recognize, or a transient
              // one that has now exhausted its retries - give up on this one
              // instead of looping forever, but it's NOT suppressed (we never
              // confirmed the address itself is bad, just that sending kept
              // failing) so a future manual resend can still try it.
              rowUpdates.push({ id: row.id, status: 'failed', error: message, attempt_count: nextAttempt });
              failedByBroadcast.set(row.broadcast_id, (failedByBroadcast.get(row.broadcast_id) || 0) + 1);
              totalFailed += 1;
            }
          }
          sentFromThisAccount += 1;
        });

        await Promise.all(
          rowUpdates.map((u) =>
            supabase
              .from('email_send_queue')
              .update({
                status: u.status,
                error: u.error ?? null,
                attempt_count: u.attempt_count,
                sent_at: u.status === 'sent' ? new Date().toISOString() : null,
              })
              .eq('id', u.id)
          )
        );

        if (!hitQuota && nextIndex + DEFAULT_BATCH_SIZE < rows.length) {
          await new Promise((resolve) => setTimeout(resolve, DEFAULT_BATCH_DELAY_MS));
        }
      }

      if (sentFromThisAccount > 0) {
        try {
          await supabase.rpc('increment_email_account_usage', {
            p_account_email: account.email,
            p_amount: sentFromThisAccount,
          });
        } catch (usageError) {
          console.error('Failed to record account usage:', usageError);
        }
      }
    }

    // Persist hard bounces so they're never attempted again by any future broadcast.
    if (newlySuppressed.length > 0) {
      const rows = newlySuppressed.map(({ email, error, broadcastId }) => ({
        email,
        reason: 'hard_bounce',
        last_error: error,
        broadcast_id: broadcastId,
      }));
      const { error: suppressError } = await supabase
        .from('email_suppression_list')
        .upsert(rows, { onConflict: 'email' });
      if (suppressError) console.error('Failed to record suppressed emails:', suppressError);
    }

    // Update each affected broadcast's totals and mark it completed if nothing's pending anymore.
    for (const broadcastId of broadcastIds) {
      const broadcast = broadcastMap.get(broadcastId);
      if (!broadcast) continue;

      const { count: stillPending } = await supabase
        .from('email_send_queue')
        .select('*', { count: 'exact', head: true })
        .eq('broadcast_id', broadcastId)
        .eq('status', 'pending');

      await supabase
        .from('email_broadcast_history')
        .update({
          successful_sends: (broadcast.successful_sends || 0) + (successByBroadcast.get(broadcastId) || 0),
          failed_sends: (broadcast.failed_sends || 0) + (failedByBroadcast.get(broadcastId) || 0),
          status: !stillPending || stillPending === 0 ? 'completed' : 'partial',
        })
        .eq('id', broadcastId);
    }

    return new Response(
      JSON.stringify({
        message: 'Queue processing complete',
        processed: totalSent + totalFailed + totalRetrying,
        sent: totalSent,
        failed: totalFailed,
        retrying: totalRetrying,
        suppressed: suppressedRowIds.length,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Email queue processor error:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    );
  }
});
