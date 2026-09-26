import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface PushToken {
  token: string
  platform: string
}

interface NotificationPayload {
  title: string
  body: string
  userId: string
  type?: 'message' | 'match' | 'like' | 'system' | 'admin' | 'image_rejected'
  data?: Record<string, any>
}

// Get OAuth2 access token for FCM v1 API
async function getAccessToken(): Promise<string> {
  // Try FCM_CREDENTIALS first (from your Firebase setup), fallback to FIREBASE_SERVICE_ACCOUNT
  const serviceAccountBase64 = Deno.env.get('FCM_CREDENTIALS') || Deno.env.get('FIREBASE_SERVICE_ACCOUNT')
  
  if (!serviceAccountBase64) {
    console.error('❌ No Firebase credentials found. Please set FCM_CREDENTIALS or FIREBASE_SERVICE_ACCOUNT secret.')
    throw new Error('FIREBASE_SERVICE_ACCOUNT not configured')
  }

  console.log('✅ Firebase credentials found, decoding...')
  
  try {
    // Decode the base64 service account
    const serviceAccountJson = atob(serviceAccountBase64)
    const serviceAccount = JSON.parse(serviceAccountJson)
    
    console.log('✅ Service account parsed. Project ID:', serviceAccount.project_id)
    return await generateAccessToken(serviceAccount)
  } catch (error) {
    console.error('❌ Failed to decode FCM credentials:', error)
    console.error('⚠️ Make sure your FCM_CREDENTIALS secret is a valid base64-encoded JSON service account file')
    console.error('⚠️ To create: 1) Download service account JSON from Firebase Console')
    console.error('⚠️            2) Run: cat service-account.json | base64')
    console.error('⚠️            3) Set the result as FCM_CREDENTIALS secret')
    throw new Error('Invalid FCM_CREDENTIALS format - must be base64-encoded JSON')
  }
}

