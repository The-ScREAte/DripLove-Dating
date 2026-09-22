import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
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

    const now = new Date();
    const threeDaysAgo = new Date(now.getTime() - (3 * 24 * 60 * 60 * 1000));
    const eightDaysAgo = new Date(now.getTime() - (8 * 24 * 60 * 60 * 1000));

    console.log('[check-dormant-chats] Starting check...');
    console.log(`[check-dormant-chats] Current time: ${now.toISOString()}`);
    console.log(`[check-dormant-chats] 3 days ago: ${threeDaysAgo.toISOString()}`);
    console.log(`[check-dormant-chats] 8 days ago: ${eightDaysAgo.toISOString()}`);

    let askedCount = 0;
    let deletedCount = 0;

    // Get all matches with messages
    const { data: matches, error: matchError } = await supabaseClient
      .from('matches')
      .select(`
        id,
        user1_id,
        user2_id,
        first_message_at,
        last_msg_at,
        dormancy_check_asked_at,
        user1_heading_somewhere,
        user2_heading_somewhere
      `)
      .not('first_message_at', 'is', null);

    if (matchError) {
      console.error('[check-dormant-chats] Error fetching matches:', matchError);
      throw matchError;
    }

    console.log(`[check-dormant-chats] Found ${matches?.length || 0} matches with messages`);

    for (const match of matches || []) {
      const firstMsgDate = new Date(match.first_message_at);
      const lastMsgDate = match.last_msg_at ? new Date(match.last_msg_at) : firstMsgDate;
      const daysSinceFirstMsg = (now.getTime() - firstMsgDate.getTime()) / (24 * 60 * 60 * 1000);
      const daysSinceLastMsg = (now.getTime() - lastMsgDate.getTime()) / (24 * 60 * 60 * 1000);

      console.log(`[check-dormant-chats] Match ${match.id}:`);
      console.log(`  - First message: ${firstMsgDate.toISOString()} (${daysSinceFirstMsg.toFixed(1)} days ago)`);
      console.log(`  - Last message: ${lastMsgDate.toISOString()} (${daysSinceLastMsg.toFixed(1)} days ago)`);
      console.log(`  - Check asked: ${match.dormancy_check_asked_at || 'Never'}`);
      console.log(`  - User1 response: ${match.user1_heading_somewhere}`);
      console.log(`  - User2 response: ${match.user2_heading_somewhere}`);

      // STEP 1: Ask the question after 3 days of first message (only once)
      // Check if we already have dormancy question in the chat to prevent duplicates
      if (daysSinceFirstMsg >= 3 && !match.dormancy_check_asked_at) {
        // First check if a dormancy question already exists in this match's chat
        const { data: existingDormancyMsg, error: checkError } = await supabaseClient
          .from('chats')
          .select('id')
          .eq('match_id', match.id)
          .eq('sender_id', '00000000-0000-0000-0000-000000000000')
          .ilike('message', '%heading somewhere%')
          .limit(1);

        if (checkError) {
          console.error(`[check-dormant-chats] ❌ Error checking existing dormancy msg:`, checkError);
        }

        // Skip if a dormancy question already exists
        if (existingDormancyMsg && existingDormancyMsg.length > 0) {
          console.log(`[check-dormant-chats] ⚠️ Dormancy question already exists for match ${match.id}, updating dormancy_check_asked_at`);
          // Just update the flag to prevent future checks
          await supabaseClient
            .from('matches')
            .update({ dormancy_check_asked_at: now.toISOString() })
            .eq('id', match.id);
          continue;
        }

        console.log(`[check-dormant-chats] ⏰ Asking dormancy check question for match ${match.id}`);
        
        // Send system message to both users
        const systemMessage = "Are you two heading somewhere with this connection? Reply 'Yes' to continue or 'No' if you'd like to move on.";
        
        const { error: msgError } = await supabaseClient
          .from('chats')
          .insert({
            match_id: match.id,
            sender_id: '00000000-0000-0000-0000-000000000000', // System user
            message: systemMessage,
            is_read: false
          });

        if (!msgError) {
          // Mark that we asked the question
          await supabaseClient
            .from('matches')
            .update({ dormancy_check_asked_at: now.toISOString() })
            .eq('id', match.id);
          
          askedCount++;
          console.log(`[check-dormant-chats] ✅ Asked question for match ${match.id}`);
        } else {
          console.error(`[check-dormant-chats] ❌ Error sending message:`, msgError);
        }
        continue;
      }

      // STEP 2: Check if we should delete the chat
      if (match.dormancy_check_asked_at) {
        const askedDate = new Date(match.dormancy_check_asked_at);
        const daysSinceAsked = (now.getTime() - askedDate.getTime()) / (24 * 60 * 60 * 1000);

        // If both said "No", delete after 3 days of dormancy
        if (match.user1_heading_somewhere === false && match.user2_heading_somewhere === false) {
          if (daysSinceLastMsg >= 3) {
            console.log(`[check-dormant-chats] 🗑️ Both users said NO - Deleting match ${match.id} (${daysSinceLastMsg.toFixed(1)} days dormant)`);
            
            // Delete all chats first
            await supabaseClient
              .from('chats')
              .delete()
              .eq('match_id', match.id);
            
            // Delete the match
            await supabaseClient
              .from('matches')
              .delete()
              .eq('id', match.id);
            
            deletedCount++;
            continue;
          }
        }
        
        // If at least one said "Yes" OR no response, delete after 8 days of dormancy
        if (daysSinceLastMsg >= 8) {
          console.log(`[check-dormant-chats] 🗑️ Deleting dormant match ${match.id} (${daysSinceLastMsg.toFixed(1)} days dormant)`);
          
          // Delete all chats first
          await supabaseClient
            .from('chats')
            .delete()
            .eq('match_id', match.id);
          
          // Delete the match
          await supabaseClient
            .from('matches')
            .delete()
            .eq('id', match.id);
          
          deletedCount++;
          continue;
        }
      }
    }

    const summary = {
      success: true,
      message: `Processed ${matches?.length || 0} matches`,
      asked_question: askedCount,
      deleted_matches: deletedCount,
      timestamp: now.toISOString()
    };

    console.log('[check-dormant-chats] Summary:', summary);

    return new Response(
      JSON.stringify(summary),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('[check-dormant-chats] Error:', error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : String(error)
      }),
      { 
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );
  }
});
