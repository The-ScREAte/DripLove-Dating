import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';
import nodemailer from 'npm:nodemailer@6.9.14';
import {
  DEFAULT_BATCH_SIZE,
  DEFAULT_BATCH_DELAY_MS,
  DAILY_LIMIT_PER_ACCOUNT,
  SmtpAccount,
  isValidEmail,
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

interface BroadcastEmailRequest {
  recipients: string[];
  subject: string;
  htmlContent: string;
  textContent?: string;
  targetCountries?: string[];
  recipientFilter?: string;
  adminId?: string; // Only honored for trusted service-role calls (e.g. scheduled broadcasts).
}

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const authHeader = req.headers.get('Authorization');
    if (!authHeader) throw new Error('Missing authorization header');

    const token = authHeader.replace('Bearer ', '');

    // Trusted server-to-server call (e.g. from process-scheduled-broadcasts) using the
    // service role key directly — skip the admin-user lookup since the caller is already trusted.
    const isServiceRoleCall = token === supabaseServiceKey;
    let adminId: string | null = null;

    if (!isServiceRoleCall) {
      const { data: { user }, error: userError } = await supabase.auth.getUser(token);
      if (userError || !user) throw new Error('Unauthorized');

      const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('is_admin')
        .eq('id', user.id)
        .single();

      if (profileError || !profile?.is_admin) throw new Error('Forbidden: Admin access required');
      adminId = user.id;
    }

    const body: BroadcastEmailRequest = await req.json();
    const { recipients, subject, htmlContent, textContent, targetCountries, recipientFilter } = body;

    if (isServiceRoleCall && body.adminId) {
      adminId = body.adminId;
    }

    if (!Array.isArray(recipients) || recipients.length === 0) {
      throw new Error('No recipients provided');
    }
    if (!subject || !htmlContent) {
      throw new Error('Subject and htmlContent are required');
    }

    const host = Deno.env.get('SMTP_HOST');
    const port = Number(Deno.env.get('SMTP_PORT') || 587);
    const secure = (Deno.env.get('SMTP_SECURE') || String(port === 465)).toLowerCase() === 'true';

    if (!host) {
      throw new Error('SMTP is not configured (missing SMTP_HOST secret in Supabase)');
    }

    const accounts = loadAccounts();
    if (accounts.length === 0) {
      throw new Error('SMTP is not configured (missing SMTP_USER/SMTP_PASS secrets in Supabase)');
    }

    // Dedupe + validate recipients up front.
    const seen = new Set<string>();
    const formatChecked: string[] = [];
    const invalid: Array<{ email: string; error: string }> = [];

    for (const raw of recipients) {
      const email = String(raw || '').trim().toLowerCase();
      if (!email || seen.has(email)) continue;
      seen.add(email);
      if (!isValidEmail(email)) {
        invalid.push({ email, error: 'Invalid email format' });
        continue;
      }
      formatChecked.push(email);
    }

    // Skip addresses that previously hard-bounced on an earlier broadcast -- this is
    // what stops a permanently-bad address from being re-attempted on every single
    // send (including every occurrence of a recurring/scheduled broadcast) forever.
    const accepted: string[] = [];
    if (formatChecked.length > 0) {
      const { data: suppressedRows } = await supabase
        .from('email_suppression_list')
        .select('email')
        .in('email', formatChecked);
      const suppressedSet = new Set((suppressedRows || []).map((r: { email: string }) => r.email));

      for (const email of formatChecked) {
        if (suppressedSet.has(email)) {
          invalid.push({ email, error: 'Suppressed: previously failed permanently (invalid/non-existent mailbox)' });
        } else {
          accepted.push(email);
        }
      }
    }

    // Check how much quota each account has left today, then hand out recipients
    // to accounts in order until either everyone's assigned or every account is full.
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

    let cursor = 0;
    const assignments: Array<{ account: SmtpAccount; batch: string[] }> = [];
    for (const account of accounts) {
      const used = usedByAccount.get(account.email) || 0;
      const remaining = Math.max(0, DAILY_LIMIT_PER_ACCOUNT - used);
      if (remaining === 0 || cursor >= accepted.length) continue;

      const batch = accepted.slice(cursor, cursor + remaining);
      cursor += batch.length;
      if (batch.length > 0) assignments.push({ account, batch });
    }

    const queued = accepted.slice(cursor); // Nobody had capacity left for these.

    // Create the history row up front so overflow recipients have something to attach to.
    const { data: historyRow, error: historyInsertError } = await supabase
      .from('email_broadcast_history')
      .insert({
        subject,
        message: htmlContent,
        recipient_count: recipients.length,
        successful_sends: 0,
        failed_sends: 0,
        status: 'processing',
        admin_id: adminId,
        target_countries: targetCountries && targetCountries.length > 0 ? targetCountries : null,
        recipient_filter: recipientFilter || null,
      })
      .select()
      .single();

    if (historyInsertError) {
      console.error('Failed to create email history row:', historyInsertError);
    }
    const broadcastId: string | null = historyRow?.id ?? null;

    const brandedHtml = buildDripLoveHtml(subject, htmlContent);
    const brandedText = textContent || htmlToText(normalizeBodyHtml(htmlContent));

    const successful: string[] = [];
    const failed: Array<{ email: string; error: string }> = [...invalid];
    const newlySuppressed: Array<{ email: string; error: string }> = [];
    // Recipients whose actual send attempt failed with a transient error (rate
    // limit, "try again later") - re-queued for automatic retry instead of the
    // old behavior of leaving them permanently stuck in `failed`.
    const toRetry: Array<{ email: string; error: string }> = [];

    for (const { account, batch } of assignments) {
      const transporter = nodemailer.createTransport({
        host,
        port,
        secure,
        auth: { user: account.email, pass: account.pass },
      });

      let sentFromThisAccount = 0;
      let hitQuota = false;
      let nextIndex = 0;

      for (; nextIndex < batch.length; nextIndex += DEFAULT_BATCH_SIZE) {
        if (hitQuota) break; // Stop attempting further chunks once this account is out of quota.
        const chunk = batch.slice(nextIndex, nextIndex + DEFAULT_BATCH_SIZE);

        // Sent concurrently within the chunk, so a quota rejection here only tells us this
        // account is now out of quota — it doesn't retroactively change other results in
        // the same chunk, each of which already got its own real fulfilled/rejected outcome.
        const results = await Promise.allSettled(
          chunk.map((to) =>
            transporter.sendMail({
              from: account.fromName ? `${account.fromName} <${account.email}>` : account.email,
              to,
              subject,
              html: brandedHtml,
              text: brandedText,
            })
          )
        );

        results.forEach((result, idx) => {
          const email = chunk[idx];
          if (result.status === 'fulfilled') {
            successful.push(email);
          } else {
            const message = getErrorMessage(result.reason);
            failed.push({ email, error: message });
            if (isTemporaryError(message)) {
              // The sending account is rate-limited / temporarily rejected -
              // not the recipient's fault. Stop using this account for the
              // rest of this run, and give this recipient another shot later.
              hitQuota = true;
              toRetry.push({ email, error: message });
            } else if (isPermanentEmailError(message)) {
              // Hard bounce: this address will never succeed. Suppress it from every
              // future broadcast instead of letting it get re-attempted forever.
              newlySuppressed.push({ email, error: message });
            }
          }
          sentFromThisAccount += 1; // Every attempt (success or failure) counts against the account's daily quota.
        });

        if (!hitQuota && nextIndex + DEFAULT_BATCH_SIZE < batch.length) {
          await new Promise((resolve) => setTimeout(resolve, DEFAULT_BATCH_DELAY_MS));
        }
      }

      if (hitQuota) {
        // Anything not yet attempted for this account goes back into the pool for the next
        // account (handled by the caller re-pushing to `queued` below).
        queued.push(...batch.slice(nextIndex));
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

    // Persist hard bounces so they're never attempted again by any future broadcast
    // (including every future occurrence of a recurring/scheduled one).
    if (newlySuppressed.length > 0) {
      const rows = newlySuppressed.map(({ email, error }) => ({
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

    // Anything left over (no account had capacity, or a real attempt hit a
    // transient error) goes into the queue for automatic resumption by
    // process-email-queue - this is what lets the retry actually happen once
    // quota resets, instead of the recipient being stuck in `failed` forever.
    const uniqueQueued = Array.from(new Set([...queued, ...toRetry.map((r) => r.email)]));
    if (uniqueQueued.length > 0 && broadcastId) {
      const queueRows = uniqueQueued.map((recipient) => ({ broadcast_id: broadcastId, recipient, attempt_count: 1 }));
      const { error: queueError } = await supabase.from('email_send_queue').insert(queueRows);
      if (queueError) console.error('Failed to queue overflow recipients:', queueError);
    }

    const finalStatus = uniqueQueued.length > 0 ? 'partial' : failed.length > 0 && successful.length === 0 ? 'failed' : 'completed';

    if (broadcastId) {
      await supabase
        .from('email_broadcast_history')
        .update({
          successful_sends: successful.length,
          failed_sends: failed.length,
          status: finalStatus,
          error_details: failed.length > 0 ? failed : null,
        })
        .eq('id', broadcastId);
    }

    return new Response(
      JSON.stringify({
        success: true,
        provider: 'smtp-nodemailer',
        broadcastId,
        results: {
          sent: successful.length,
          failed: failed.length,
          queued: uniqueQueued.length,
          details: { successful, failed, queued: uniqueQueued },
        },
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
    );
  } catch (error) {
    console.error('Broadcast email error:', error);
    return new Response(
      JSON.stringify({ success: false, error: getErrorMessage(error) }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
    );
  }
});
