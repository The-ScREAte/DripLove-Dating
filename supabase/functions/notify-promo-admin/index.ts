import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';
import nodemailer from 'npm:nodemailer@6.9.14';

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
    <p><strong>Influencer:</strong> ${escapeHtml(ownerName)}</p>
    <p><strong>New user:</strong> ${escapeHtml(newUserName)}</p>
    <p><strong>New user email:</strong> ${escapeHtml(newUserEmail)}</p>
    <p>Review this influencer's stats in Admin &gt; Influencers.</p>
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

    const host = Deno.env.get('SMTP_HOST');
    const port = Number(Deno.env.get('SMTP_PORT') || 587);
    const secure = (Deno.env.get('SMTP_SECURE') || String(port === 465)).toLowerCase() === 'true';
    const smtpUser = Deno.env.get('SMTP_USER');
    const smtpPass = Deno.env.get('SMTP_PASS');
    const fromName = Deno.env.get('EMAIL_FROM_NAME') || 'DripLove';

    if (!host || !smtpUser || !smtpPass) {
      throw new Error('SMTP is not configured (missing SMTP_HOST/SMTP_USER/SMTP_PASS secrets in Supabase)');
    }

    const { subject, html } = buildEmail(promoCode.code, promoCode.owner_name, payload.newUserName, payload.newUserEmail);

    const transporter = nodemailer.createTransport({ host, port, secure, auth: { user: smtpUser, pass: smtpPass } });
    await transporter.sendMail({
      from: `${fromName} <${smtpUser}>`,
      to: ADMIN_NOTIFY_EMAIL,
      subject,
      html,
    });

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
