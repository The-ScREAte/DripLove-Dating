import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const BATCH_SIZE = 25; // Process 25 recipients per execution
const MAX_RETRIES = 3; // Maximum retry attempts per recipient
const STALE_PROCESSING_MINUTES = 10; // Self-heal processing recipients stuck longer than this

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    console.log('Starting broadcast queue processing...');

    // Self-heal: release recipients stuck in processing (e.g. worker crash)
    try {
      const { data: releasedCount, error: releaseError } = await supabase.rpc(
        'release_stale_broadcast_recipients',
        { p_stale_after: `${STALE_PROCESSING_MINUTES} minutes` }
      );

      if (releaseError) {
        console.warn('Failed to release stale processing recipients:', releaseError);
      } else if (releasedCount && releasedCount > 0) {
        console.log(`Released ${releasedCount} stale processing recipients back to pending`);
      }
    } catch (error) {
      console.warn('Stale release step threw (continuing):', error);
    }

    // Find campaigns that need processing (queued or processing)
    const { data: campaigns, error: campaignError } = await supabase
      .from('broadcast_campaigns')
      .select('id, title, message, notification_type')
      .in('status', ['queued', 'processing'])
      .order('created_at', { ascending: true })
      .limit(5); // Process up to 5 campaigns per run

    if (campaignError) {
      console.error('Error fetching campaigns:', campaignError);
      throw campaignError;
    }

    if (!campaigns || campaigns.length === 0) {
      console.log('No campaigns to process');
      return new Response(
        JSON.stringify({ message: 'No campaigns in queue', processed: 0 }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`Found ${campaigns.length} campaigns to process`);

    const results = [];

    for (const campaign of campaigns) {
      try {
        // Mark campaign as processing if it's queued
        const { data: currentCampaign } = await supabase
          .from('broadcast_campaigns')
          .select('status')
          .eq('id', campaign.id)
          .single();

        if (currentCampaign?.status === 'queued') {
          await supabase
            .from('broadcast_campaigns')
            .update({ status: 'processing' })
            .eq('id', campaign.id);
        }

        // Atomically claim recipients so concurrent workers can't double-send
        const { data: recipients, error: claimError } = await supabase.rpc(
          'claim_broadcast_recipients',
          {
            p_campaign_id: campaign.id,
            p_batch_size: BATCH_SIZE,
            p_max_retries: MAX_RETRIES,
          }
        );

        if (claimError) {
          console.error('Error claiming recipients:', claimError);
          continue;
        }

        if (!recipients || recipients.length === 0) {
          // No claimable work; only complete when no pending/processing remain
          const { count: remainingCount, error: remainingError } = await supabase
            .from('broadcast_recipients')
            .select('*', { count: 'exact', head: true })
            .eq('campaign_id', campaign.id)
            .in('status', ['pending', 'processing']);

          if (remainingError) {
            console.error('Error checking remaining recipients:', remainingError);
            continue;
          }

          if (!remainingCount || remainingCount === 0) {
            await supabase
              .from('broadcast_campaigns')
              .update({ status: 'completed' })
              .eq('id', campaign.id);

            const { count: sentCount } = await supabase
              .from('broadcast_recipients')
              .select('*', { count: 'exact', head: true })
              .eq('campaign_id', campaign.id)
              .eq('status', 'sent');

            const { count: failedCount } = await supabase
              .from('broadcast_recipients')
              .select('*', { count: 'exact', head: true })
              .eq('campaign_id', campaign.id)
              .eq('status', 'failed');

            await supabase
              .from('broadcast_campaigns')
              .update({
                successful_sends: sentCount || 0,
                failed_sends: failedCount || 0,
              })
              .eq('id', campaign.id);

            console.log(`Campaign ${campaign.id} completed`);
          }

          continue;
        }

        console.log(`Processing ${recipients.length} recipients for campaign ${campaign.id}`);

        // Process recipients in parallel
        const sendResults = await Promise.allSettled(
          recipients.map(async (recipient: { id: string; user_id: string; retry_count?: number }) => {
            try {
              // Call send-push-notification function
              const { data, error } = await supabase.functions.invoke('send-push-notification', {
                body: {
                  title: campaign.title,
                  body: campaign.message,
                  userId: recipient.user_id,
                  type: campaign.notification_type,
                  data: { action: 'open_discover' }
                }
              });

              if (error) throw error;

              const success = data?.success || false;

              const attemptedAt = new Date().toISOString();

              // Update recipient status and release processing lock
              if (success) {
                await supabase
                  .from('broadcast_recipients')
                  .update({
                    status: 'sent',
                    error_message: null,
                    sent_at: attemptedAt,
                    processing_started_at: null,
                  })
                  .eq('id', recipient.id);

                return { success: true, recipientId: recipient.id };
              }

              const newRetryCount = (recipient.retry_count ?? 0) + 1;
              const shouldMarkFailed = newRetryCount >= MAX_RETRIES;

              await supabase
                .from('broadcast_recipients')
                .update({
                  status: shouldMarkFailed ? 'failed' : 'pending',
                  error_message: 'Push notification failed',
                  sent_at: null,
                  retry_count: newRetryCount,
                  processing_started_at: null,
                })
                .eq('id', recipient.id);

              return { success: false, recipientId: recipient.id };
            } catch (error) {
              console.error(`Failed to send to recipient ${recipient.id}:`, error);

              // Increment retry count
              const newRetryCount = (recipient.retry_count ?? 0) + 1;
              const shouldMarkFailed = newRetryCount >= MAX_RETRIES;

              await supabase
                .from('broadcast_recipients')
                .update({
                  status: shouldMarkFailed ? 'failed' : 'pending',
                  error_message: error instanceof Error ? error.message : 'Unknown error',
                  retry_count: newRetryCount,
                  processing_started_at: null,
                })
                .eq('id', recipient.id);

              return { success: false, recipientId: recipient.id };
            }
          })
        );

        const successCount = sendResults.filter(
          r => r.status === 'fulfilled' && r.value.success
        ).length;

        results.push({
          campaignId: campaign.id,
          title: campaign.title,
          processed: recipients.length,
          successful: successCount,
          failed: recipients.length - successCount,
        });

        console.log(
          `Campaign ${campaign.id}: processed ${recipients.length}, ` +
          `${successCount} successful, ${recipients.length - successCount} failed/retry`
        );

      } catch (error) {
        console.error(`Error processing campaign ${campaign.id}:`, error);
        results.push({
          campaignId: campaign.id,
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }

    return new Response(
      JSON.stringify({
        message: 'Queue processing complete',
        campaignsProcessed: campaigns.length,
        results,
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      }
    );
  } catch (error) {
    console.error('Queue processor error:', error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500,
      }
    );
  }
});
