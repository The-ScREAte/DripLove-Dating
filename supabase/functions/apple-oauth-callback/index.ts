import { serve } from "https://deno.land/std@0.168.0/http/server.ts"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req: Request) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    console.log('🍎 Apple OAuth callback received:', req.method, req.url)
    
    if (req.method === 'POST') {
      // Handle Apple's form_post callback
      const formData = await req.formData()
      
      const code = formData.get('code')?.toString()
      const state = formData.get('state')?.toString()
      const error = formData.get('error')?.toString()
      const user = formData.get('user')?.toString() // Apple user data (if first time)
      
      console.log('🍎 Apple form_post data:', {
        hasCode: !!code,
        hasState: !!state,
        error: error,
        hasUser: !!user
      })
      
      if (error) {
        // Redirect back to frontend with error
        const errorUrl = `${req.headers.get('origin') || 'http://localhost:8081'}/auth/apple-callback?error=${encodeURIComponent(error)}`
        return Response.redirect(errorUrl, 302)
      }
      
      if (code && state) {
        // Redirect back to frontend with the code and state as URL parameters
        let callbackUrl = `${req.headers.get('origin') || 'http://localhost:8081'}/auth/apple-callback?code=${encodeURIComponent(code)}&state=${encodeURIComponent(state)}`
        
        if (user) {
          // Also include user data if available
          callbackUrl += `&user=${encodeURIComponent(user)}`
        }
        
        console.log('🍎 Redirecting to frontend:', callbackUrl)
        return Response.redirect(callbackUrl, 302)
      }
    }
    
    // For GET requests or other cases, just redirect to the main app
    const frontendUrl = req.headers.get('origin') || 'http://localhost:8081'
    return Response.redirect(`${frontendUrl}/?error=invalid_apple_callback`, 302)
    
  } catch (error) {
    console.error('🍎 Apple OAuth callback error:', error)
    const frontendUrl = req.headers.get('origin') || 'http://localhost:8081'
    return Response.redirect(`${frontendUrl}/?error=callback_processing_failed`, 302)
  }
})