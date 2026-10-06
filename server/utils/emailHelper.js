const nodemailer = require('nodemailer');

const DEFAULT_BATCH_SIZE = 20;
const DEFAULT_BATCH_DELAY_MS = 1000;

let accounts;

function parseBoolean(value, fallback = false) {
  if (typeof value !== 'string') return fallback;
  return ['1', 'true', 'yes', 'on'].includes(value.toLowerCase());
}

// smtpServer('SMTP_PRIMARY', '') reads SMTP_PRIMARY_HOST/_PORT/_SECURE;
// smtpServer('SMTP', '_2') reads SMTP_HOST_2/SMTP_PORT_2/SMTP_SECURE_2.
function smtpServer(prefix, suffix) {
  const host = process.env[`${prefix}_HOST${suffix}`] || (prefix === 'SMTP' && !suffix ? process.env.EMAIL_SMTP_HOST : undefined);
  if (!host) return null;
  const port = Number(process.env[`${prefix}_PORT${suffix}`] || 587);
  return { host, port, secure: parseBoolean(process.env[`${prefix}_SECURE${suffix}`], port === 465) };
}

function createTransport(server, user, pass) {
  return nodemailer.createTransport({
    ...server,
    auth: { user, pass },
    pool: true,
    maxConnections: Number(process.env.SMTP_MAX_CONNECTIONS || 5),
    maxMessages: Number(process.env.SMTP_MAX_MESSAGES || 100),
    connectionTimeout: Number(process.env.SMTP_CONNECTION_TIMEOUT_MS || 15000),
    socketTimeout: Number(process.env.SMTP_SOCKET_TIMEOUT_MS || 30000),
  });
}

// Sending accounts in the order they're tried: the primary (info@driplove.love
// on Private Email, SMTP_PRIMARY_*) first, then the Gmail backups
// SMTP_USER/SMTP_PASS, SMTP_USER_2/SMTP_PASS_2, ... on SMTP_HOST.
function getAccounts() {
  if (accounts) return accounts;
  accounts = [];

  const primaryUser = process.env.SMTP_PRIMARY_USER;
  const primaryPass = process.env.SMTP_PRIMARY_PASS;
  const primaryServer = smtpServer('SMTP_PRIMARY', '');
  if (primaryUser && primaryPass && primaryServer) {
    accounts.push({
      user: primaryUser,
      fromName: process.env.EMAIL_FROM_NAME_PRIMARY || process.env.EMAIL_FROM_NAME,
      transporter: createTransport(primaryServer, primaryUser, primaryPass),
    });
  }

  const sharedServer = smtpServer('SMTP', '');
  for (let index = 1; ; index += 1) {
    const suffix = index === 1 ? '' : `_${index}`;
    const user = index === 1
      ? process.env.SMTP_USER || process.env.EMAIL_USER || process.env.NOTIFY_EMAIL_USER || process.env.ADMIN_NOTIFY_EMAIL_USER
      : process.env[`SMTP_USER${suffix}`];
    const pass = index === 1
      ? process.env.SMTP_PASS || process.env.EMAIL_PASSWORD || process.env.NOTIFY_EMAIL_PASSWORD || process.env.ADMIN_NOTIFY_EMAIL_PASSWORD
      : process.env[`SMTP_PASS${suffix}`];
    if (!user || !pass) break;

    const server = (suffix && smtpServer('SMTP', suffix)) || sharedServer;
    if (server && user !== primaryUser) {
      accounts.push({
        user,
        fromName: process.env[`EMAIL_FROM_NAME${suffix}`] || process.env.EMAIL_FROM_NAME,
        transporter: createTransport(server, user, pass),
      });
    }
  }

  if (accounts.length === 0) {
    throw new Error('SMTP config missing. Required: SMTP_PRIMARY_HOST/USER/PASS or SMTP_HOST, SMTP_USER, SMTP_PASS');
  }
  return accounts;
}

