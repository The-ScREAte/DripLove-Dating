import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';
import nodemailer from 'npm:nodemailer@6.9.14';
import { buildDripLoveHtml } from '../_shared/email-utils.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const escapeHtml = (value: string): string =>
  String(value || '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string));

// Public (unauthenticated) function - InfluencerSetPassword.tsx is a public
// page with no Supabase Auth session (promoters aren't auth.users), so this
// can't require a Bearer token the way the admin-invoked notify-promoter-created
// does. It only sends a "you're all set" confirmation to the email already on
// file for the promo code, and requires the code to already be 'active' (i.e.
// set_influencer_password already succeeded) - worst case of misuse is a
// promoter getting a duplicate confirmation email, not any data disclosure.
serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { promoCodeId, appUrl } = await req.json();
    if (!promoCodeId || !appUrl) throw new Error('promoCodeId and appUrl are required');

    const { data: promoCode, error: promoError } = await supabase
      .from('promo_codes')
      .select('code, owner_name, email, status')
      .eq('id', promoCodeId)
      .is('deleted_at', null)
      .single();

    if (promoError || !promoCode) throw new Error('Promo code not found');
    if (!promoCode.email) throw new Error('This promoter has no email on file');
    if (promoCode.status !== 'active') throw new Error('Password has not been set for this promo code');

    const host = Deno.env.get('SMTP_HOST');
    const port = Number(Deno.env.get('SMTP_PORT') || 587);
    const secure = (Deno.env.get('SMTP_SECURE') || String(port === 465)).toLowerCase() === 'true';
    const smtpUser = Deno.env.get('SMTP_USER');
    const smtpPass = Deno.env.get('SMTP_PASS');
    const fromName = Deno.env.get('EMAIL_FROM_NAME') || 'DripLove';

    if (!host || !smtpUser || !smtpPass) {
      throw new Error('SMTP is not configured (missing SMTP_HOST/SMTP_USER/SMTP_PASS secrets in Supabase)');
    }

    const loginLink = `${appUrl}/influencer`;
    const subject = 'Your DripLove Promoter account is ready';
    const bodyContent = `
      <h2 style="margin:0 0 12px 0;font-size:19px;color:#111827;">You're all set, ${escapeHtml(promoCode.owner_name)}!</h2>
      <p style="margin:0 0 14px 0;">Your password has been set and your DripLove Promoter account is ready to go.</p>
      <p style="margin:0 0 18px 0;">Log in any time with your promo code <strong>${escapeHtml(promoCode.code)}</strong> and your new password:</p>
      <p style="margin:0 0 14px 0;">
        <a href="${loginLink}" style="display:inline-block;padding:12px 24px;background:#db2777;color:#ffffff;border-radius:8px;text-decoration:none;font-weight:600;">Log In to Your Promoter Portal</a>
      </p>
      <p style="margin:0;font-size:13px;color:#6b7280;">Or copy this link into your browser:<br/>${escapeHtml(loginLink)}</p>
    `;
    const html = buildDripLoveHtml(subject, bodyContent);

    const transporter = nodemailer.createTransport({ host, port, secure, auth: { user: smtpUser, pass: smtpPass } });
    await transporter.sendMail({
      from: `${fromName} <${smtpUser}>`,
      to: promoCode.email,
      subject,
      html,
    });

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    });
  } catch (error) {
    console.error('notify-promoter-password-set error:', error);
    return new Response(
      JSON.stringify({ success: false, error: error instanceof Error ? error.message : 'Unknown error' }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
    );
  }
});
