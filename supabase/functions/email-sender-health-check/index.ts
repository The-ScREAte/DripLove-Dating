import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';
import nodemailer from 'npm:nodemailer@6.9.14';
import {
  classifyEmailError,
  isSenderProblem,
  pauseSender,
  markSenderHealthy,
  kickEmailQueue,
  fromAddress,
  smtpTransportOptions,
  getErrorMessage,
  loadAccounts,
} from '../_shared/email-utils.ts';

// "Is it working again?" - for our sending accounts AND for recipients on
// hold. Runs every 5 minutes, only when something is due (see
// 20261006100000_email_send_now_hold_and_release.sql).
//
// Sending accounts: for each paused account whose rest period is over, log in
// to the mail server, and when it was paused for its sending limit (or being
// blocked), also send one tiny email to the account itself - the only real
// proof the limit has lifted. If it works, the account is un-paused and the
// queue starts straight away; if not, it rests longer (6h -> 12h -> 24h).
//
// Recipients on hold: when an address is due for its check, look up whether
// its domain takes email at all. If it does, the address is released and its
// waiting emails go back in the queue - the newest straight away as the real
// test, the rest 20 minutes later unless that one bounces. If not, it's
// checked again later (longer gaps each time).

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const LOCK_NAME = 'email-sender-health-check';

type HealthRow = { account_email: string; pause_reason: string | null; next_check_at: string | null };
type HeldRow = { email: string; reason: string };

const RECHECKS_PER_RUN = 100;

/** Does this domain accept email at all (MX record, or an address record)? */
async function domainTakesEmail(domain: string): Promise<boolean | null> {
  const lookup = async (type: string) => {
    const res = await fetch(`https://dns.google/resolve?name=${encodeURIComponent(domain)}&type=${type}`);
    if (!res.ok) throw new Error(`DNS lookup failed (${res.status})`);
    return await res.json() as { Status: number; Answer?: Array<{ type: number; data: string }> };
  };
  try {
    const mx = await lookup('MX');
    const mxRecords = (mx.Answer || []).filter((a) => a.type === 15);
    if (mxRecords.length > 0) return !mxRecords.every((a) => /^0\s+\.?$/.test(a.data.trim())); // "0 ." = no mail
    if (mx.Status === 3) return false; // domain doesn't exist
    const a = await lookup('A');
    return (a.Answer || []).some((r) => r.type === 1);
  } catch (error) {
    console.warn(`DNS check for ${domain} failed:`, error);
    return null; // couldn't tell - try again next time
  }
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

  const { data: gotLock } = await supabase.rpc('try_acquire_worker_lock', { p_name: LOCK_NAME, p_seconds: 120 });
  if (!gotLock) return json({ message: 'Another check is in progress' });

  try {
    const accounts = new Map(loadAccounts().map((a) => [a.email, a]));

    const { data: due, error } = await supabase
      .from('email_sender_health')
      .select('account_email, pause_reason, next_check_at')
      .eq('status', 'paused')
      .or(`next_check_at.is.null,next_check_at.lte.${new Date().toISOString()}`);
    if (error) throw error;

    const results: Array<{ account: string; healthy: boolean; detail: string }> = [];
    for (const row of (due || []) as HealthRow[]) {
      const account = accounts.get(row.account_email);
      if (!account) {
        results.push({ account: row.account_email, healthy: false, detail: 'No longer configured - ignored' });
        continue;
      }

      const transporter = nodemailer.createTransport(smtpTransportOptions(account));

      try {
        await transporter.verify();
        if (row.pause_reason === 'sender_quota' || row.pause_reason === 'sender_blocked') {
          await transporter.sendMail({
            from: fromAddress(account),
            to: account.email,
            subject: 'DripLove sender check',
            text: 'Automatic check that this sending account can send again. No action needed.',
          });
          await supabase.rpc('increment_email_account_usage', { p_account_email: account.email, p_amount: 1 });
        }
        await markSenderHealthy(supabase, account.email);
        results.push({ account: account.email, healthy: true, detail: 'Working again - resumed' });
      } catch (checkError) {
        const message = getErrorMessage(checkError);
        const type = classifyEmailError(message);
        // A failure here is the account's own problem by definition (it's
        // emailing itself); keep the original reason when it's unclear.
        const reason = isSenderProblem(type)
          ? type
          : (row.pause_reason as Parameters<typeof pauseSender>[2]) || 'sender_connection';
        await pauseSender(supabase, account.email, reason, message);
        results.push({ account: account.email, healthy: false, detail: `${reason}: ${message.slice(0, 160)}` });
      }
    }

    // Recipients on hold whose check is due.
    const { data: dueRecipients, error: heldError } = await supabase
      .from('email_suppression_list')
      .select('email, reason')
      .is('released_at', null)
      .neq('reason', 'unsubscribed')
      .lte('next_check_at', new Date().toISOString())
      .order('next_check_at', { ascending: true })
      .limit(RECHECKS_PER_RUN);
    if (heldError) throw heldError;

    const domainCache = new Map<string, boolean | null>();
    const recipients: Array<{ email: string; released: boolean; detail: string }> = [];
    for (const row of (dueRecipients || []) as HeldRow[]) {
      const domain = row.email.split('@')[1] || '';
      if (!domainCache.has(domain)) domainCache.set(domain, await domainTakesEmail(domain));
      const takesEmail = domainCache.get(domain);
      if (takesEmail === null) continue;
      if (takesEmail) {
        const { data: requeued, error } = await supabase.rpc('release_email_suppression', {
          p_email: row.email, p_reason: 'auto_recheck',
        });
        if (error) console.error(`Could not release ${row.email}:`, error);
        else recipients.push({ email: row.email, released: true, detail: `released, ${requeued ?? 0} email(s) back in the queue` });
      } else {
        const { error } = await supabase.rpc('email_recheck_failed', {
          p_email: row.email, p_error: `${domain} does not accept email`,
        });
        if (error) console.error(`Could not reschedule ${row.email}:`, error);
        else recipients.push({ email: row.email, released: false, detail: 'domain does not accept email - checking again later' });
      }
    }

    if (results.some((r) => r.healthy) || recipients.some((r) => r.released)) {
      await kickEmailQueue(supabaseUrl, serviceKey);
    }
    console.log('email-sender-health-check:', JSON.stringify({ senders: results, recipients }));
    return json({ checked: results.length, results, recipients });
  } catch (error) {
    console.error('Sender health check error:', error);
    return json({ error: getErrorMessage(error) }, 500);
  } finally {
    await supabase.rpc('release_worker_lock', { p_name: LOCK_NAME });
  }
});
