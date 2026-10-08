import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';
import { isValidEmail, kickEmailQueue } from '../_shared/email-utils.ts';
import { composeBroadcastEmail } from '../_shared/notification-email.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Delivery pacing. Campaigns used to stop at ~120 recipients: 50 parallel
// calls to send-push-notification were refused by the platform ("Failed to
// send a request to the Edge Function"), the self-continue call failed the
// same way, and nothing ever picked the campaign up again. Now each run sends
// a modest number in parallel for up to RUN_BUDGET_MS, and a once-a-minute
// cron job (see 20261005100000_broadcast_delivery_fix.sql) starts the next run
// whenever someone is due.
//
// Admin pushes go out the moment they're sent. Scheduled pushes reach this
// queue with next_attempt_at set to each person's own local time (see
// process-scheduled-broadcasts) and are sent at that minute.
const CLAIM_SIZE = 40;
const SEND_CONCURRENCY = 8;
const RUN_BUDGET_MS = 50_000;
const MAX_RETRIES = 3;
const RETRY_DELAY_MINUTES = 2;
const STALE_PROCESSING_MINUTES = 10;
const LOCK_NAME = 'process-broadcast-queue';
const LOCK_SECONDS = 90;

// Reasons that mean "this person can't get a push at all" - final, not a
// failure. They still see the message in their in-app inbox if the campaign
// was saved to profiles.
const SKIP_REASONS = new Set(['no_device', 'notifications_off', 'account_not_active', 'no_profile']);
// ...and these people get the message by email instead (as do people whose
// push kept failing). Closed/missing accounts get nothing.
const EMAIL_INSTEAD_REASONS = new Set(['no_device', 'notifications_off']);

// Supabase Edge Runtime: keeps a task running after the response is sent.
declare const EdgeRuntime: { waitUntil(promise: Promise<unknown>): void } | undefined;

type Recipient = { id: string; user_id: string; retry_count?: number };
type Campaign = {
  id: string;
  title: string;
  message: string;
  notification_type: string | null;
  status: string;
  admin_id: string | null;
  scheduled_broadcast_id: string | null;
  email_fallback: boolean | null;
};
type Outcome = 'sent' | 'skipped' | 'retry' | 'failed';
type Delivery = { outcome: Outcome; emailInstead: boolean };

const minutesFromNow = (minutes: number) => new Date(Date.now() + minutes * 60_000).toISOString();

async function updateRecipient(supabase: SupabaseClient, id: string, fields: Record<string, unknown>) {
  const { error } = await supabase
    .from('broadcast_recipients')
    .update({ processing_started_at: null, ...fields })
    .eq('id', id);
  if (error) console.error(`Failed to update recipient ${id}:`, error);
}

async function deliverToRecipient(
  supabase: SupabaseClient,
  campaign: Campaign,
  recipient: Recipient,
): Promise<Delivery> {
  const retryCount = recipient.retry_count ?? 0;

  const retryOrFail = async (message: string): Promise<Delivery> => {
    const next = retryCount + 1;
    if (next >= MAX_RETRIES) {
      await updateRecipient(supabase, recipient.id, { status: 'failed', error_message: message, retry_count: next });
      return { outcome: 'failed', emailInstead: true };
    }
    await updateRecipient(supabase, recipient.id, {
      status: 'pending',
      error_message: message,
      retry_count: next,
      next_attempt_at: minutesFromNow(RETRY_DELAY_MINUTES * next),
    });
    return { outcome: 'retry', emailInstead: false };
  };

  const handleNotAllowed = async (reason: string): Promise<Delivery> => {
    if (SKIP_REASONS.has(reason)) {
      await updateRecipient(supabase, recipient.id, { status: 'skipped', error_message: reason });
      return { outcome: 'skipped', emailInstead: EMAIL_INSTEAD_REASONS.has(reason) };
    }
    return retryOrFail(`Not delivered: ${reason}`);
  };

  try {
    // Check first, so people without a device (or with notifications off)
    // don't cost a send call at all.
    const { data: rows, error: eligibilityError } = await supabase.rpc('push_eligibility', {
      p_user_id: recipient.user_id,
      p_category: 'broadcast',
      p_kind: 'broadcast',
      p_dedupe_key: null,
    });
    if (eligibilityError) return retryOrFail(`Eligibility check failed: ${eligibilityError.message}`);
    const eligibility = Array.isArray(rows) ? rows[0] : rows;
    if (!eligibility?.allowed) {
      return handleNotAllowed(eligibility?.reason ?? 'unknown');
    }

    const { data, error } = await supabase.functions.invoke('send-push-notification', {
      body: {
        title: campaign.title,
        body: campaign.message,
        userId: recipient.user_id,
        type: campaign.notification_type || 'system',
        category: 'broadcast',
        kind: 'broadcast',
        data: { action: 'open_discover', campaignId: campaign.id },
      },
    });
    if (error) return retryOrFail(error instanceof Error ? error.message : String(error));

    if (data?.pushSuccess) {
      await updateRecipient(supabase, recipient.id, {
        status: 'sent',
        error_message: null,
        sent_at: new Date().toISOString(),
        next_attempt_at: null,
      });
      return { outcome: 'sent', emailInstead: false };
    }
    if (data?.suppressed) {
      // Something changed between the check and the send (e.g. app deleted).
      return handleNotAllowed(String(data.reason ?? 'unknown'));
    }
    if (data?.reason === 'no_device') {
      // Every device token turned out to be dead (app deleted) and was removed.
      await updateRecipient(supabase, recipient.id, { status: 'skipped', error_message: 'no_device' });
      return { outcome: 'skipped', emailInstead: true };
    }
    return retryOrFail('Push notification failed');
  } catch (error) {
    return retryOrFail(error instanceof Error ? error.message : 'Unknown error');
  }
}

