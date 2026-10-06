import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';
import { sendWithFailover } from '../_shared/smtp-send.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const ADMIN_NOTIFY_EMAIL = 'driploveofficial@gmail.com';

type NotifyPayload =
  | {
      type: 'advertiser_signup';
      businessName: string;
      contactEmail: string;
      contactPhone: string;
      contactPhoneCountry: string;
    }
  | {
      type: 'ad_submitted';
      adName: string;
      adAbout: string;
      businessName: string;
      contactEmail: string;
      contactPhone: string;
    };

const escapeHtml = (value: string): string =>
  String(value || '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string));

const buildEmail = (payload: NotifyPayload, submittedBy: string): { subject: string; html: string } => {
  if (payload.type === 'advertiser_signup') {
    return {
      subject: `New advertiser application: ${payload.businessName}`,
      html: `
        <h2>New advertiser application</h2>
        <p><strong>Business:</strong> ${escapeHtml(payload.businessName)}</p>
        <p><strong>Contact email:</strong> ${escapeHtml(payload.contactEmail)}</p>
        <p><strong>Contact phone:</strong> ${escapeHtml(payload.contactPhoneCountry)} ${escapeHtml(payload.contactPhone)}</p>
        <p><strong>Submitted by user:</strong> ${escapeHtml(submittedBy)}</p>
        <p>Review and approve/reject this application in the Admin &gt; Ads panel.</p>
      `,
    };
  }
  return {
    subject: `New ad submitted for review: ${payload.adName}`,
    html: `
      <h2>New ad submitted</h2>
      <p><strong>Title:</strong> ${escapeHtml(payload.adName)}</p>
      <p><strong>Description:</strong> ${escapeHtml(payload.adAbout)}</p>
      <p><strong>Business:</strong> ${escapeHtml(payload.businessName)}</p>
      <p><strong>Contact email:</strong> ${escapeHtml(payload.contactEmail)}</p>
      <p><strong>Contact phone:</strong> ${escapeHtml(payload.contactPhone)}</p>
      <p><strong>Submitted by user:</strong> ${escapeHtml(submittedBy)}</p>
      <p>Review and approve it live in Admin &gt; Ads panel.</p>
    `,
  };
};

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

    const { subject, html } = buildEmail(payload, user.email || user.id);

    await sendWithFailover({ to: ADMIN_NOTIFY_EMAIL, subject, html });

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    });
  } catch (error) {
    console.error('notify-ad-admin error:', error);
    return new Response(
      JSON.stringify({ success: false, error: error instanceof Error ? error.message : 'Unknown error' }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
    );
  }
});
