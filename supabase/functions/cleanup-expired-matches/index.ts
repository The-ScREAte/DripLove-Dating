import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false
        }
      }
    );

    const EXPIRATION_DAYS = 10;
    const MS_PER_DAY = 24 * 60 * 60 * 1000;
    const now = new Date();
    const expirationDate = new Date(now.getTime() - (EXPIRATION_DAYS * MS_PER_DAY));

    console.log('[cleanup-expired-matches] Starting cleanup...');
    console.log(`[cleanup-expired-matches] Current date: ${now.toISOString()}`);
    console.log(`[cleanup-expired-matches] Expiration cutoff: ${expirationDate.toISOString()}`);

    // Step 1: Get all matches older than 10 days
    const { data: oldMatches, error: fetchError } = await supabaseClient
      .from('matches')
      .select(`
        id,
        created_at,
        user1_id,
        user2_id,
        chats(id, message)
      `)
      .lt('created_at', expirationDate.toISOString());

    if (fetchError) {
      console.error('[cleanup-expired-matches] Error fetching old matches:', fetchError);
      throw fetchError;
    }

    console.log(`[cleanup-expired-matches] Found ${oldMatches?.length || 0} matches older than 10 days`);

    if (!oldMatches || oldMatches.length === 0) {
      return new Response(
        JSON.stringify({
          success: true,
          message: 'No expired matches to clean up',
          deleted: 0
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Step 2: Filter matches that have NO messages
    const matchesWithoutMessages = oldMatches.filter(match => {
      const hasMessages = match.chats && match.chats.length > 0;
      return !hasMessages;
    });

    console.log(`[cleanup-expired-matches] Found ${matchesWithoutMessages.length} matches without messages to delete`);

    if (matchesWithoutMessages.length === 0) {
      return new Response(
        JSON.stringify({
          success: true,
          message: 'No expired matches without messages',
          deleted: 0
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Step 3: Delete expired matches without messages
    const expiredMatchIds = matchesWithoutMessages.map(m => m.id);
    
    const { error: deleteError } = await supabaseClient
      .from('matches')
      .delete()
      .in('id', expiredMatchIds);

    if (deleteError) {
      console.error('[cleanup-expired-matches] Error deleting matches:', deleteError);
      throw deleteError;
    }

    console.log(`[cleanup-expired-matches] Successfully deleted ${expiredMatchIds.length} expired matches`);
    
    // Log some details about deleted matches
    matchesWithoutMessages.forEach(match => {
      const daysSinceCreation = Math.floor((now.getTime() - new Date(match.created_at).getTime()) / MS_PER_DAY);
      console.log(`[cleanup-expired-matches] Deleted match ${match.id} (${daysSinceCreation} days old)`);
    });

    return new Response(
      JSON.stringify({
        success: true,
        message: `Deleted ${expiredMatchIds.length} expired matches`,
        deleted: expiredMatchIds.length,
        matchIds: expiredMatchIds
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('[cleanup-expired-matches] Error:', error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error.message
      }),
      { 
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );
  }
});
