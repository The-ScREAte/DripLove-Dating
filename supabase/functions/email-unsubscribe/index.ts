import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';
import { loadUnsubscribeSecret, verifyUnsubscribeLink } from '../_shared/email-utils.ts';

// The "Unsubscribe" link in every DripLove email, and the one-click
// unsubscribe Gmail/Yahoo show next to the sender (RFC 8058 POST).
// Links are signed (see buildUnsubscribeUrl), so nobody can unsubscribe
// someone else. The address goes on email_suppression_list with reason
// 'unsubscribed', which every email path checks before sending.
// Deployed with verify_jwt off: it's opened from email apps, not the app.

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const reply = (text: string, status = 200) =>
  new Response(text, { status, headers: { ...corsHeaders, 'Content-Type': 'text/plain; charset=utf-8' } });

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'GET' && req.method !== 'POST') return reply('Method not allowed', 405);

  const url = new URL(req.url);
  const e = url.searchParams.get('e') ?? '';
  const t = url.searchParams.get('t') ?? '';
  if (!e || !t) return reply('This unsubscribe link is incomplete.', 400);

  const supabase = createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '');
  const secret = await loadUnsubscribeSecret(supabase);
  if (!secret) return reply('Something went wrong on our side. Please try again later.', 500);

  const email = await verifyUnsubscribeLink(secret, e, t);
  if (!email) return reply('This unsubscribe link is not valid.', 400);

  const { error } = await supabase.from('email_suppression_list').upsert({
    email,
    reason: 'unsubscribed',
    last_error: `Unsubscribed via ${req.method === 'POST' ? 'one-click (mail app)' : 'email link'}`,
    released_at: null,
    released_reason: null,
  }, { onConflict: 'email' });
  if (error) {
    console.error('Unsubscribe failed:', error);
    return reply('Something went wrong on our side. Please try again later.', 500);
  }

  // Cancel anything already queued for them.
  await supabase
    .from('email_send_queue')
    .update({ status: 'failed', failure_type: 'suppressed', error: 'Not sent: unsubscribed' })
    .eq('recipient', email)
    .eq('status', 'pending');

  return reply(
    `You're unsubscribed.\n\n${email} won't receive DripLove update emails any more. ` +
    'Account emails you ask for (like password resets) still arrive.\n\nDripLove',
  );
});
