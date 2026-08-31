import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface SignupWelcomePayload {
  userId: string
  delayMinutes?: number // Default 20 minutes
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  console.log('🎉 send-signup-welcome edge function called')
  
  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    const payload: SignupWelcomePayload = await req.json()
    const { userId, delayMinutes = 20 } = payload

    console.log(`📤 Scheduling welcome notification for user ${userId} in ${delayMinutes} minutes`)

    // Check if this notification was already sent to this user
    const { data: existingNotification, error: checkError } = await supabase
      .from('notifications')
      .select('id')
      .eq('user_id', userId)
      .eq('type', 'signup_welcome')
      .single()

    if (existingNotification) {
      console.log(`⏭️ Welcome notification already sent to user ${userId}, skipping`)
      return new Response(
        JSON.stringify({ success: true, message: 'Already sent', skipped: true }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
      )
    }

    // Wait for the specified delay
    console.log(`⏳ Waiting ${delayMinutes} minutes before sending...`)
    await new Promise(resolve => setTimeout(resolve, delayMinutes * 60 * 1000))

    // Double check user still exists and hasn't received notification
    const { data: user, error: userError } = await supabase
      .from('profiles')
      .select('id, first_name')
      .eq('id', userId)
      .single()

    if (userError || !user) {
      console.log(`❌ User ${userId} not found, skipping notification`)
      return new Response(
        JSON.stringify({ success: false, message: 'User not found' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
      )
    }

    // Check again for existing notification (in case it was sent while waiting)
    const { data: doubleCheck } = await supabase
      .from('notifications')
      .select('id')
      .eq('user_id', userId)
      .eq('type', 'signup_welcome')
      .single()

    if (doubleCheck) {
      console.log(`⏭️ Welcome notification already sent during wait, skipping`)
      return new Response(
        JSON.stringify({ success: true, message: 'Already sent during wait', skipped: true }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
      )
    }

    const title = "Welcome to DripLove"
    const body = "You will find love, no matter how long it takes. Stay assured."

    // Get user's push tokens
    const { data: tokens } = await supabase
      .from('push_tokens')
      .select('token, platform')
      .eq('user_id', userId)

    let pushSuccess = false

    // Send push notification if tokens exist
    if (tokens && tokens.length > 0) {
      try {
        // Call the existing send-push-notification function
        const pushResponse = await fetch(
          `${Deno.env.get('SUPABASE_URL')}/functions/v1/send-push-notification`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`,
            },
            body: JSON.stringify({
              title,
              body,
              userId,
              type: 'system',
              data: { type: 'signup_welcome' }
            })
          }
        )

        if (pushResponse.ok) {
          const pushResult = await pushResponse.json()
          pushSuccess = pushResult.pushSuccess || pushResult.success
          console.log(`✅ Push notification sent successfully`)
        }
      } catch (error) {
        console.error('❌ Error sending push notification:', error)
      }
    }

    // Store notification in database
    const { error: insertError } = await supabase
      .from('notifications')
      .insert({
        user_id: userId,
        title,
        message: body,
        type: 'signup_welcome',
        is_read: false,
        created_at: new Date().toISOString(),
      })

    if (insertError) {
      console.error('❌ Error storing notification:', insertError)
    } else {
      console.log('✅ Welcome notification stored in database')
    }

    return new Response(
      JSON.stringify({
        success: true,
        pushSuccess,
        stored: !insertError,
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      }
    )
  } catch (error) {
    console.error('❌ Error in send-signup-welcome:', error)
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400,
      }
    )
  }
})