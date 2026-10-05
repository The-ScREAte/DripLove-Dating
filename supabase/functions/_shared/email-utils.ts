// Shared by send-broadcast-email-smtp and process-email-queue. Previously this
// logic was duplicated byte-for-byte in both files, which is exactly how the
// isQuotaError gap (see below) went unnoticed in one copy while being fixed
// in neither - a single source of truth now.

// Stay a safety margin under Gmail's real 500/day cap so we stop rotating
// *before* Gmail starts hard-rejecting mid-batch.
export const DAILY_LIMIT_PER_ACCOUNT = 450;
// A recipient that keeps transient-failing (never a hard bounce, never a
// clean success) stops being retried after this many attempts, so a
// pathological case can't loop forever re-consuming quota every run.
export const MAX_SEND_ATTEMPTS = 5;
// Pacing: hundreds of emails in one burst from a Gmail account is a classic
// spam signal. The queue runs every 5 minutes and each run sends at most
// this many per account, a few at a time with a pause in between.
export const MAX_PER_ACCOUNT_PER_RUN = 25;
export const SEND_CONCURRENCY = 3;
export const SEND_PAUSE_MS = 1000;

export const APP_URL = 'https://www.driplove.love';

export interface SmtpAccount {
  email: string;
  pass: string;
  fromName: string | null;
}

export const isValidEmail = (email: string): boolean => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

// ---------------------------------------------------------------------------
// Failure classification
//
// The old checks treated ANY "5xx" reply as "this recipient's address is bad"
// and checked that before anything else - so Gmail's own sending-limit reply
// ("550-5.4.5 Daily user sending limit exceeded") put 2,117 perfectly good
// customer addresses on the permanent do-not-send list. Sender-side problems
// are now recognised first and never blamed on the recipient.
// ---------------------------------------------------------------------------

export type EmailFailureType =
  | 'sender_quota'        // our account hit its sending limit / rate limit
  | 'sender_auth'         // our account's login was rejected
  | 'sender_blocked'      // our account was disabled / flagged by the provider
  | 'sender_connection'   // couldn't reach / talk to the mail server
  | 'recipient_invalid'   // the address doesn't exist - never send again
  | 'recipient_temporary' // mailbox full / try later - retry
  | 'message_rejected'    // receiving server refused this message (spam/policy)
  | 'unknown';

const has = (m: string, ...needles: string[]) => needles.some((n) => m.includes(n));

const code = (m: string, ...codes: string[]) => codes.some((c) => new RegExp(`(^|[^0-9.])${c.replace(/\./g, '\\.')}([^0-9]|$)`).test(m));

export function classifyEmailError(message: string): EmailFailureType {
  const m = (message || '').toLowerCase();

  // Recipient's own mailbox is full - checked first so "over quota" here is
  // never mistaken for OUR sending quota.
  if (code(m, '5.2.2') || has(m, 'mailbox full', 'mailbox is full', 'over quota', 'insufficient storage')) {
    return 'recipient_temporary';
  }
  if (code(m, '5.4.5', '4.7.28') || has(m, 'sending limit', 'sending quota', 'daily user sending', 'rate limit',
      'rate-limit', 'too many messages', 'too many login attempts', 'try again later, closing connection')) {
    return 'sender_quota';
  }
  if (code(m, '5.7.8', '5.7.9') || /\b(535|534)\b/.test(m) || has(m, 'username and password not accepted',
      'application-specific password', 'authentication failed', 'invalid login', 'eauth')) {
    return 'sender_auth';
  }
  if (has(m, 'account disabled', 'account has been disabled', 'account is disabled for sending', 'suspended',
      'unusual activity', 'temporarily locked')) {
    return 'sender_blocked';
  }
  if (has(m, 'econnection', 'econnrefused', 'econnreset', 'etimedout', 'esocket', 'edns', 'greeting never received',
      'connection timeout', 'connection closed', 'temporary system problem') || code(m, '4.3.0')) {
    return 'sender_connection';
  }
  if (code(m, '5.1.1', '5.1.3', '5.1.10', '5.2.1') || has(m, 'does not exist', 'no such user', 'user unknown',
      'unknown user', 'mailbox unavailable', 'mailbox not found', 'invalid recipient', 'recipient address rejected',
      'recipient rejected', 'address rejected', 'no mailbox', 'unrouteable address', 'not a valid rfc',
      'account that you tried to reach is disabled')) {
    return 'recipient_invalid';
  }
  if (code(m, '5.7.1', '5.7.26', '5.7.0') || has(m, 'spam', 'unsolicited', 'policy', 'blocked', 'unauthenticated')) {
    return 'message_rejected';
  }
  const replyCode = m.match(/\b([45])\d{2}\b/);
  if (replyCode && replyCode[1] === '4') return 'recipient_temporary';
  return 'unknown';
}