function isRecipientInvalid(message) {
  return /\b5\.1\.(1|3|10)\b|\b5\.2\.1\b|does not exist|no such user|user unknown|unknown user|mailbox unavailable|invalid recipient|recipient address rejected/i
    .test(message || '');
}

function getSuppressionSet() {
  const raw = process.env.EMAIL_SUPPRESSION_LIST || '';
  return new Set(
    raw
      .split(',')
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean)
  );
}

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function htmlToText(html) {
  return String(html || '')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeBodyHtml(html) {
  const value = String(html || '').trim();
  if (!value) return '';

  const bodyMatch = value.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
  return bodyMatch ? bodyMatch[1].trim() : value;
}

function buildDripLoveHtml({ subject, htmlContent }) {
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
}

function sanitizeRecipients(recipients) {
  const suppression = getSuppressionSet();
  const seen = new Set();
  const accepted = [];
  const rejected = [];

  for (const raw of recipients || []) {
    const email = String(raw || '').trim().toLowerCase();
    if (!email) continue;

    if (seen.has(email)) continue;
    seen.add(email);

    if (!isValidEmail(email)) {
      rejected.push({ email, error: 'Invalid email format' });
      continue;
    }

    if (suppression.has(email)) {
      rejected.push({ email, error: 'Suppressed recipient' });
      continue;
    }

    accepted.push(email);
  }

  return { accepted, rejected };
}

// Tries the primary account first, then each backup. A bad recipient address
// stops early - another account wouldn't change that.
async function sendEmailSafely({ to, subject, html, text }) {
  const errors = [];
  for (const account of getAccounts()) {
    try {
      return await account.transporter.sendMail({
        from: account.fromName ? `${account.fromName} <${account.user}>` : account.user,
        to,
        subject,
        html,
        text: text || htmlToText(html),
        headers: {
          'List-Unsubscribe': '<https://driplove.love/unsubscribe>',
          'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
          'X-Priority': '3',
        },
        envelope: process.env.SMTP_ENVELOPE_FROM && process.env.SMTP_ENVELOPE_FROM === account.user
          ? { from: process.env.SMTP_ENVELOPE_FROM, to: [to] }
          : undefined,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown SMTP error';
      errors.push(`${account.user}: ${message}`);
      if (isRecipientInvalid(message)) break;
    }
  }
  throw new Error(`Every sending account failed - ${errors.join(' | ')}`);
}

async function sendBulkEmails({ recipients, subject, htmlContent, textContent }) {
  const batchSize = Number(process.env.EMAIL_BATCH_SIZE || DEFAULT_BATCH_SIZE);
  const batchDelayMs = Number(process.env.EMAIL_BATCH_DELAY_MS || DEFAULT_BATCH_DELAY_MS);
  const brandedHtml = buildDripLoveHtml({ subject, htmlContent });
  const brandedText = textContent || htmlToText(normalizeBodyHtml(htmlContent));

  const { accepted, rejected } = sanitizeRecipients(recipients);
  const successful = [];
  const successfulMeta = [];
  const failed = [...rejected];

  for (let i = 0; i < accepted.length; i += batchSize) {
    const batch = accepted.slice(i, i + batchSize);

    const results = await Promise.allSettled(
      batch.map((to) =>
        sendEmailSafely({
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
        const info = result.value || {};
        successfulMeta.push({
          email,
          messageId: info.messageId || null,
          response: info.response || null,
          accepted: Array.isArray(info.accepted) ? info.accepted : [],
          rejected: Array.isArray(info.rejected) ? info.rejected : [],
        });
      } else {
        failed.push({
          email,
          error: result.reason instanceof Error ? result.reason.message : 'Unknown SMTP error',
        });
      }
    });

    if (i + batchSize < accepted.length && batchDelayMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, batchDelayMs));
    }
  }

  return {
    sent: successful.length,
    failed: failed.length,
    details: {
      successful,
      successfulMeta,
      failed,
    },
  };
}

module.exports = {
  sendBulkEmails,
  getAccounts,
};
