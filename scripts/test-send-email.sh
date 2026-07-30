#!/bin/bash

# Test email sending via new SMTP-first Node endpoint

echo "📧 Sending test email via SMTP endpoint..."
echo ""

EMAIL_SERVICE_URL=$(grep VITE_EMAIL_SERVICE_URL .env.local 2>/dev/null | cut -d '=' -f2 | tr -d '"' | tr -d "'")
EMAIL_SERVICE_API_KEY=$(grep VITE_EMAIL_SERVICE_API_KEY .env.local 2>/dev/null | cut -d '=' -f2 | tr -d '"' | tr -d "'")

if [ -z "$EMAIL_SERVICE_URL" ]; then
  EMAIL_SERVICE_URL=$(grep VITE_EMAIL_SERVICE_URL .env 2>/dev/null | cut -d '=' -f2 | tr -d '"' | tr -d "'")
  EMAIL_SERVICE_API_KEY=$(grep VITE_EMAIL_SERVICE_API_KEY .env 2>/dev/null | cut -d '=' -f2 | tr -d '"' | tr -d "'")
fi

if [ -z "$EMAIL_SERVICE_URL" ]; then
  EMAIL_SERVICE_URL="http://localhost:3001"
fi

if [ -z "$EMAIL_SERVICE_API_KEY" ]; then
  EMAIL_SERVICE_API_KEY="YourSuperSecretKey"
fi

echo "Using SMTP service URL: $EMAIL_SERVICE_URL"
echo ""

# Create test email HTML
HTML_CONTENT='<!DOCTYPE html>
<html>
  <head>
    <style>
      body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
      .container { max-width: 600px; margin: 0 auto; padding: 20px; }
      .header { background-color: #8B5CF6; color: white; padding: 20px; text-align: center; border-radius: 8px 8px 0 0; }
      .content { padding: 30px; background-color: #f9f9f9; }
      .footer { padding: 20px; text-align: center; color: #666; font-size: 12px; background-color: #f0f0f0; border-radius: 0 0 8px 8px; }
      .button { display: inline-block; padding: 12px 24px; background-color: #8B5CF6; color: white; text-decoration: none; border-radius: 6px; margin: 20px 0; }
    </style>
  </head>
  <body>
    <div class="container">
      <div class="header">
        <h1>💕 DripLove</h1>
      </div>
      <div class="content">
        <h2>Test Email - Email Broadcasting Works!</h2>
        <p>Hi there! 👋</p>
        <p>This is a test email from your DripLove email broadcasting system.</p>
        <p>If you are seeing this, it means:</p>
        <ul>
          <li>✅ Your SMTP integration is working correctly</li>
          <li>✅ Emails are being delivered to real inboxes</li>
          <li>✅ You can now send broadcasts to your users</li>
        </ul>
        <p>You can now send broadcasts through the new DripLove SMTP pathway.</p>
        <p style="margin-top: 30px;">
          <strong>Ready to send your first real broadcast?</strong><br>
          Go to Admin Panel → Broadcast Notifications → Emailing
        </p>
      </div>
      <div class="footer">
        <p>This email was sent from DripLove Dating</p>
        <p>© 2026 DripLove. All rights reserved.</p>
        <p style="margin-top: 10px; color: #999; font-size: 10px;">
          Test sent at: '"$(date)"'
        </p>
      </div>
    </div>
  </body>
</html>'

# Send the test email
curl -i --location --request POST "${EMAIL_SERVICE_URL}/api/email/send-broadcast-email-smtp" \
  --header "x-email-api-key: ${EMAIL_SERVICE_API_KEY}" \
  --header 'Content-Type: application/json' \
  --data "{
    \"recipients\": [\"bondahdean@gmail.com\"],
    \"subject\": \"✅ Test Email - DripLove Broadcasting Works!\",
    \"htmlContent\": $(echo "$HTML_CONTENT" | jq -Rs .),
    \"textContent\": \"Test Email from DripLove\\n\\nThis is a test email to verify your email broadcasting system is working correctly.\\n\\nIf you see this, everything is set up properly!\\n\\nYou can now send broadcasts to your users.\"
  }"

echo ""
echo ""
echo "✅ Test email sent!"
echo "📬 Check bondahdean@gmail.com inbox (also check spam folder)"
