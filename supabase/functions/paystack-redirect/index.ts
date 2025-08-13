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
      // For production - use your actual app domain
      webRedirectUrl = `https://dating-buddy-companion.lovable.app/payment-success?status=${encodeURIComponent(status)}&reference=${encodeURIComponent(reference || '')}&payment_type=${encodeURIComponent(paymentType)}`
    }
    
    // Always create deep link for mobile
    deepLinkUrl = `driplove://payment/callback?status=${encodeURIComponent(status)}&reference=${encodeURIComponent(reference || '')}&payment_type=${encodeURIComponent(paymentType)}`
    
    // Simple immediate redirect
    const redirectUrl = isLocalhost ? webRedirectUrl : webRedirectUrl
    
    return new Response(null, {
      status: 302,
      headers: {
        ...corsHeaders,
        'Location': redirectUrl,
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