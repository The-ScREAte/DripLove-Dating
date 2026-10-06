import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';
import { isValidEmail, getErrorMessage, kickEmailQueue, loadAccounts } from '../_shared/email-utils.ts';

// Admin email broadcasts. This used to send up to ~900 emails in one burst
// from the Gmail accounts - exactly the pattern spam filters punish - and
// blamed Gmail's own sending limit on the recipients. It now checks the list,
// records the broadcast, and queues every recipient; process-email-queue
// sends them in small steady batches (with unsubscribe headers, account
// health checks and automatic retries). Progress shows in the History tab.

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

const INSERT_CHUNK = 500;
// Address lists go in the request URL - keep each lookup small.
const CHECK_CHUNK = 100;

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
    const { recipients, subject, htmlContent, targetCountries, recipientFilter } = body;

    if (isServiceRoleCall && body.adminId) {
      adminId = body.adminId;
    }

    if (!Array.isArray(recipients) || recipients.length === 0) {
      throw new Error('No recipients provided');
    }
    if (!subject || !htmlContent) {
      throw new Error('Subject and htmlContent are required');
    }
    if (loadAccounts().length === 0) {
      throw new Error('SMTP is not configured (missing SMTP_PRIMARY_* or SMTP_HOST/SMTP_USER/SMTP_PASS secrets in Supabase)');
    }

    // Dedupe + validate recipients up front.
    const seen = new Set<string>();
    const formatChecked: string[] = [];
    const skipped: Array<{ email: string; error: string }> = [];

    for (const raw of recipients) {
      const email = String(raw || '').trim().toLowerCase();
      if (!email || seen.has(email)) continue;
      seen.add(email);
      if (!isValidEmail(email)) {
        skipped.push({ email, error: 'Invalid email format' });
        continue;
      }
      formatChecked.push(email);
    }

    // Skip addresses that unsubscribed. Addresses on hold (they failed before)
    // are still queued - their copy waits and goes out once they're released.
    const accepted: string[] = [];
    for (let i = 0; i < formatChecked.length; i += CHECK_CHUNK) {
      const slice = formatChecked.slice(i, i + CHECK_CHUNK);
      const { data: blockedRows } = await supabase
        .from('email_suppression_list')
        .select('email')
        .in('email', slice)
        .eq('reason', 'unsubscribed')
        .is('released_at', null);
      const blocked = new Set((blockedRows || []).map((r: { email: string }) => r.email));
      for (const email of slice) {
        if (blocked.has(email)) {
          skipped.push({ email, error: 'Skipped: unsubscribed' });
        } else {
          accepted.push(email);
        }
      }
    }

    const { data: historyRow, error: historyInsertError } = await supabase
      .from('email_broadcast_history')
      .insert({
        subject,
        message: htmlContent,
        recipient_count: recipients.length,
        successful_sends: 0,
        failed_sends: skipped.length,
        status: accepted.length > 0 ? 'partial' : 'failed',
        admin_id: adminId,
        target_countries: targetCountries && targetCountries.length > 0 ? targetCountries : null,
        recipient_filter: recipientFilter || null,
        error_details: skipped.length > 0 ? skipped.slice(0, 500) : null,
      })
      .select()
      .single();

    if (historyInsertError || !historyRow) {
      throw new Error(`Could not record the broadcast: ${historyInsertError?.message ?? 'unknown error'}`);
    }
    const broadcastId: string = historyRow.id;

    let queued = 0;
    for (let i = 0; i < accepted.length; i += INSERT_CHUNK) {
      const rows = accepted.slice(i, i + INSERT_CHUNK).map((recipient) => ({
        broadcast_id: broadcastId,
        recipient,
        kind: 'broadcast',
        priority: 5,
        attempt_count: 0,
      }));
      const { error: queueError } = await supabase.from('email_send_queue').insert(rows);
      if (queueError) {
        console.error('Failed to queue recipients:', queueError);
        throw new Error(`Queued ${queued} of ${accepted.length} recipients, then failed: ${queueError.message}`);
      }
      queued += rows.length;
    }

    if (queued > 0) await kickEmailQueue(supabaseUrl, supabaseServiceKey);

    return new Response(
      JSON.stringify({
        success: true,
        provider: 'smtp-queue',
        broadcastId,
        results: {
          sent: 0,
          failed: skipped.length,
          queued,
          details: { failed: skipped },
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
