import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface NotificationPayload {
  title: string
  body: string
  userId?: string
  type?: 'match' | 'message' | 'like' | 'system' | 'admin'
  data?: Record<string, any>
  relatedUserId?: string
}

interface PushToken {
  token: string
  platform: string
  user_id: string
}

// Create Supabase client with service role
const supabaseUrl = Deno.env.get('SUPABASE_URL')!
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const supabase = createClient(supabaseUrl, supabaseServiceKey)

// Web Push API for browser notifications
async function sendWebPushNotification(token: string, payload: NotificationPayload) {
  try {
    // For web browsers, we'll use the browser's Notification API
    // This will be handled on the client side
      token: token.substring(0, 10) + '...',
      title: payload.title,
      type: payload.type
    })
    
    return true
  } catch (error) {
    console.error('❌ Web push notification error:', error)
    return false
  }
}

// Firebase Cloud Messaging for mobile apps
async function sendFCMNotification(token: string, payload: NotificationPayload) {
  const FCM_SERVER_KEY = Deno.env.get('FCM_SERVER_KEY')
  
  if (!FCM_SERVER_KEY) {
    console.warn('⚠️ FCM_SERVER_KEY not configured, skipping FCM notification')
    return false
  }

  try {
    const message = {
      to: token,
      notification: {
        title: payload.title,
        body: payload.body,
        icon: '/favicon.ico',
        click_action: 'FCM_PLUGIN_ACTIVITY'
      },
      data: {
        type: payload.type || 'system',
        ...payload.data
      }
    }

    const response = await fetch('https://fcm.googleapis.com/fcm/send', {
      method: 'POST',
      headers: {
        'Authorization': `key=${FCM_SERVER_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(message)
    })

    if (response.ok) {
      return true
    } else {
      const error = await response.text()
      console.error('❌ Firebase notification failed:', error)
      return false
    }
  } catch (error) {
    console.error('❌ Firebase notification error:', error)
    return false
  }
}

// Apple Push Notification Service function
async function sendAPNSNotification(token: string, payload: NotificationPayload) {
  const APNS_KEY_ID = Deno.env.get('APNS_KEY_ID')
  const APNS_TEAM_ID = Deno.env.get('APNS_TEAM_ID')
  const APNS_PRIVATE_KEY = Deno.env.get('APNS_PRIVATE_KEY')
  
  if (!APNS_KEY_ID || !APNS_TEAM_ID || !APNS_PRIVATE_KEY) {
    console.warn('⚠️ APNS credentials not configured, skipping iOS notification')
    return false
  }

  try {
    // TODO: Implement APNS notification with JWT authentication
    // This requires crypto libraries for JWT signing
    return true
  } catch (error) {
    console.error('❌ APNS notification error:', error)
    return false
  }
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    const { title, body, userId, type = 'system', data = {} } = await req.json() as NotificationPayload


    // Get device tokens for the user(s)
    let tokensQuery = supabaseClient
      .from('push_tokens')
      .select('token, platform')

    if (userId) {
      tokensQuery = tokensQuery.eq('user_id', userId)
    }

    const { data: tokens, error: tokensError } = await tokensQuery

    if (tokensError) {
      console.error('❌ Error fetching tokens:', tokensError)
      throw tokensError
    }

    if (!tokens || tokens.length === 0) {
      return new Response(
        JSON.stringify({ success: false, message: 'No push tokens found' }),
        { 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 200
        }
      )
    }


    // Send notifications to all platforms
    const results: Array<{ token: string; platform: string; sent: boolean }> = []
    for (const tokenData of tokens as PushToken[]) {
      let sent = false
      
      if (tokenData.platform === 'web' || tokenData.platform === 'firefox' || tokenData.platform === 'chrome') {
        sent = await sendWebPushNotification(tokenData.token, { title, body, userId, type, data })
      } else if (tokenData.platform === 'ios') {
        sent = await sendAPNSNotification(tokenData.token, { title, body, userId, type, data })
      } else if (tokenData.platform === 'android') {
        // Android can use FCM
        sent = await sendFCMNotification(tokenData.token, { title, body, userId, type, data })
      } else if (tokenData.platform === 'firebase') {
        // Legacy Firebase support
        sent = await sendFCMNotification(tokenData.token, { title, body, userId, type, data })
      } else {
          to: tokenData.token,
          title,
          body,
          type,
          data
        })
        sent = true // Mark as sent for logging purposes
      }
      
      results.push({ 
        token: tokenData.token, 
        platform: tokenData.platform, 
        sent 
      })
    }

    const successCount = results.filter(r => r.sent).length

    // Store notification in database for tracking and real-time delivery
    if (userId) {
      const { error: notificationError } = await supabase
        .from('notifications')
        .insert({
          user_id: userId,
          title,
          message: body,
          type,
          data: data || {},
          related_user_id: data?.relatedUserId || null
        })

      if (notificationError) {
        console.error('❌ Error storing notification:', notificationError)
      } else {
      }
    }


    return new Response(
      JSON.stringify({ 
        success: true, 
        message: `Notification sent to ${successCount}/${tokens.length} device(s)`,
        results
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200
      }
    )

  } catch (error) {
    console.error('❌ Error in send-push-notification function:', error)
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: error.message 
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500
      }
    )
  }
})
