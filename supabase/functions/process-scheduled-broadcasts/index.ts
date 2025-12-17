import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.7'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

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
        // Get target users (excluding admins)
        let query = supabase
          .from('profiles')
          .select('id, first_name, last_name')
          .eq('account_status', 'active')
          .eq('is_admin', false)

        // Filter by countries if specified
        if (broadcast.target_countries && broadcast.target_countries.length > 0) {
          query = query.in('country', broadcast.target_countries)
        }

        const { data: profiles, error: profileError } = await query

        if (profileError) {
          console.error('Error fetching profiles:', profileError)
          continue
        }

        const userIds = profiles?.map(p => p.id) || []

        if (userIds.length === 0) {
          console.log(`No users found for broadcast: ${broadcast.title}`)
          continue
        }

        // Get push tokens for these users
        const { data: tokens } = await supabase
          .from('push_tokens')
          .select('user_id, token, platform')
          .in('user_id', userIds)

        if (!tokens || tokens.length === 0) {
          console.log(`No push tokens found for broadcast: ${broadcast.title}`)
          continue
        }

        console.log(`Sending to ${tokens.length} users for: ${broadcast.title}`)

        // Send push notifications
        let successful = 0
        let failed = 0

        for (const tokenData of tokens) {
          try {
            const payload = {
              to: tokenData.token,
              title: broadcast.title,
              body: broadcast.message,
              sound: 'default',
              priority: 'high',
            }

            const response = await fetch('https://exp.host/--/api/v2/push/send', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
              },
              body: JSON.stringify(payload),
            })

            if (response.ok) {
              successful++
            } else {
              failed++
            }
          } catch (error) {
            console.error('Error sending push notification:', error)
            failed++
          }
        }

        // Record execution in history
        await supabase
          .from('scheduled_broadcast_history')
          .insert({
            scheduled_broadcast_id: broadcast.id,
            total_recipients: tokens.length,
            successful_sends: successful,
            failed_sends: failed,
          })

        // Calculate next send time
        const nextSend = calculateNextSendTime(
          now,
          broadcast.repeat_type,
          broadcast.specific_day,
          broadcast.time_to_send
        )

        // Update broadcast
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
          successful,
          failed,
          nextSend: nextSend.toISOString(),
        })

        console.log(`Completed broadcast: ${broadcast.title} - ${successful} sent, ${failed} failed`)
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