/** The campaign's email History entry (created the first time someone needs the email). */
function emailCopyHistory(supabase: SupabaseClient, campaign: Campaign) {
  let pending: Promise<string | null> | null = null;
  const find = async () => {
    const { data } = await supabase
      .from('email_broadcast_history')
      .select('id')
      .eq('push_campaign_id', campaign.id)
      .maybeSingle();
    return (data?.id as string | undefined) ?? null;
  };
  return () => (pending ??= (async () => {
    const existing = await find();
    if (existing) return existing;
    const content = composeBroadcastEmail(campaign.title, campaign.message);
    const { data, error } = await supabase
      .from('email_broadcast_history')
      .insert({
        subject: content.subject,
        message: content.html,
        recipient_count: 0,
        successful_sends: 0,
        failed_sends: 0,
        status: 'partial',
        admin_id: campaign.admin_id,
        recipient_filter: 'push_email_copy',
        push_campaign_id: campaign.id,
      })
      .select('id')
      .single();
    if (error) return find(); // created a moment ago by another run
    return data.id as string;
  })());
}

/** Email the push to the people it couldn't reach. Returns how many were queued. */
async function queueEmailCopies(
  supabase: SupabaseClient,
  campaign: Campaign,
  userIds: string[],
  historyId: () => Promise<string | null>,
): Promise<number> {
  if (userIds.length === 0) return 0;
  const { data: profiles } = await supabase.from('profiles').select('id, email').in('id', userIds);
  const people = (profiles || [])
    .map((p: { id: string; email: string | null }) => ({ id: p.id, email: String(p.email || '').trim().toLowerCase() }))
    .filter((p) => isValidEmail(p.email));
  if (people.length === 0) return 0;

  const id = await historyId();
  if (!id) return 0;
  const content = composeBroadcastEmail(campaign.title, campaign.message);
  const { error } = await supabase.from('email_send_queue').insert(people.map((p) => ({
    broadcast_id: id,
    recipient: p.email,
    user_id: p.id,
    kind: 'broadcast',
    priority: 4,
    preheader: content.preheader,
    attempt_count: 0,
  })));
  if (error) {
    console.error(`Could not queue email copies for campaign ${campaign.id}:`, error);
    return 0;
  }

  const [{ data: history }, { data: current }] = await Promise.all([
    supabase.from('email_broadcast_history').select('recipient_count').eq('id', id).maybeSingle(),
    supabase.from('broadcast_campaigns').select('emailed_sends').eq('id', campaign.id).maybeSingle(),
  ]);
  await Promise.all([
    supabase.from('email_broadcast_history')
      .update({ recipient_count: (history?.recipient_count || 0) + people.length, status: 'partial' })
      .eq('id', id),
    supabase.from('broadcast_campaigns')
      .update({ emailed_sends: (current?.emailed_sends || 0) + people.length })
      .eq('id', campaign.id),
  ]);
  return people.length;
}

async function syncCampaign(supabase: SupabaseClient, campaignId: string) {
  const count = async (statuses: string[]) => {
    const { count } = await supabase
      .from('broadcast_recipients')
      .select('id', { count: 'exact', head: true })
      .eq('campaign_id', campaignId)
      .in('status', statuses);
    return count ?? 0;
  };
  const countWaiting = async () => {
    const { count } = await supabase
      .from('broadcast_recipients')
      .select('id', { count: 'exact', head: true })
      .eq('campaign_id', campaignId)
      .eq('status', 'pending')
      .gt('next_attempt_at', new Date().toISOString());
    return count ?? 0;
  };
  const [sent, failed, skipped, remaining, waiting] = await Promise.all([
    count(['sent']),
    count(['failed']),
    count(['skipped']),
    count(['pending', 'processing']),
    countWaiting(),
  ]);
  await supabase
    .from('broadcast_campaigns')
    .update({
      successful_sends: sent,
      failed_sends: failed,
      skipped_sends: skipped,
      waiting_sends: waiting,
      ...(remaining === 0 ? { status: 'completed' } : {}),
    })
    .eq('id', campaignId);
  return { sent, failed, skipped, waiting, remaining };
}

