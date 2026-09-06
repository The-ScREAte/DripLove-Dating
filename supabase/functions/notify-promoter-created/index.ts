import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';
import nodemailer from 'npm:nodemailer@6.9.14';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const escapeHtml = (value: string): string =>
  String(value || '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string));

// Admin-only: emails a newly created (or re-issued) promoter their password
// setup link and promo code. The setup link's token is promo_codes.password_hash
// itself - only readable here because this function uses the service role key,
// which bypasses the REVOKE SELECT (password_hash) restriction placed on
// authenticated/anon clients. Safe to call again later (e.g. from the admin
// panel's "Setup Link" button on a still-pending promoter) since
// admin_get_promo_setup_link() always re-generates a fresh token first.
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

    const { data: adminProfile } = await supabase
      .from('profiles')
      .select('is_admin')
      .eq('id', user.id)
      .single();
    if (!adminProfile?.is_admin) throw new Error('Forbidden: Admin access required');

    const { promoCodeId, appUrl } = await req.json();
    if (!promoCodeId || !appUrl) throw new Error('promoCodeId and appUrl are required');

    const { data: promoCode, error: promoError } = await supabase
      .from('promo_codes')
      .select('code, owner_name, email, password_hash, status')
      .eq('id', promoCodeId)
      .is('deleted_at', null)
      .single();

    if (promoError || !promoCode) throw new Error('Promo code not found');
    if (!promoCode.email) throw new Error('This promoter has no email on file');
    if (promoCode.status !== 'pending_password' || !promoCode.password_hash) {
      throw new Error('This promoter has already set their password');
    }

    const setupLink = `${appUrl}/influencer/set-password?id=${promoCodeId}&token=${encodeURIComponent(promoCode.password_hash)}`;

    const host = Deno.env.get('SMTP_HOST');
    const port = Number(Deno.env.get('SMTP_PORT') || 587);
    const secure = (Deno.env.get('SMTP_SECURE') || String(port === 465)).toLowerCase() === 'true';
    const smtpUser = Deno.env.get('SMTP_USER');
    const smtpPass = Deno.env.get('SMTP_PASS');
    const fromName = Deno.env.get('EMAIL_FROM_NAME') || 'DripLove';

    if (!host || !smtpUser || !smtpPass) {
      throw new Error('SMTP is not configured (missing SMTP_HOST/SMTP_USER/SMTP_PASS secrets in Supabase)');
    }

    const html = `
      <h2>Welcome to the DripLove Promoter Program, ${escapeHtml(promoCode.owner_name)}!</h2>
      <p>You've been set up as a promoter. Your promo code is:</p>
      <p style="font-size:20px;font-weight:bold;letter-spacing:1px;">${escapeHtml(promoCode.code)}</p>
      <p>Before you can log in to your Promoter Portal, set your password using the link below:</p>
      <p><a href="${setupLink}" style="display:inline-block;padding:10px 20px;background:#ec4899;color:#fff;border-radius:6px;text-decoration:none;">Set Your Password</a></p>
      <p style="font-size:13px;color:#666;">Or copy this link into your browser:<br/>${escapeHtml(setupLink)}</p>
      <p>Once your password is set, log in any time at <strong>${escapeHtml(appUrl)}/influencer</strong> with your promo code and password to see your leads, subscribers, and earnings.</p>
    `;

    const transporter = nodemailer.createTransport({ host, port, secure, auth: { user: smtpUser, pass: smtpPass } });
    await transporter.sendMail({
      from: `${fromName} <${smtpUser}>`,
      to: promoCode.email,
      subject: 'Set up your DripLove Promoter account',
      html,
    });

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    });
  } catch (error) {
    console.error('notify-promoter-created error:', error);
    return new Response(
      JSON.stringify({ success: false, error: error instanceof Error ? error.message : 'Unknown error' }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
    );
  }
});
