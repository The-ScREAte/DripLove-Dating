import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';
import nodemailer from 'npm:nodemailer@6.9.14';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const DEFAULT_BATCH_SIZE = 15;
const DEFAULT_BATCH_DELAY_MS = 500;

interface BroadcastEmailRequest {
  recipients: string[];
  subject: string;
  htmlContent: string;
  textContent?: string;
}

const isValidEmail = (email: string): boolean => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

const htmlToText = (html: string): string =>
  String(html || '')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const normalizeBodyHtml = (html: string): string => {
  const value = String(html || '').trim();
  if (!value) return '';
  const bodyMatch = value.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
  return bodyMatch ? bodyMatch[1].trim() : value;
};

const buildDripLoveHtml = (subject: string, htmlContent: string): string => {
  const bodyContent = normalizeBodyHtml(htmlContent);
  const previewText = subject ? String(subject).trim() : 'A new message from DripLove';

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${previewText}</title>
</head>
<body style="margin:0;padding:0;background-color:#f7f7f7;font-family:Arial,Helvetica,sans-serif;color:#1f2937;">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">${previewText}</div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f7f7f7;padding:24px 12px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:620px;background:#ffffff;border:1px solid #e5e7eb;border-radius:10px;overflow:hidden;">
          <tr>
            <td style="padding:16px 20px;border-bottom:1px solid #e5e7eb;background:#ffffff;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td style="vertical-align:middle;width:40px;">
                    <img src="https://www.driplove.love/driplove-logo.png" alt="DripLove" width="32" height="32" style="display:block;border-radius:8px;border:0;">
                  </td>
                  <td style="vertical-align:middle;padding-left:10px;">
                    <div style="font-size:16px;font-weight:700;line-height:1.3;color:#111827;">DripLove</div>
                    <div style="font-size:12px;line-height:1.5;color:#6b7280;">Official account update</div>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td style="padding:22px 20px 14px 20px;font-size:15px;line-height:1.7;color:#1f2937;">
              ${bodyContent}
            </td>
          </tr>
          <tr>
            <td style="padding:0 20px 18px 20px;font-size:12px;line-height:1.6;color:#6b7280;">
              <div style="font-size:12px;font-weight:600;color:#374151;margin-bottom:6px;">Connect with DripLove</div>
              <div>
                <a href="https://www.instagram.com/driplove_official?utm_source=qr" style="color:#0b5cff;text-decoration:none;">Instagram</a>
                <span style="color:#9ca3af;"> | </span>
                <a href="https://www.tiktok.com/@silencewin3?_r=1&_t=ZN-988z4wA6UnG" style="color:#0b5cff;text-decoration:none;">TikTok</a>
                <span style="color:#9ca3af;"> | </span>
                <a href="https://www.facebook.com/share/1Cp18uWDZP/?mibextid=wwXIfr" style="color:#0b5cff;text-decoration:none;">Facebook</a>
              </div>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
  `;
};

const getErrorMessage = (error: unknown): string => {
  if (error instanceof Error) return error.message;
  return 'Unknown SMTP error';
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

    // Trusted server-to-server call (e.g. from process-scheduled-broadcasts) using the
    // service role key directly — skip the admin-user lookup since the caller is already trusted.
    const isServiceRoleCall = token === supabaseServiceKey;

    if (!isServiceRoleCall) {
      const { data: { user }, error: userError } = await supabase.auth.getUser(token);
      if (userError || !user) throw new Error('Unauthorized');

      const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('is_admin')
        .eq('id', user.id)
        .single();

      if (profileError || !profile?.is_admin) throw new Error('Forbidden: Admin access required');
    }

    const body: BroadcastEmailRequest = await req.json();
    const { recipients, subject, htmlContent, textContent } = body;

    if (!Array.isArray(recipients) || recipients.length === 0) {
      throw new Error('No recipients provided');
    }
    if (!subject || !htmlContent) {
      throw new Error('Subject and htmlContent are required');
    }

    const host = Deno.env.get('SMTP_HOST');
    const port = Number(Deno.env.get('SMTP_PORT') || 587);
    const smtpUser = Deno.env.get('SMTP_USER') || Deno.env.get('EMAIL_USER');
    const smtpPass = Deno.env.get('SMTP_PASS') || Deno.env.get('EMAIL_PASSWORD');
    const secure = (Deno.env.get('SMTP_SECURE') || String(port === 465)).toLowerCase() === 'true';
    const fromAddress = Deno.env.get('EMAIL_FROM') || smtpUser;
    const fromName = Deno.env.get('EMAIL_FROM_NAME');

    if (!host || !smtpUser || !smtpPass || !fromAddress) {
      throw new Error('SMTP is not configured (missing SMTP_HOST, SMTP_USER, SMTP_PASS, or EMAIL_FROM secret in Supabase)');
    }

    const transporter = nodemailer.createTransport({
      host,
      port,
      secure,
      auth: { user: smtpUser, pass: smtpPass },
    });

    const brandedHtml = buildDripLoveHtml(subject, htmlContent);
    const brandedText = textContent || htmlToText(normalizeBodyHtml(htmlContent));

    const seen = new Set<string>();
    const accepted: string[] = [];
    const rejected: Array<{ email: string; error: string }> = [];

    for (const raw of recipients) {
      const email = String(raw || '').trim().toLowerCase();
      if (!email || seen.has(email)) continue;
      seen.add(email);
      if (!isValidEmail(email)) {
        rejected.push({ email, error: 'Invalid email format' });
        continue;
      }
      accepted.push(email);
    }

    const successful: string[] = [];
    const failed: Array<{ email: string; error: string }> = [...rejected];
    const batchSize = DEFAULT_BATCH_SIZE;

    for (let i = 0; i < accepted.length; i += batchSize) {
      const batch = accepted.slice(i, i + batchSize);

      const results = await Promise.allSettled(
        batch.map((to) =>
          transporter.sendMail({
            from: fromName ? `${fromName} <${fromAddress}>` : fromAddress,
            to,
            subject,
            html: brandedHtml,
            text: brandedText,
          })
        )
      );

      results.forEach((result, index) => {
        const email = batch[index];
        if (result.status === 'fulfilled') {
          successful.push(email);
        } else {
          failed.push({ email, error: getErrorMessage(result.reason) });
        }
      });

      if (i + batchSize < accepted.length) {
        await new Promise((resolve) => setTimeout(resolve, DEFAULT_BATCH_DELAY_MS));
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        provider: 'smtp-nodemailer',
        results: {
          sent: successful.length,
          failed: failed.length,
          details: { successful, failed },
        },
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
    );
  } catch (error) {
    console.error('Broadcast email error:', error);
    return new Response(
      JSON.stringify({ success: false, error: getErrorMessage(error) }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
    );
  }
});
