import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface BroadcastRequest {
  title: string;
  message: string;
  targetCountries: string[];
  userIds: string[];
  notificationType: string;
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    // Create Supabase client with service role (bypass RLS)
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Get admin user from auth header
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      throw new Error('Missing authorization header');
    }

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: userError } = await supabase.auth.getUser(token);
    
    if (userError || !user) {
      throw new Error('Unauthorized');
    }

    // Verify user is admin
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('is_admin')
      .eq('id', user.id)
      .single();

    if (profileError || !profile?.is_admin) {
      throw new Error('Forbidden: Admin access required');
    }

    // Parse request body
    const body: BroadcastRequest = await req.json();
    const {
      title,
      message,
      targetCountries,
      userIds,
      notificationType = 'system',
    } = body;

    if (!title || !message || !userIds || userIds.length === 0) {
      throw new Error('Missing required fields: title, message, or userIds');
    }

    console.log(`Queueing broadcast campaign for ${userIds.length} users`);

    // Create campaign with 'queued' status
    const { data: campaign, error: campaignError } = await supabase
      .from('broadcast_campaigns')
      .insert({
        admin_id: user.id,
        title,
        message,
        notification_type: notificationType,
        target_countries: targetCountries,
        total_recipients: userIds.length,
        successful_sends: 0,
        failed_sends: 0,
        status: 'queued', // Will be processed by background worker
      })
      .select()
      .single();

    if (campaignError) {
      console.error('Campaign creation error:', campaignError);
      throw campaignError;
    }

    console.log(`Created campaign ${campaign.id} with status: queued`);

    // Create recipient records (all pending)
    const recipients = userIds.map(userId => ({
      campaign_id: campaign.id,
      user_id: userId,
      status: 'pending',
      retry_count: 0,
    }));

    const { error: recipientsError } = await supabase
      .from('broadcast_recipients')
      .insert(recipients);

    if (recipientsError) {
      console.error('Recipients creation error:', recipientsError);
      throw recipientsError;
    }

    console.log(`Queued ${userIds.length} recipients for background processing`);

    // Return immediately - background worker will process
    return new Response(
      JSON.stringify({
        success: true,
        campaignId: campaign.id,
        totalRecipients: userIds.length,
        message: 'Broadcast queued successfully. Processing will continue in background.',
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      }
    );
  } catch (error) {
    console.error('Broadcast queue error:', error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400,
      }
    );
  }
});
