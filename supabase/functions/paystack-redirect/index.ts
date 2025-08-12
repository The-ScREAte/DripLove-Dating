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
    const status = url.searchParams.get('status') || 'unknown'
    const reference = url.searchParams.get('reference') || url.searchParams.get('tx_ref') || 'unknown'
    const paymentType = url.searchParams.get('payment_type') || 'unknown'
    
    console.log('Paystack redirect received:', { status, reference, paymentType })
    
    // Create the redirect URL to your app
    const redirectUrl = `https://dating-buddy-companion.lovable.app/payment-success?status=${encodeURIComponent(status)}&tx_ref=${encodeURIComponent(reference)}&payment_type=${encodeURIComponent(paymentType)}`
    
    // Return HTML that redirects to your app
    const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <title>Payment Complete</title>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1">
    </head>
    <body>
      <div style="text-align: center; padding: 50px; font-family: Arial, sans-serif;">
        <h2>Payment ${status === 'successful' ? 'Successful' : 'Processing'}!</h2>
        <p>Redirecting you back to the app...</p>
        <script>
          // Immediate redirect
          window.location.href = "${redirectUrl}";
        </script>
        <noscript>
          <a href="${redirectUrl}">Click here if you're not redirected automatically</a>
        </noscript>
      </div>
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