import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.7'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const BATCH_SIZE = 1000; // Supabase default limit

const chunkArray = <T,>(arr: T[], size: number): T[][] => {
  const chunks: T[][] = [];
  for (let i = 0; i < arr.length; i += size) {
    chunks.push(arr.slice(i, i + size));
  }
  return chunks;
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    // Get all active scheduled broadcasts that are due to be sent
    const now = new Date()
    const { data: broadcasts, error: fetchError } = await supabase
      .from('scheduled_broadcasts')
      .select('*')
      .eq('is_active', true)
      .lte('next_send_at', now.toISOString())

    if (fetchError) {
      console.error('Error fetching broadcasts:', fetchError)
      throw fetchError
    }

    if (!broadcasts || broadcasts.length === 0) {
      return new Response(
        JSON.stringify({ message: 'No broadcasts to send', count: 0 }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    console.log(`Processing ${broadcasts.length} scheduled broadcasts`)

    const results = []

    for (const broadcast of broadcasts) {
      try {
        // Fetch ALL target users in batches (bypass 1000 limit)
        const allProfiles: { id: string; email: string | null }[] = [];
        let offset = 0;
        let hasMore = true;

        while (hasMore) {
          let query = supabase
            .from('profiles')
            .select('id, email')
            .eq('account_status', 'active')
            .eq('is_admin', false)
            .range(offset, offset + BATCH_SIZE - 1);

          if (broadcast.target_countries && broadcast.target_countries.length > 0) {
            query = query.in('country', broadcast.target_countries)
          }

          const { data: profiles, error: profileError } = await query;

          if (profileError) {
            console.error('Error fetching profiles:', profileError);
            break;
          }

          if (profiles && profiles.length > 0) {
            allProfiles.push(...profiles);
            offset += BATCH_SIZE;
            hasMore = profiles.length === BATCH_SIZE;
          } else {
            hasMore = false;
          }
        }

        console.log(`Found ${allProfiles.length} total eligible users for broadcast: ${broadcast.title}`);

        if (allProfiles.length === 0) {
          console.log(`No users found for broadcast: ${broadcast.title}`)
          continue
        }

        const channel = broadcast.channel === 'email' ? 'email' : 'push';
        let successful = 0;
        let failed = 0;
        let totalRecipients = 0;

        if (channel === 'push') {
          // Reuse the same reliable pipeline as immediate broadcasts (New tab):
          // create a broadcast_campaigns/broadcast_recipients row, then let
          // process-broadcast-queue deliver via the real FCM v1 sender. This also makes
          // scheduled sends show up automatically in the unified History tab.
          const userIds = allProfiles.map((p) => p.id);

          const allTokens: { user_id: string }[] = [];
          for (const chunk of chunkArray(userIds, 100)) {
            const { data: tokens } = await supabase
              .from('push_tokens')
              .select('user_id')
              .in('user_id', chunk);
            if (tokens) allTokens.push(...tokens);
          }

          const tokenUserIds = new Set(allTokens.map((t) => t.user_id));
          const deliverableUserIds = userIds.filter((id) => tokenUserIds.has(id));

          if (deliverableUserIds.length === 0) {
            console.log(`No push tokens found for broadcast: ${broadcast.title}`)
          } else {
            const { data: campaign, error: campaignError } = await supabase
              .from('broadcast_campaigns')
              .insert({
                admin_id: broadcast.admin_id,
                title: broadcast.title,
                message: broadcast.message,
                notification_type: 'system',
                target_countries: broadcast.target_countries,
                total_recipients: deliverableUserIds.length,
                successful_sends: 0,
                failed_sends: 0,
                status: 'queued',
                save_to_profile: true,
              })
              .select()
              .single();

            if (campaignError) {
              console.error('Error creating campaign for scheduled push:', campaignError);
            } else {
              const recipientsToInsert = deliverableUserIds.map((userId) => ({
                campaign_id: campaign.id,
                user_id: userId,
                status: 'pending',
                retry_count: 0,
              }));

              for (let i = 0; i < recipientsToInsert.length; i += 500) {
                const batch = recipientsToInsert.slice(i, i + 500);
                const { error: recipientsError } = await supabase
                  .from('broadcast_recipients')
                  .insert(batch);
                if (recipientsError) {
                  console.error('Error inserting scheduled push recipients:', recipientsError);
                }
              }

              totalRecipients = deliverableUserIds.length;

              // Kick off delivery in the background; it self-chains until complete.
              supabase.functions
                .invoke('process-broadcast-queue', { body: { campaignId: campaign.id, depth: 0 } })
                .catch((err) => console.warn('Failed to trigger queue processor:', err));

              successful = deliverableUserIds.length; // Queued successfully; actual delivery tracked on the campaign itself.
            }
          }
        } else {
          // Email channel: title = subject, message = HTML body.
          const recipientEmails = Array.from(
            new Set(allProfiles.map((p) => p.email).filter((e): e is string => !!e))
          );

          if (recipientEmails.length === 0) {
            console.log(`No emails found for broadcast: ${broadcast.title}`)
          } else {
            // send-broadcast-email-smtp creates and owns its own email_broadcast_history row
            // (with multi-account rotation + automatic queueing for anything over the daily
            // sending limit), so we just read back its counts here rather than logging our own.
            const { data: emailData, error: emailError } = await supabase.functions.invoke(
              'send-broadcast-email-smtp',
              {
                body: {
                  recipients: recipientEmails,
                  subject: broadcast.title,
                  htmlContent: broadcast.message,
                  targetCountries: broadcast.target_countries,
                  recipientFilter: 'scheduled',
                  adminId: broadcast.admin_id,
                },
              }
            );

            if (emailError) {
              console.error('Error sending scheduled email:', emailError);
              failed = recipientEmails.length;
            } else {
              const emailResults = (emailData as any)?.results;
              // Emails are queued and sent in steady batches, so "queued"
              // counts as accepted for delivery here.
              successful = (emailResults?.sent || 0) + (emailResults?.queued || 0);
              failed = emailResults?.failed || 0;
            }

            totalRecipients = recipientEmails.length;
          }
        }

        // Recurring schedules fire often, so we don't keep a per-execution log —
        // last_sent_at/total_sends on the schedule row itself is the record of "last sent".

        // Calculate next send time
        const nextSend = calculateNextSendTime(
          now,
          broadcast.repeat_type,
          broadcast.specific_day,
          broadcast.time_to_send
        )

        await supabase
          .from('scheduled_broadcasts')
          .update({
            last_sent_at: now.toISOString(),
            next_send_at: nextSend.toISOString(),
            total_sends: broadcast.total_sends + 1,
          })
          .eq('id', broadcast.id)

        results.push({
          id: broadcast.id,
          title: broadcast.title,
          channel,
          totalRecipients,
          successful,
          failed,
          nextSend: nextSend.toISOString(),
        })

        console.log(`Completed ${channel} broadcast: ${broadcast.title} - ${successful} sent, ${failed} failed out of ${totalRecipients}`)
      } catch (error: unknown) {
        console.error(`Error processing broadcast ${broadcast.id}:`, error)
        results.push({
          id: broadcast.id,
          title: broadcast.title,
          error: error instanceof Error ? error.message : 'Unknown error',
        })
      }
    }

    return new Response(
      JSON.stringify({ message: 'Processing complete', results }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (error: unknown) {
    console.error('Error:', error)
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    )
  }
})

function calculateNextSendTime(
  currentDate: Date,
  repeatType: string,
  specificDay: string | null,
  timeToSend: string
): Date {
  const [hours, minutes] = timeToSend.split(':').map(Number)
  const next = new Date(currentDate)
  next.setHours(hours, minutes, 0, 0)

  // Start from tomorrow since we just sent today
  next.setDate(next.getDate() + 1)

  switch (repeatType) {
    case 'daily':
      // Already set to tomorrow
      break

    case 'every_2_days':
      // Add one more day (total 2 days from today)
      next.setDate(next.getDate() + 1)
      break

    case 'weekends':
      // Find next Saturday or Sunday
      while (next.getDay() !== 0 && next.getDay() !== 6) {
        next.setDate(next.getDate() + 1)
      }
      break

    case 'weekdays':
      // Find next Monday-Friday
      while (next.getDay() === 0 || next.getDay() === 6) {
        next.setDate(next.getDate() + 1)
      }
      break

    case 'specific_day':
      if (specificDay) {
        const dayMap: { [key: string]: number } = {
          sunday: 0,
          monday: 1,
          tuesday: 2,
          wednesday: 3,
          thursday: 4,
          friday: 5,
          saturday: 6,
        }
        const targetDay = dayMap[specificDay]
        while (next.getDay() !== targetDay) {
          next.setDate(next.getDate() + 1)
        }
      }
      break
  }

  return next
}