async function generateAccessToken(serviceAccount: any): Promise<string> {
  
  // Create JWT for OAuth2
  const now = Math.floor(Date.now() / 1000)
  const expiry = now + 3600

  const header = {
    alg: 'RS256',
    typ: 'JWT',
  }

  const payload = {
    iss: serviceAccount.client_email,
    sub: serviceAccount.client_email,
    aud: 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: expiry,
    scope: 'https://www.googleapis.com/auth/firebase.messaging',
  }

  // Import the private key
  const privateKey = await crypto.subtle.importKey(
    'pkcs8',
    pemToArrayBuffer(serviceAccount.private_key),
    {
      name: 'RSASSA-PKCS1-v1_5',
      hash: 'SHA-256',
    },
    false,
    ['sign']
  )

  // Create JWT
  const encodedHeader = base64UrlEncode(JSON.stringify(header))
  const encodedPayload = base64UrlEncode(JSON.stringify(payload))
  const signatureInput = `${encodedHeader}.${encodedPayload}`

  const signature = await crypto.subtle.sign(
    'RSASSA-PKCS1-v1_5',
    privateKey,
    new TextEncoder().encode(signatureInput)
  )

  const encodedSignature = base64UrlEncode(signature)
  const jwt = `${signatureInput}.${encodedSignature}`

  // Exchange JWT for access token
  const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${jwt}`,
  })

  const tokenData = await tokenResponse.json()
  return tokenData.access_token
}

function pemToArrayBuffer(pem: string): ArrayBuffer {
  const b64 = pem
    .replace(/-----BEGIN PRIVATE KEY-----/, '')
    .replace(/-----END PRIVATE KEY-----/, '')
    .replace(/\s/g, '')
  
  const binary = atob(b64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i)
  }
  return bytes.buffer
}

function base64UrlEncode(data: string | ArrayBuffer): string {
  let base64: string
  
  if (typeof data === 'string') {
    base64 = btoa(data)
  } else {
    const bytes = new Uint8Array(data)
    let binary = ''
    for (let i = 0; i < bytes.length; i++) {
      binary += String.fromCharCode(bytes[i])
    }
    base64 = btoa(binary)
  }
  
  return base64
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '')
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  console.log('🔔 send-push-notification edge function called')
  
  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    const payload: NotificationPayload = await req.json()
    const { title, body, userId, type = 'system', data = {} } = payload

    console.log(`📤 Processing notification for user ${userId}:`, { title, body, type })

    // Resolve the other person's photo here, once, server-side - rather than
    // requiring every call site (match, message, like) to look this up and
    // thread an image URL through itself. A caller just passes `senderId`
    // (whoever the notification is "from") and this fills in `imageUrl` for
    // the native notification's rounded avatar, same way every other client
    // already gets a person's photo from `user_images`.
    let resolvedImageUrl: string | undefined
    const senderId = (data as Record<string, unknown>).senderId
    if (typeof senderId === 'string' && senderId) {
      const { data: senderImage } = await supabase
        .from('user_images')
        .select('image_url')
        .eq('user_id', senderId)
        .eq('is_approved', true)
        .neq('image_order', -1)
        .order('image_order', { ascending: true })
        .limit(1)
        .maybeSingle()
      resolvedImageUrl = senderImage?.image_url
    }
    const notificationData = resolvedImageUrl ? { ...data, imageUrl: resolvedImageUrl } : data

    // Get user's push tokens
    const { data: tokens, error: tokensError } = await supabase
      .from('push_tokens')
      .select('token, platform')
      .eq('user_id', userId)

    if (tokensError) {
      console.error('❌ Error fetching tokens:', tokensError)
    }

    console.log(`📱 Push tokens for user ${userId}:`, tokens?.length || 0, 'tokens found')
    if (tokens && tokens.length > 0) {
      console.log('📱 Tokens:', tokens.map(t => ({ platform: t.platform, token: t.token.substring(0, 20) + '...' })))
    } else {
      console.warn(`⚠️ No push tokens found for user ${userId}. User will only receive in-app notifications.`)
    }

    let pushSuccess = false
    let realTimeStored = false

    // iOS's aps.badge sets the app icon's badge count outright (it's not
    // additive), so this needs to be the actual right number on every send.
    // This used to be a count of notifications where is_read = false - but
    // nothing in the app ever sets that column true (no notification-center
    // UI exists to mark anything read from), so it was really just each
    // user's lifetime notification total, not an unread count - a user with
    // 187 notifications ever could get badge 187 off a single new push.
    // profiles.badge_count is a plain counter instead: +1 per push sent,
    // reset to 0 client-side whenever the app comes to the foreground.
    const { data: newBadgeCount, error: badgeError } = await supabase
      .rpc('increment_badge_count', { p_user_id: userId })
    if (badgeError) console.error('❌ Error incrementing badge count:', badgeError)
    const badgeCount = newBadgeCount ?? 1

    // Send push notifications if tokens exist
    if (tokens && tokens.length > 0) {
      console.log(`📤 Sending push notifications to ${tokens.length} device(s)...`)
      try {
        // Get OAuth2 access token
        console.log('🔑 Getting FCM access token...')
        const accessToken = await getAccessToken()
        console.log('✅ FCM access token obtained')
        
        // Determine notification channel and sound based on type
        let androidChannelId = 'driplove_notifications'
        let androidSound = 'botificationsound'
        let iosSound = 'botificationsound.caf'
        
        switch (type) {
          case 'message':
            androidChannelId = 'driplove_messages'
            break
          case 'match':
            androidChannelId = 'driplove_matches'
            break
          case 'like':
            androidChannelId = 'driplove_likes'
            break
          default:
            androidChannelId = 'driplove_notifications'
        }

        // Every push must stand on its own in the notification shade: 50 sends
        // = 50 notifications that stay until the user taps or clears them.
        // Collapsing used to be keyed on `type` alone (apns-collapse-id) and on
        // a per-channel id on Android, so each new message/like/match simply
        // replaced the previous one.
        //   uniqueKey  -> makes this notification distinct (never collapses)
        //   threadKey  -> groups related notifications (one chat) and lets the
        //                 app dismiss just that conversation's notifications
        //                 when the user opens it.
        const rawChatId = (notificationData as Record<string, unknown>).chatId
        const rawSenderId = (notificationData as Record<string, unknown>).senderId
        const threadKey =
          type === 'message' && typeof rawChatId === 'string' && rawChatId
            ? `chat-${rawChatId}`
            : typeof rawSenderId === 'string' && rawSenderId
              ? `${type}-${rawSenderId}`
              : `${type}`
        const uniqueKey = `${threadKey}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`

        // Send to each device token using FCM v1 API
        const sendPromises = tokens.map(async (tokenData: PushToken) => {
          const fcmMessage = {
            message: {
              token: tokenData.token,
              notification: {
                title,
                body,
              },
              data: {
                ...notificationData,
                type,
                threadKey,
                notificationTag: uniqueKey,
              },
              android: {
                priority: 'high',
                notification: {
                  channel_id: androidChannelId,
                  sound: androidSound,
                  notification_priority: 'PRIORITY_HIGH',
                  visibility: 'PUBLIC',
                  color: '#9333EA',
                  icon: 'ic_launcher',
                  // A unique tag per push is what keeps each notification in
                  // the shade instead of replacing the previous one; the
                  // group keeps a conversation's notifications bundled.
                  tag: uniqueKey,
                  notification_count: badgeCount,
                },
              },
              apns: {
                payload: {
                  aps: {
                    alert: {
                      title,
                      body,
                    },
                    sound: iosSound,
                    badge: badgeCount,
                    'thread-id': threadKey,
                    // Lets the NotificationService app extension (ios/App/NotificationService)
                    // intercept delivery and download+attach imageUrl below as the sender's
                    // photo, matching the Android large-icon avatar.
                    'mutable-content': 1,
                  },
                  // Put custom data at payload level, not inside aps
                  ...notificationData,
                  type,
                  threadKey,
                },
                headers: {
                  'apns-priority': '10',
                  'apns-collapse-id': uniqueKey.slice(0, 64),
                },
              },
            },
          }

          try {
            console.log(`📤 Sending FCM to ${tokenData.platform} device...`)
            const response = await fetch('https://fcm.googleapis.com/v1/projects/time-tracking-b70af/messages:send', {
              method: 'POST',
              headers: {
                'Authorization': `Bearer ${accessToken}`,
                'Content-Type': 'application/json',
              },
              body: JSON.stringify(fcmMessage),
            })

            if (!response.ok) {
              const errorText = await response.text()
              console.error(`❌ FCM Error for token ${tokenData.token.substring(0, 20)}...:`, response.status, errorText)
              
              // Remove invalid tokens
              if (response.status === 404 || response.status === 400 || errorText.includes('not found') || errorText.includes('invalid')) {
                console.log(`🗑️ Removing invalid token from database`)
                await supabase
                  .from('push_tokens')
                  .delete()
                  .eq('token', tokenData.token)
              }
              return false
            }

            console.log(`✅ FCM sent successfully to ${tokenData.platform} device`)
            return true
          } catch (error) {
            console.error(`❌ Error sending FCM to token ${tokenData.token.substring(0, 20)}...:`, error)
            return false
          }
        })

        const results = await Promise.all(sendPromises)
        pushSuccess = results.some((result: boolean) => result === true)
        console.log(`📊 Push notification results: ${results.filter(r => r).length}/${results.length} successful`)
      } catch (error) {
        console.error('❌ Error sending push notifications:', error)
        pushSuccess = false
      }
    }

    // Store notification in database for real-time delivery
    console.log('💾 Storing notification in database...')
    const { error: insertError } = await supabase
      .from('notifications')
      .insert({
        user_id: userId,
        title,
        message: body, // Column is 'message', not 'body'
        type,
        is_read: false, // Column is 'is_read', not 'read'
        data: notificationData,
        created_at: new Date().toISOString(),
      })

    if (!insertError) {
      realTimeStored = true
      console.log('✅ Notification stored in database successfully')
    } else {
      console.error('❌ Error inserting notification:', insertError)
    }

    const finalSuccess = pushSuccess || realTimeStored
    console.log(`📊 Final result: ${finalSuccess ? 'SUCCESS' : 'FAILURE'} (push: ${pushSuccess}, realtime: ${realTimeStored})`)

    return new Response(
      JSON.stringify({
        success: finalSuccess,
        pushSuccess,
        realTimeStored,
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      }
    )
  } catch (error) {
    console.error('❌ Error in send-push-notification:', error)
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400,
      }
    )
  }
})
