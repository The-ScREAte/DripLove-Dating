const crypto = require('crypto');
const express = require('express');
const { sendBulkEmails } = require('../utils/emailHelper');

const router = express.Router();

function isAuthorized(req) {
  const configuredKey = process.env.EMAIL_SERVICE_API_KEY;
  if (!configuredKey) return false;

  const headerKey = req.header('x-email-api-key') || '';
  const a = Buffer.from(headerKey);
  const b = Buffer.from(configuredKey);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

router.post('/send-broadcast-email-smtp', async (req, res) => {
  if (!isAuthorized(req)) {
    return res.status(401).json({ error: 'Unauthorized SMTP email request' });
  }

  const { recipients, subject, htmlContent, textContent } = req.body || {};

  if (!Array.isArray(recipients) || recipients.length === 0) {
    return res.status(400).json({ error: 'No recipients provided' });
  }

  const MAX_RECIPIENTS = Number(process.env.EMAIL_MAX_RECIPIENTS || 500);
  if (recipients.length > MAX_RECIPIENTS) {
    return res.status(400).json({ error: 'Too many recipients' });
  }

  if (typeof subject !== 'string' || /[\r\n]/.test(subject) || subject.length > 300) {
    return res.status(400).json({ error: 'Invalid subject' });
  }

  if (!subject || !htmlContent) {
    return res.status(400).json({ error: 'Subject and htmlContent are required' });
  }

  try {
    const results = await sendBulkEmails({
      recipients,
      subject,
      htmlContent,
      textContent,
    });

    return res.status(200).json({
      success: true,
      provider: 'smtp-nodemailer',
      results,
    });
  } catch (error) {
    console.error('[SMTP Email] send error:', error);
    return res.status(500).json({
      error: 'SMTP email send failed',
    });
  }
});

module.exports = router;
