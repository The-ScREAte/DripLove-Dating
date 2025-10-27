import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    // Calculate the date 3 weeks ago
    const threeWeeksAgo = new Date()
    threeWeeksAgo.setDate(threeWeeksAgo.getDate() - 21) // 3 weeks = 21 days

    console.log(`[Cleanup] Deleting messages older than ${threeWeeksAgo.toISOString()}`)

    // Delete messages older than 3 weeks
    const { data, error, count } = await supabase
      .from('chats')
      .delete({ count: 'exact' })
      .lt('created_at', threeWeeksAgo.toISOString())

    if (error) {
      console.error('[Cleanup] Error deleting old messages:', error)
      throw error
    }

    console.log(`[Cleanup] Successfully deleted ${count || 0} old messages`)

    return new Response(
      JSON.stringify({
        success: true,
        deleted_count: count || 0,
        cutoff_date: threeWeeksAgo.toISOString()
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      }
    )
  } catch (error) {
    console.error('[Cleanup] Error:', error)
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400,
      }
    )
  }
})
