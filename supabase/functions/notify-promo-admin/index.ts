import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';
import { sendWithFailover } from '../_shared/smtp-send.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const ADMIN_NOTIFY_EMAIL = 'driploveofficial@gmail.com';

interface NotifyPayload {
  promoCodeId: string;
  newUserName: string;
  newUserEmail: string;
}

const escapeHtml = (value: string): string =>
  String(value || '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string));

const buildEmail = (
  promoCode: string,
  ownerName: string,
  newUserName: string,
  newUserEmail: string
): { subject: string; html: string } => ({
  subject: `Promo code used: ${promoCode}`,
  html: `
    <h2>Promo code redeemed at signup</h2>
    <p><strong>Promo code:</strong> ${escapeHtml(promoCode)}</p>
    <p><strong>Promoter:</strong> ${escapeHtml(ownerName)}</p>
    <p><strong>New user:</strong> ${escapeHtml(newUserName)}</p>
    <p><strong>New user email:</strong> ${escapeHtml(newUserEmail)}</p>
    <p>Review this promoter's stats in Admin &gt; Promoters.</p>
  `,
});

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const authHeader = req.headers.get('Authorization');
    if (!authHeader) throw new Error('Missing authorization header');
    const token = authHeader.replace('Bearer ', '');

    const { data: { user }, error: userError } = await supabase.auth.getUser(token);
    if (userError || !user) throw new Error('Unauthorized');

    const payload: NotifyPayload = await req.json();
    if (!payload.promoCodeId) throw new Error('Missing promoCodeId');

    // Look up the code/owner server-side rather than trusting client-supplied
    // values - the client only ever has the promo_code_id from validate_promo_code.
    const { data: promoCode, error: promoError } = await supabase
      .from('promo_codes')
      .select('code, owner_name')
      .eq('id', payload.promoCodeId)
      .single();

    if (promoError || !promoCode) throw new Error('Promo code not found');

    const { subject, html } = buildEmail(promoCode.code, promoCode.owner_name, payload.newUserName, payload.newUserEmail);

    await sendWithFailover({ to: ADMIN_NOTIFY_EMAIL, subject, html });

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    });
  } catch (error) {
    console.error('notify-promo-admin error:', error);
    return new Response(
      JSON.stringify({ success: false, error: error instanceof Error ? error.message : 'Unknown error' }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
    );
  }
});