export const isSenderProblem = (type: EmailFailureType): boolean => type.startsWith('sender_');

// How long a sending account rests after a sender problem before the health
// check pings it again. Repeated failures back off further.
export function senderPauseMinutes(type: EmailFailureType, consecutiveFailures: number): number {
  const n = Math.max(0, consecutiveFailures - 1);
  switch (type) {
    case 'sender_quota':
      // Gmail's limit is a rolling 24h window: try after 6h, then 12h, then 24h.
      return Math.min(6 * 60 * 2 ** n, 24 * 60);
    case 'sender_auth':
      return Math.min(60 * 2 ** n, 24 * 60);
    case 'sender_blocked':
      return 24 * 60;
    case 'sender_connection':
    default:
      return Math.min(15 * 2 ** n, 4 * 60);
  }
}

// Kept for existing callers, now backed by the classification above.
// Transient = our side or "try later": keep the email queued.
export const isTemporaryError = (message: string): boolean => {
  const type = classifyEmailError(message);
  return isSenderProblem(type) || type === 'recipient_temporary';
};

// Permanent = the recipient address itself is bad: suppress it.
export const isPermanentEmailError = (message: string): boolean =>
  classifyEmailError(message) === 'recipient_invalid';

// ---------------------------------------------------------------------------
// Sending-account health (table email_sender_health)
// ---------------------------------------------------------------------------

// deno-lint-ignore no-explicit-any
type Db = any;

/** Accounts currently paused (resting until the health check clears them). */
export async function loadPausedAccounts(supabase: Db): Promise<Set<string>> {
  const { data, error } = await supabase
    .from('email_sender_health')
    .select('account_email')
    .eq('status', 'paused');
  if (error) {
    console.error('Could not read email_sender_health:', error);
    return new Set();
  }
  return new Set((data || []).map((r: { account_email: string }) => r.account_email));
}

/** Flag a sending account after a sender-side failure. */
export async function pauseSender(supabase: Db, accountEmail: string, type: EmailFailureType, message: string) {
  const { data: existing } = await supabase
    .from('email_sender_health')
    .select('consecutive_failures')
    .eq('account_email', accountEmail)
    .maybeSingle();
  const failures = (existing?.consecutive_failures ?? 0) + 1;
  const minutes = senderPauseMinutes(type, failures);
  const now = new Date();
  const { error } = await supabase.from('email_sender_health').upsert({
    account_email: accountEmail,
    status: 'paused',
    pause_reason: type,
    paused_at: now.toISOString(),
    next_check_at: new Date(now.getTime() + minutes * 60_000).toISOString(),
    consecutive_failures: failures,
    last_error: message.slice(0, 500),
    last_checked_at: now.toISOString(),
    updated_at: now.toISOString(),
  }, { onConflict: 'account_email' });
  if (error) console.error('Could not pause sender:', error);
  console.warn(`Paused sender ${accountEmail} for ${minutes} min (${type})`);
}

/** Clear a sending account's flag after it works again. */
export async function markSenderHealthy(supabase: Db, accountEmail: string) {
  const now = new Date().toISOString();
  const { error } = await supabase.from('email_sender_health').upsert({
    account_email: accountEmail,
    status: 'active',
    pause_reason: null,
    next_check_at: null,
    consecutive_failures: 0,
    last_success_at: now,
    last_checked_at: now,
    updated_at: now,
  }, { onConflict: 'account_email' });
  if (error) console.error('Could not mark sender healthy:', error);
}

// ---------------------------------------------------------------------------
// One-click unsubscribe
//
// Links carry the address plus an HMAC of it, so nobody can unsubscribe
// someone else by editing the link. The key lives in internal_secrets.
// ---------------------------------------------------------------------------

export async function loadUnsubscribeSecret(supabase: Db): Promise<string | null> {
  const { data, error } = await supabase
    .from('internal_secrets')
    .select('value')
    .eq('key', 'email_unsubscribe_secret')
    .maybeSingle();
  if (error || !data?.value) {
    console.error('Unsubscribe secret missing:', error);
    return null;
  }
  return data.value as string;
}

