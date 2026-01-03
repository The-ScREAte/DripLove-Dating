import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

type PushTokenRow = {
  user_id: string | null;
};

const chunkArray = <T,>(arr: T[], chunkSize: number): T[][] => {
  const chunks: T[][] = [];
  for (let i = 0; i < arr.length; i += chunkSize) {
    chunks.push(arr.slice(i, i + chunkSize));
  }
  return chunks;
};

interface BroadcastRequest {
  title: string;
  message: string;
  targetCountries: string[];
  userIds: string[]; 
  notificationType: string;
  saveToProfile?: boolean; // Whether to save message to user's profile inbox
}
 
const getErrorMessage = (error: unknown): string => {
  if (error instanceof Error) return error.message;
  if (error && typeof error === 'object') {
    const anyErr = error as Record<string, unknown>;
    const message = anyErr['message'];
    const details = anyErr['details'];
    if (typeof message === 'string' && typeof details === 'string' && details.trim()) {
      return `${message} (${details})`;
    }
    if (typeof message === 'string') return message;
  }
  return 'Unknown error';
};

serve(async (req: Request) => {
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
      saveToProfile = true, // Default to saving to profile inbox
    } = body;

    if (!title || !message || !userIds || userIds.length === 0) {
      throw new Error('Missing required fields: title, message, or userIds');
    }

    console.log(`Queueing broadcast campaign for ${userIds.length} selected users (saveToProfile: ${saveToProfile})`);


    // Only enqueue users who currently have push tokens.
    // Chunk the lookup to avoid URL limits
    const tokenUserIdSet = new Set<string>();
    const TOKEN_LOOKUP_CHUNK_SIZE = 100;
    for (const chunk of chunkArray(userIds, TOKEN_LOOKUP_CHUNK_SIZE)) {
      if (chunk.length === 0) continue;
      const { data: tokenRows, error: tokenError } = await supabase
        .from('push_tokens')
        .select('user_id')
        .in('user_id', chunk);

      if (tokenError) {
        console.error('Push token lookup error:', tokenError);
        throw tokenError;
      }

      ((tokenRows as PushTokenRow[] | null) || []).forEach((r) => {
        if (r.user_id) tokenUserIdSet.add(r.user_id);
      });
    }

    const deliverableUserIds = Array.from(tokenUserIdSet);
    
    // Calculate users WITHOUT tokens - we'll still track them
    const usersWithoutTokens = userIds.filter(id => !tokenUserIdSet.has(id));
    console.log(`${deliverableUserIds.length} users have push tokens, ${usersWithoutTokens.length} do not`);

    if (deliverableUserIds.length === 0) {
      throw new Error('No selected users have push notifications enabled (no push tokens found).');
    }

    // Create campaign with 'queued' status
    const { data: campaign, error: campaignError } = await supabase
      .from('broadcast_campaigns')
      .insert({
        admin_id: user.id,
        title,
        message,
        notification_type: notificationType,
        target_countries: targetCountries,
        total_recipients: deliverableUserIds.length,
        successful_sends: 0,
        failed_sends: 0,
        status: 'queued',
        save_to_profile: saveToProfile, // Save this flag so processor knows to create profile messages
      })
      .select()
      .single();

    if (campaignError) {
      console.error('Campaign creation error:', campaignError);
      throw campaignError;
    }

    console.log(`Created campaign ${campaign.id} with status: queued`);

    // Create recipient records in batches to avoid timeout
    const recipientsToInsert = deliverableUserIds.map(userId => ({
      campaign_id: campaign.id,
      user_id: userId,
      status: 'pending',
      retry_count: 0,
    }));

    // Insert in chunks of 500 to avoid timeout
    const RECIPIENT_BATCH_SIZE = 500;
    for (let i = 0; i < recipientsToInsert.length; i += RECIPIENT_BATCH_SIZE) {
      const batch = recipientsToInsert.slice(i, i + RECIPIENT_BATCH_SIZE);
      const { error: recipientsError } = await supabase
        .from('broadcast_recipients')
        .insert(batch);

      if (recipientsError) {
        console.error(`Recipients creation error (batch ${i / RECIPIENT_BATCH_SIZE + 1}):`, recipientsError);
        throw recipientsError;
      }
    }

    console.log(`Queued ${deliverableUserIds.length} recipients for background processing`);

    // Immediately trigger the queue processor to start processing
    supabase.functions.invoke('process-broadcast-queue', {
      body: { campaignId: campaign.id, depth: 0 }
    }).catch(err => console.warn('Failed to trigger queue processor:', err));

    // Return immediately - background worker will process
    return new Response(
      JSON.stringify({
        success: true,
        campaignId: campaign.id,
        totalRecipients: deliverableUserIds.length,
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
        error: getErrorMessage(error),
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400,
      }
    );
  }
});
