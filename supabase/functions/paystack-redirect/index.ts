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
    const status = url.searchParams.get('status') || 'unknown'
    const reference = url.searchParams.get('reference') || url.searchParams.get('trxref') || ''
    const tx_ref = url.searchParams.get('tx_ref') || reference
    
    // Determine payment type based on the reference or other indicators
    // For Paystack subscription payments, we can check if it's a plan-based payment
    let paymentType = 'subscription' // Default to subscription for this redirect function
    
    // Build the redirect URL
    const redirectUrl = `/payment-success?status=${encodeURIComponent(status)}&reference=${encodeURIComponent(reference)}&payment_type=${paymentType}`
    
    // Check if this is a mobile app request (has User-Agent indicating mobile app)
    const userAgent = req.headers.get('User-Agent') || ''
    const isMobileApp = userAgent.includes('Capacitor') || userAgent.includes('DripLove')
    
    if (isMobileApp) {
      // For mobile app, use deep link
      const deepLink = `driplove://payment/callback?status=${encodeURIComponent(status)}&reference=${encodeURIComponent(reference)}&payment_type=${paymentType}`
      
      return new Response(`
        <!DOCTYPE html>
        <html>
        <head>
          <title>Payment Complete</title>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1">
          <meta http-equiv="refresh" content="1;url=${deepLink}">
        </head>
        <body style="text-align: center; padding: 50px; font-family: Arial, sans-serif; background: #667eea; color: white;">
          <h2>Payment Successful!</h2>
          <p>Redirecting you back to DripLove app...</p>
          <p><small>Reference: ${reference}</small></p>
          <p><a href="${deepLink}" style="color: white;">Click here if not redirected automatically</a></p>
          <script>
            // Immediate redirect without violating CSP
            setTimeout(function() {
              try {
                // Try deep link first
                window.location.href = '${deepLink}';
                // Fallback to web after 2 seconds
                setTimeout(function() {
                  window.location.href = '${redirectUrl}';
                }, 2000);
              } catch (e) {
                window.location.href = '${redirectUrl}';
              }
            }, 500);
          </script>
        </body>
        </html>
      `, {
        headers: { ...corsHeaders, 'Content-Type': 'text/html' }
      })
    } else {
      // For web, redirect to the app
      return new Response('', {
        status: 302,
        headers: {
          ...corsHeaders,
          Location: redirectUrl
        }
      })
    }
  } catch (error) {
    console.error('Error in paystack-redirect:', error)
    return new Response(JSON.stringify({ error: 'Redirect failed' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }
})