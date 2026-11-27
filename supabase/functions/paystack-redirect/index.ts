import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*', // public GET redirect, no credentials
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    const url = new URL(req.url)
    const status = url.searchParams.get('status') || 'successful'
    const reference = url.searchParams.get('reference') || url.searchParams.get('trxref') || ''
    const paymentType = url.searchParams.get('payment_type') || 'subscription'
    const originParam = url.searchParams.get('origin') || '' // Origin where payment was initiated
    const nativeFlag = url.searchParams.get('native') === '1'

    // Build redirect URLs
    const params = `status=${encodeURIComponent(status)}&reference=${encodeURIComponent(reference)}&payment_type=${encodeURIComponent(paymentType)}`
    
    // Deep link for mobile app
    const deepLink = `driplove://payment/callback?${params}`

    // Check User-Agent to determine platform
    const userAgent = req.headers.get('User-Agent') || ''
    const ua = userAgent.toLowerCase()

    // Origin can tell us this was initiated from a native shell even when the callback is handled
    // by an external browser (Paystack -> redirect).
    const originIsNative =
      originParam.startsWith('capacitor://') ||
      originParam.startsWith('ionic://') ||
      originParam.startsWith('file://')

    // Mobile app detection:
    // - Explicit native flag (sent by our app)
    // - Capacitor/DripLove UA
    // - Android UA + native-origin hint (covers external browser return from app flow)
    const isMobileApp =
      nativeFlag ||
      ua.includes('capacitor') ||
      ua.includes('driplove') ||
      (ua.includes('android') && originIsNative)

    // Determine web redirect destination. The `origin` query param is attacker
    // controllable, so only allow our own web origins (or localhost for dev);
    // anything else falls back to production (prevents an open redirect).
    const webOriginRaw = Deno.env.get('APP_WEB_ORIGIN') || 'https://driplove.love'
    const prodOrigin = webOriginRaw.replace(/\/$/, '')
    const allowedOrigins = new Set([prodOrigin, 'https://driplove.love', 'https://www.driplove.love'])
    let webOrigin = prodOrigin
    try {
      const o = new URL(originParam)
      const isLocal = (o.hostname === 'localhost' || o.hostname === '127.0.0.1') && (o.protocol === 'http:' || o.protocol === 'https:')
      if (allowedOrigins.has(o.origin) || isLocal) webOrigin = o.origin
    } catch { /* invalid origin -> production */ }
    const webRedirect = `${webOrigin}/payment-success?${params}`

    // For mobile app: redirect to deep link (it will open the app)
    // For web: redirect to appropriate web URL
    const redirectUrl = isMobileApp ? deepLink : webRedirect

    console.log('[PAYSTACK-REDIRECT] Redirecting:', {
      userAgent: userAgent.substring(0, 50),
      isMobileApp,
      originParam,
      redirectUrl: redirectUrl.substring(0, 100)
    })

    // Use HTTP 302 redirect, same as OAuth callback
    return Response.redirect(redirectUrl, 302)
  } catch (error) {
    console.error('Error in paystack-redirect:', error)
    return new Response(JSON.stringify({ error: 'Redirect failed' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }
})