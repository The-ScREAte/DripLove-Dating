import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';
import nodemailer from 'npm:nodemailer@6.9.14';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Admin-only: emails an advertiser once their application is approved or
// rejected. The in-app notification row is created directly by the admin
// panel itself (notifications' RLS already allows any authenticated insert,
// same as every other in-app notification in this app) - this only handles
// the email half.
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

    const { contactEmail, businessName, status } = await req.json();
    if (!contactEmail || !businessName || !status) {
      throw new Error('contactEmail, businessName and status are required');
    }
    if (status !== 'approved' && status !== 'rejected') {
      throw new Error('status must be "approved" or "rejected"');
    }

    const host = Deno.env.get('SMTP_HOST');
    const port = Number(Deno.env.get('SMTP_PORT') || 587);
    const secure = (Deno.env.get('SMTP_SECURE') || String(port === 465)).toLowerCase() === 'true';
    const smtpUser = Deno.env.get('SMTP_USER');
    const smtpPass = Deno.env.get('SMTP_PASS');
    const fromName = Deno.env.get('EMAIL_FROM_NAME') || 'DripLove';

    if (!host || !smtpUser || !smtpPass) {
      throw new Error('SMTP is not configured (missing SMTP_HOST/SMTP_USER/SMTP_PASS secrets in Supabase)');
    }

    const subject = status === 'approved'
      ? `You're approved to advertise on DripLove, ${businessName}!`
      : `Update on your DripLove advertiser application`;

    const html = status === 'approved'
      ? `
        <h2>You're approved!</h2>
        <p>Great news - <strong>${businessName}</strong> has been approved to advertise on DripLove.</p>
        <p>You can now create ads from Profile &gt; Advertisement in the app. Each ad is reviewed before going
        live, and charges are made to your card on file based on the ad's price and how many days it runs.</p>
      `
      : `
        <h2>Advertiser application update</h2>
        <p>Thanks for your interest in advertising on DripLove. After review, we're not able to approve
        <strong>${businessName}</strong>'s advertiser application at this time.</p>
        <p>If you have questions, reach out to driploveofficial@gmail.com.</p>
      `;

    const transporter = nodemailer.createTransport({ host, port, secure, auth: { user: smtpUser, pass: smtpPass } });
    await transporter.sendMail({
      from: `${fromName} <${smtpUser}>`,
      to: contactEmail,
      subject,
      html,
    });

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    });
  } catch (error) {
    console.error('notify-advertiser-status error:', error);
    return new Response(
      JSON.stringify({ success: false, error: error instanceof Error ? error.message : 'Unknown error' }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
    );
  }
});
