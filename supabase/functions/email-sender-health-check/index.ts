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
  smtpConfig,
  getErrorMessage,
  loadAccounts,
} from '../_shared/email-utils.ts';

// "Is this sending account working again?" Runs every 30 minutes (only when a
// paused account is due - see 20261005110000_email_sender_health.sql).
//
// For each paused account whose rest period is over: log in to the mail
// server, and when it was paused for its sending limit (or being blocked),
// also send one tiny email to the account itself - the only real proof the
// limit has lifted. If it works, the account is un-paused and the queue starts
// straight away; if not, it rests longer (6h -> 12h -> 24h for limits).

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const LOCK_NAME = 'email-sender-health-check';

type HealthRow = { account_email: string; pause_reason: string | null; next_check_at: string | null };

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
    const smtp = smtpConfig();
    const accounts = new Map(loadAccounts().map((a) => [a.email, a]));
    if (!smtp || accounts.size === 0) return json({ message: 'SMTP not configured' });

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

      const transporter = nodemailer.createTransport({
        host: smtp.host,
        port: smtp.port,
        secure: smtp.secure,
        auth: { user: account.email, pass: account.pass },
      });

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

    if (results.some((r) => r.healthy)) await kickEmailQueue(supabaseUrl, serviceKey);
    console.log('email-sender-health-check:', JSON.stringify(results));
    return json({ checked: results.length, results });
  } catch (error) {
    console.error('Sender health check error:', error);
    return json({ error: getErrorMessage(error) }, 500);
  } finally {
    await supabase.rpc('release_worker_lock', { p_name: LOCK_NAME });
  }
});
