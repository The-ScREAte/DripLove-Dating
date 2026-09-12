import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Public (unauthenticated) function - the Forgot Password screen calls this
// BEFORE the user has a session, to find out whether an email belongs to a
// Google/Apple account so it can point them at the right sign-in method
// instead of sending a password-reset email for an account with no
// password. Only returns the provider list (e.g. ["google"], ["email"], or
// [] if no account exists) - never any other user data - via the
// get_email_auth_providers() SECURITY DEFINER function, which is the only
// thing with read access to auth.identities here.
//
// This does reveal whether an email is registered at all (an intentional,
// narrow exception to Supabase's usual anti-enumeration behavior on
// resetPasswordForEmail) - accepted as a deliberate product tradeoff so
// users aren't told to "check their email" for a reset that will never work.
serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { email } = await req.json();
    if (!email || typeof email !== 'string') throw new Error('email is required');

    const { data, error } = await supabase.rpc('get_email_auth_providers', {
      p_email: email,
    });

    if (error) throw error;

    return new Response(JSON.stringify({ providers: data || [] }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    });
  } catch (error) {
    console.error('check-auth-provider error:', error);
    // Fail closed on the response shape (empty providers) but with a 200 so
    // the client's fail-open logic (proceed with normal reset on any error)
    // still gets valid JSON to parse either way.
    return new Response(JSON.stringify({ providers: [], error: error instanceof Error ? error.message : 'Unknown error' }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    });
  }
});
