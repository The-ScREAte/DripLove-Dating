// Shared by send-broadcast-email-smtp and process-email-queue. Previously this
// logic was duplicated byte-for-byte in both files, which is exactly how the
// isQuotaError gap (see below) went unnoticed in one copy while being fixed
// in neither - a single source of truth now.

export const DEFAULT_BATCH_SIZE = 15;
export const DEFAULT_BATCH_DELAY_MS = 500;
// Stay a safety margin under Gmail's real 500/day cap so we stop rotating
// *before* Gmail starts hard-rejecting mid-batch.
export const DAILY_LIMIT_PER_ACCOUNT = 450;
// A recipient that keeps transient-failing (never a hard bounce, never a
// clean success) stops being retried after this many attempts, so a
// pathological case can't loop forever re-consuming quota every run.
export const MAX_SEND_ATTEMPTS = 5;

export interface SmtpAccount {
  email: string;
  pass: string;
  fromName: string | null;
}

export const isValidEmail = (email: string): boolean => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

// Transient/retry-worthy: the SENDING side's problem (account rate-limited,
// or the receiving server said "try again later"), never the recipient's
// fault. SMTP convention: a 4xx reply code means temporary - worth retrying;
// only 5xx means permanent. Originally this only matched Gmail's own
// login-throttle wording ("too many login attempts", "5.4.5"), which missed
// the "421 4.3.0 Temporary System Problem" errors actually seen in
// production - any generic 4xx code now also counts.
export const isTemporaryError = (message: string): boolean => {
  const m = message.toLowerCase();
  if (m.includes('limit') || m.includes('quota') || m.includes('5.4.5') || m.includes('too many login attempts')) {
    return true;
  }
  const codeMatch = m.match(/\b([45]\d{2})\b/);
  return codeMatch ? codeMatch[1].startsWith('4') : false;
};

// Permanent (hard bounce): this address will never succeed, so it's
// suppressed from every future broadcast instead of being retried forever.
export const isPermanentEmailError = (message: string): boolean => {
  const m = message.toLowerCase();
  const codeMatch = m.match(/\b([45]\d{2})\b/);
  if (codeMatch) return codeMatch[1].startsWith('5');
  return (
    m.includes('no such user') ||
    m.includes('user unknown') ||
    m.includes('does not exist') ||
    m.includes('mailbox unavailable') ||
    m.includes('mailbox not found') ||
    m.includes('invalid recipient') ||
    m.includes('recipient rejected') ||
    m.includes('address rejected') ||
    m.includes('no mailbox') ||
    m.includes('unrouteable address')
  );
};

export const htmlToText = (html: string): string =>
  String(html || '')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

export const normalizeBodyHtml = (html: string): string => {
  const value = String(html || '').trim();
  if (!value) return '';
  const bodyMatch = value.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
  return bodyMatch ? bodyMatch[1].trim() : value;
};

export const buildDripLoveHtml = (subject: string, htmlContent: string): string => {
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
                <a href="https://www.tiktok.com/@driplovedating?_r=1&_t=ZN-98auX3Ma9qc" style="color:#0b5cff;text-decoration:none;">TikTok</a>
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

export const getErrorMessage = (error: unknown): string => {
  if (error instanceof Error) return error.message;
  return 'Unknown SMTP error';
};

// Reads SMTP_USER/SMTP_PASS/EMAIL_FROM_NAME as account 1, then SMTP_USER_2/SMTP_PASS_2/...,
// SMTP_USER_3/... for as many additional sending accounts as are configured.
export function loadAccounts(): SmtpAccount[] {
  const accounts: SmtpAccount[] = [];
  let index = 1;

  while (true) {
    const suffix = index === 1 ? '' : `_${index}`;
    const email = Deno.env.get(`SMTP_USER${suffix}`);
    const pass = Deno.env.get(`SMTP_PASS${suffix}`);
    if (!email || !pass) break;

    accounts.push({
      email,
      pass,
      fromName: Deno.env.get(`EMAIL_FROM_NAME${suffix}`) || Deno.env.get('EMAIL_FROM_NAME'),
    });
    index += 1;
  }

  return accounts;
}
