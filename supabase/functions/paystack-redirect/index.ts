import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
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

    // Determine web redirect destination
    let webRedirect: string
    if (originParam && (originParam.includes('localhost') || originParam.includes('127.0.0.1'))) {
      // Localhost: redirect back to localhost
      webRedirect = `${originParam}/payment-success?${params}`
    } else if (originParam && originParam.startsWith('http')) {
      // Custom origin provided: use it
      webRedirect = `${originParam}/payment-success?${params}`
    } else {
      // Default: production web
      const webOriginRaw = Deno.env.get('APP_WEB_ORIGIN') || 'https://driplove.love'
      const webOrigin = webOriginRaw.replace(/\/$/, '')
      webRedirect = `${webOrigin}/payment-success?${params}`
    }

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