const toBase64Url = (bytes: Uint8Array): string => {
  let binary = '';
  bytes.forEach((b) => { binary += String.fromCharCode(b); });
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};

const fromBase64Url = (value: string): string => {
  const b64 = value.replace(/-/g, '+').replace(/_/g, '/');
  const binary = atob(b64 + '='.repeat((4 - (b64.length % 4)) % 4));
  return new TextDecoder().decode(Uint8Array.from(binary, (c) => c.charCodeAt(0)));
};

export async function unsubscribeToken(secret: string, email: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'],
  );
  const signature = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(email.trim().toLowerCase()));
  return toBase64Url(new Uint8Array(signature)).slice(0, 32);
}

export async function buildUnsubscribeUrl(supabaseUrl: string, secret: string, email: string): Promise<string> {
  const normalized = email.trim().toLowerCase();
  const e = toBase64Url(new TextEncoder().encode(normalized));
  const t = await unsubscribeToken(secret, normalized);
  return `${supabaseUrl}/functions/v1/email-unsubscribe?e=${e}&t=${t}`;
}

/** Returns the address if the link is genuine, otherwise null. */
export async function verifyUnsubscribeLink(secret: string, e: string, t: string): Promise<string | null> {
  try {
    const email = fromBase64Url(e).trim().toLowerCase();
    if (!isValidEmail(email)) return null;
    const expected = await unsubscribeToken(secret, email);
    if (expected.length !== t.length) return null;
    let diff = 0;
    for (let i = 0; i < expected.length; i++) diff |= expected.charCodeAt(i) ^ t.charCodeAt(i);
    return diff === 0 ? email : null;
  } catch {
    return null;
  }
}

/** Headers Gmail/Yahoo use for their own "Unsubscribe" button (RFC 8058). */
export const unsubscribeHeaders = (url: string): Record<string, string> => ({
  'List-Unsubscribe': `<${url}>`,
  'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
});

export const escapeHtml = (value: string): string =>
  String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

/** Starts process-email-queue now instead of waiting for its next 5-minute run. */
export async function kickEmailQueue(supabaseUrl: string, serviceKey: string): Promise<void> {
  try {
    await fetch(`${supabaseUrl}/functions/v1/process-email-queue`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${serviceKey}`, 'Content-Type': 'application/json' },
      body: '{}',
    });
  } catch (error) {
    console.warn('Could not start process-email-queue (the 5-minute schedule will pick it up):', error);
  }
}

export interface SmtpConfig {
  host: string;
  port: number;
  secure: boolean;
}

export function smtpConfig(): SmtpConfig | null {
  const host = Deno.env.get('SMTP_HOST');
  if (!host) return null;
  const port = Number(Deno.env.get('SMTP_PORT') || 587);
  const secure = (Deno.env.get('SMTP_SECURE') || String(port === 465)).toLowerCase() === 'true';
  return { host, port, secure };
}

export const fromAddress = (account: SmtpAccount) => ({
  name: account.fromName || 'DripLove',
  address: account.email,
});

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

export interface DripLoveHtmlOptions {
  /** Inbox preview line (defaults to the subject). */
  preheader?: string;
  /** Adds the "Unsubscribe" footer link when given. */
  unsubscribeUrl?: string;
}

export const buildDripLoveHtml = (subject: string, htmlContent: string, options: DripLoveHtmlOptions = {}): string => {
  const bodyContent = normalizeBodyHtml(htmlContent);
  const title = escapeHtml(subject ? String(subject).trim() : 'A new message from DripLove');
  const previewText = options.preheader ? escapeHtml(options.preheader) : title;
  const unsubscribeRow = options.unsubscribeUrl
    ? `
          <tr>
            <td style="padding:12px 20px 18px 20px;border-top:1px solid #f3f4f6;font-size:11px;line-height:1.6;color:#9ca3af;">
              You're receiving this because you have a DripLove account.
              <a href="${escapeHtml(options.unsubscribeUrl)}" style="color:#6b7280;text-decoration:underline;">Unsubscribe</a>
            </td>
          </tr>`
    : '';

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title}</title>
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
          </tr>${unsubscribeRow}
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
      fromName: Deno.env.get(`EMAIL_FROM_NAME${suffix}`) || Deno.env.get('EMAIL_FROM_NAME') || null,
    });
    index += 1;
  }

  return accounts;
}
