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

    // Use the same redirect technique as OAuth callback (apple-oauth-callback)
    // Deep link for mobile app
    const deepLink = `driplove://payment/callback?status=${encodeURIComponent(status)}&reference=${encodeURIComponent(reference)}&payment_type=${encodeURIComponent(paymentType)}`

    // Web fallback
    const webOriginRaw = Deno.env.get('APP_WEB_ORIGIN') || Deno.env.get('SITE_URL') || 'https://driplove.love'
    const webOrigin = webOriginRaw.replace(/\/$/, '')
    const webRedirect = `${webOrigin}/payment-success?status=${encodeURIComponent(status)}&reference=${encodeURIComponent(reference)}&payment_type=${encodeURIComponent(paymentType)}`

    // Check User-Agent to determine if this is a mobile app request
    const userAgent = req.headers.get('User-Agent') || ''
    const isMobileApp = userAgent.toLowerCase().includes('capacitor') || 
                       userAgent.toLowerCase().includes('driplove') ||
                       userAgent.toLowerCase().includes('android')

    // For mobile app: redirect to deep link (it will open the app)
    // For web: redirect to web URL
    const redirectUrl = isMobileApp ? deepLink : webRedirect

    console.log('[PAYSTACK-REDIRECT] Redirecting:', {
      userAgent: userAgent.substring(0, 50),
      isMobileApp,
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