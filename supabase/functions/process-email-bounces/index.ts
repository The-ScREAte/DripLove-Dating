import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';
import { ImapFlow } from 'npm:imapflow@1.7.8';
import { classifyEmailError, getErrorMessage, isSenderProblem, loadAccounts, suppressionReason, SmtpAccount } from '../_shared/email-utils.ts';
import { looksLikeBounce, parseBounce } from '../_shared/bounce-parse.ts';

// Reads the bounces that come back to each sending mailbox (every 10 minutes,
// while anything was sent in the last 3 days - see
// 20261006100000_email_send_now_hold_and_release.sql). Private Email accepts
// every email first and only reports a bad address later by mailing a bounce
// back, so this is where those failures are caught: the address is put on hold
// and the bounced email waits with it until the address works again.
//
// The mailboxes are only read, never changed: the last message looked at is
// remembered in email_bounce_scan_state.

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const LOCK_NAME = 'process-email-bounces';
const LOOKBACK_DAYS = 3;
const MAX_PER_ACCOUNT = 200;

const imapHost = (account: SmtpAccount): string =>
  (account.primary && Deno.env.get('SMTP_PRIMARY_IMAP_HOST')) || account.host.replace(/^smtp\./i, 'imap.');

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  const supabase = createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '');
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status });

  const { data: gotLock } = await supabase.rpc('try_acquire_worker_lock', { p_name: LOCK_NAME, p_seconds: 240 });
  if (!gotLock) return json({ message: 'Another scan is in progress' });

  const accounts = loadAccounts();
  const ourAddresses = new Set(accounts.map((a) => a.email.toLowerCase()));
  const results: Array<Record<string, unknown>> = [];

  try {
    for (const account of accounts) {
      const result: Record<string, unknown> = { account: account.email, bounces: 0, held: [] as string[] };
      results.push(result);
      const { data: state } = await supabase
        .from('email_bounce_scan_state')
        .select('uid_validity, last_uid')
        .eq('account_email', account.email)
        .maybeSingle();

      const client = new ImapFlow({
        host: imapHost(account),
        port: 993,
        secure: true,
        auth: { user: account.email, pass: account.pass },
        logger: false,
      });
      try {
        await client.connect();
        const lock = await client.getMailboxLock('INBOX');
        try {
          const mailbox = client.mailbox as { uidValidity: bigint | number };
          const uidValidity = String(mailbox.uidValidity);
          const lastUid = state && String(state.uid_validity) === uidValidity ? Number(state.last_uid) : 0;

          const since = new Date(Date.now() - LOOKBACK_DAYS * 86_400_000);
          const found = (await client.search({ since }, { uid: true })) || [];
          const fresh = (found as number[]).filter((uid) => uid > lastUid).sort((a, b) => a - b).slice(-MAX_PER_ACCOUNT);
          let highest = lastUid;

          if (fresh.length > 0) {
            // Envelope first; only bounces are downloaded in full.
            const bounceUids: number[] = [];
            for await (const msg of client.fetch(fresh, { envelope: true }, { uid: true })) {
              highest = Math.max(highest, msg.uid);
              const from = msg.envelope?.from?.[0]?.address || '';
              if (looksLikeBounce(from, msg.envelope?.subject || '')) bounceUids.push(msg.uid);
            }

            for (const uid of bounceUids) {
              const msg = await client.fetchOne(String(uid), { source: { maxLength: 200_000 } }, { uid: true });
              const parsed = msg && msg.source ? parseBounce(msg.source.toString()) : null;
              if (!parsed || !parsed.final) continue;
              const detail = [parsed.status, parsed.diagnostic].filter(Boolean).join(' ') || 'Bounced back';
              const type = classifyEmailError(detail);
              // A bounce about our own account (rare) is for the health check, not a recipient.
              if (isSenderProblem(type)) continue;
              for (const recipient of parsed.recipients) {
                if (ourAddresses.has(recipient)) continue;
                const { error } = await supabase.rpc('record_email_bounce', {
                  p_email: recipient,
                  p_reason: suppressionReason(type === 'unknown' ? 'recipient_invalid' : type),
                  p_error: detail.slice(0, 500),
                  p_account_email: account.email,
                });
                if (error) {
                  console.error(`Could not record bounce for ${recipient}:`, error);
                  continue;
                }
                result.bounces = (result.bounces as number) + 1;
                (result.held as string[]).push(recipient);
              }
            }
          }

          await supabase.from('email_bounce_scan_state').upsert({
            account_email: account.email,
            uid_validity: uidValidity,
            last_uid: highest,
            last_scan_at: new Date().toISOString(),
            last_error: null,
          }, { onConflict: 'account_email' });
        } finally {
          lock.release();
        }
        await client.logout();
      } catch (error) {
        const message = getErrorMessage(error);
        result.error = message;
        console.error(`Bounce scan failed for ${account.email}:`, message);
        await supabase.from('email_bounce_scan_state').upsert({
          account_email: account.email,
          last_scan_at: new Date().toISOString(),
          last_error: message.slice(0, 500),
        }, { onConflict: 'account_email' });
        try { await client.logout(); } catch { /* already closed */ }
      }
    }

    console.log('process-email-bounces:', JSON.stringify(results));
    return json({ results });
  } catch (error) {
    console.error('Bounce scan error:', error);
    return json({ error: getErrorMessage(error) }, 500);
  } finally {
    await supabase.rpc('release_worker_lock', { p_name: LOCK_NAME });
  }
});