async function runQueue(supabase: SupabaseClient, requestedCampaignId: string | null) {
  const startedAt = Date.now();
  const results: Array<Record<string, unknown>> = [];

  try {
    const { error: releaseError } = await supabase.rpc('release_stale_broadcast_recipients', {
      p_stale_after: `${STALE_PROCESSING_MINUTES} minutes`,
    });
    if (releaseError) console.warn('Failed to release stale recipients:', releaseError);

    let campaignsQuery = supabase
      .from('broadcast_campaigns')
      .select('id, title, message, notification_type, status, admin_id, scheduled_broadcast_id, email_fallback')
      .in('status', ['queued', 'processing'])
      .order('created_at', { ascending: true });
    campaignsQuery = requestedCampaignId
      ? campaignsQuery.eq('id', requestedCampaignId)
      : campaignsQuery.limit(5);

    const { data: campaigns, error: campaignError } = await campaignsQuery;
    if (campaignError) throw campaignError;

    for (const campaign of (campaigns ?? []) as Campaign[]) {
      if (campaign.status === 'queued') {
        await supabase.from('broadcast_campaigns').update({ status: 'processing' }).eq('id', campaign.id);
      }

      const tally: Record<Outcome | 'emailed', number> = { sent: 0, skipped: 0, retry: 0, failed: 0, emailed: 0 };
      const historyId = emailCopyHistory(supabase, campaign);
      while (Date.now() - startedAt < RUN_BUDGET_MS) {
        const { data: claimed, error: claimError } = await supabase.rpc('claim_broadcast_recipients', {
          p_campaign_id: campaign.id,
          p_batch_size: CLAIM_SIZE,
          p_max_retries: MAX_RETRIES,
        });
        if (claimError) {
          console.error('Error claiming recipients:', claimError);
          break;
        }
        const recipients = (claimed ?? []) as Recipient[];
        if (recipients.length === 0) break;

        const emailInstead: string[] = [];
        for (let i = 0; i < recipients.length; i += SEND_CONCURRENCY) {
          const batch = recipients.slice(i, i + SEND_CONCURRENCY);
          const deliveries = await Promise.all(batch.map((r) => deliverToRecipient(supabase, campaign, r)));
          deliveries.forEach((d, idx) => {
            tally[d.outcome] += 1;
            // Campaigns can turn email copies off (push only).
            if (d.emailInstead && campaign.email_fallback !== false) emailInstead.push(batch[idx].user_id);
          });
        }
        tally.emailed += await queueEmailCopies(supabase, campaign, emailInstead, historyId);
      }

      // Start sending the email copies now rather than at the next 5-minute run.
      if (tally.emailed > 0) {
        await kickEmailQueue(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '');
      }
      const totals = await syncCampaign(supabase, campaign.id);
      console.log(`Campaign ${campaign.id}: this run ${JSON.stringify(tally)}; totals ${JSON.stringify(totals)}`);
      results.push({ campaignId: campaign.id, title: campaign.title, thisRun: tally, totals });

      if (Date.now() - startedAt >= RUN_BUDGET_MS) break;
    }
  } catch (error) {
    console.error('Queue processor error:', error);
    results.push({ error: error instanceof Error ? error.message : 'Unknown error' });
  } finally {
    await supabase.rpc('release_worker_lock', { p_name: LOCK_NAME });
  }
  return results;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  let requestedCampaignId: string | null = null;
  try {
    const body = await req.json();
    if (body && typeof body.campaignId === 'string' && body.campaignId.trim()) {
      requestedCampaignId = body.campaignId.trim();
    }
  } catch {
    // no/invalid body - process everything
  }

  // One worker at a time: the cron job, the admin screen and a scheduled
  // broadcast can all start a run; overlapping runs used to compound the
  // overload that stalled campaigns.
  const { data: gotLock, error: lockError } = await supabase.rpc('try_acquire_worker_lock', {
    p_name: LOCK_NAME,
    p_seconds: LOCK_SECONDS,
  });
  if (lockError) console.error('Worker lock error (continuing without it):', lockError);
  if (!lockError && !gotLock) {
    return new Response(JSON.stringify({ message: 'Another run is in progress' }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  // Answer right away and keep working in the background. Callers (the
  // once-a-minute job, the admin screen) used to hold the connection open,
  // and the scheduler gives up after a few seconds - which cut runs off
  // mid-batch and left recipients stuck "processing".
  const work = runQueue(supabase, requestedCampaignId);
  if (typeof EdgeRuntime !== 'undefined' && EdgeRuntime?.waitUntil) {
    EdgeRuntime.waitUntil(work);
    return new Response(JSON.stringify({ message: 'Queue run started' }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 202,
    });
  }
  const results = await work;
  return new Response(JSON.stringify({ message: 'Queue processing complete', results }), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
});
