import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const url = new URL(req.url)
    const status = url.searchParams.get('status') || 'successful'
    const reference = url.searchParams.get('reference') || url.searchParams.get('tx_ref') || url.searchParams.get('trxref')
    const paymentType = url.searchParams.get('payment_type') || 'unknown'
    
    console.log('Paystack redirect received:', { status, reference, paymentType })
    
    // Detect if this is a development/localhost request
    const referer = req.headers.get('referer') || ''
    const isLocalhost = referer.includes('localhost') || url.searchParams.get('dev') === 'true'
    
    // Create appropriate redirect URLs
    let webRedirectUrl, deepLinkUrl
    
    if (isLocalhost || url.searchParams.get('dev') === 'true') {
      // For localhost development
      webRedirectUrl = `http://localhost:8080/payment-success?status=${encodeURIComponent(status)}&reference=${encodeURIComponent(reference || '')}&payment_type=${encodeURIComponent(paymentType)}`
    } else {
      // For production - use relative path so it works on any domain
      webRedirectUrl = `/payment-success?status=${encodeURIComponent(status)}&reference=${encodeURIComponent(reference || '')}&payment_type=${encodeURIComponent(paymentType)}`
    }
    
    // Always create deep link for mobile
    deepLinkUrl = `driplove://payment/callback?status=${encodeURIComponent(status)}&reference=${encodeURIComponent(reference || '')}&payment_type=${encodeURIComponent(paymentType)}`
    
    // Return simple HTML with meta refresh (CSP compliant)
    const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <title>Payment Complete</title>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1">
      <meta http-equiv="refresh" content="1;url=${isLocalhost ? webRedirectUrl : deepLinkUrl}">
    </head>
    <body style="text-align: center; padding: 50px; font-family: Arial, sans-serif; background: #667eea; color: white;">
      <h2>Payment ${status === 'successful' ? 'Successful' : 'Processing'}!</h2>
      <p>Redirecting you back to DripLove app...</p>
      <p><small>Reference: ${reference || 'N/A'}</small></p>
      <p><a href="${isLocalhost ? webRedirectUrl : deepLinkUrl}" style="color: white;">Click here if not redirected automatically</a></p>
      <script>
        // Immediate redirect without violating CSP
        setTimeout(function() {
          try {
            if (${isLocalhost}) {
              window.location.href = '${webRedirectUrl}';
            } else {
              // Try deep link first
              window.location.href = '${deepLinkUrl}';
              // Fallback to web after 2 seconds
              setTimeout(function() {
                window.location.href = '${webRedirectUrl}';
              }, 2000);
            }
          } catch (e) {
            window.location.href = '${webRedirectUrl}';
          }
        }, 500);
      </script>
    </body>
    </html>
    `
    
    return new Response(html, {
      headers: {
        ...corsHeaders,
        'content-type': 'text/html',
      },
    })
  } catch (error) {
    console.error('Paystack redirect error:', error)
    
    // Fallback redirect to app
    const fallbackUrl = 'https://dating-buddy-companion.lovable.app/payment-success?status=error'
    const html = `
    <!DOCTYPE html>
    <html>
    <body>
      <script>window.location.href = "${fallbackUrl}";</script>
      <noscript><a href="${fallbackUrl}">Continue to app</a></noscript>
    </body>
    </html>
    `
    
    return new Response(html, {
      headers: {
        ...corsHeaders,
        'content-type': 'text/html',
      },
    })
  }
})