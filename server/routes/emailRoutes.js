const express = require('express');
const { sendBulkEmails } = require('../utils/emailHelper');

const router = express.Router();

function isAuthorized(req) {
  const configuredKey = process.env.EMAIL_SERVICE_API_KEY;
  if (!configuredKey) return false;

  const headerKey = req.header('x-email-api-key') || '';
  return headerKey === configuredKey;
}

router.post('/send-broadcast-email-smtp', async (req, res) => {
  if (!isAuthorized(req)) {
    return res.status(401).json({ error: 'Unauthorized SMTP email request' });
  }

  const { recipients, subject, htmlContent, textContent } = req.body || {};

  if (!Array.isArray(recipients) || recipients.length === 0) {
    return res.status(400).json({ error: 'No recipients provided' });
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
      error: error instanceof Error ? error.message : 'SMTP email send failed',
    });
  }
});

module.exports = router;
