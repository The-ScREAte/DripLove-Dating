#!/bin/bash

# Setup script for SMTP + Supabase email broadcasting
# This configures the Supabase Edge Function to forward to the Node SMTP service

# Colors
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

echo ""
echo -e "${BLUE}╔════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║   DripLove Email Broadcasting Setup           ║${NC}"
echo -e "${BLUE}╚════════════════════════════════════════════════╝${NC}"
echo ""

# Check if supabase CLI is installed
if ! command -v supabase &> /dev/null; then
    echo -e "${RED}❌ Supabase CLI not found${NC}"
    echo "Install it with: npm install -g supabase"
    exit 1
fi

echo -e "${GREEN}✓ Supabase CLI found${NC}"
echo ""

# Step 1: Configure Node SMTP API URL
echo -e "${BLUE}Step 1: Set SMTP Service URL${NC}"
echo "--------------------------------------"
echo "Use the URL where your Node SMTP service is running."
echo "Examples:"
echo "  - Local: http://localhost:3001"
echo "  - Production: https://api.driplove.love"
echo ""
read -p "Enter SMTP service URL [http://localhost:3001]: " EMAIL_SERVICE_URL
EMAIL_SERVICE_URL=${EMAIL_SERVICE_URL:-http://localhost:3001}

if [[ ! $EMAIL_SERVICE_URL == http*://* ]]; then
    echo -e "${RED}❌ Invalid URL. Must start with http:// or https://${NC}"
    exit 1
fi

echo -e "${GREEN}✓ Using SMTP service URL: ${EMAIL_SERVICE_URL}${NC}"
echo ""

# Step 2: Set API key used by SMTP service
echo -e "${BLUE}Step 2: Set SMTP Service API Key${NC}"
echo "--------------------------------------"
echo ""
read -p "Enter SMTP service API key: " EMAIL_SERVICE_API_KEY

if [[ -z $EMAIL_SERVICE_API_KEY ]]; then
    echo -e "${RED}❌ API key cannot be empty${NC}"
    exit 1
fi

echo -e "${GREEN}✓ API key captured${NC}"
echo ""

# Step 3: Set secrets
echo -e "${BLUE}Step 3: Configuring Supabase Secrets${NC}"
echo "--------------------------------------"

echo "Setting EMAIL_SERVICE_URL..."
supabase secrets set EMAIL_SERVICE_URL="$EMAIL_SERVICE_URL"

if [ $? -eq 0 ]; then
    echo -e "${GREEN}✓ EMAIL_SERVICE_URL configured${NC}"
else
    echo -e "${RED}❌ Failed to set EMAIL_SERVICE_URL${NC}"
    exit 1
fi

echo "Setting EMAIL_SERVICE_API_KEY..."
supabase secrets set EMAIL_SERVICE_API_KEY="$EMAIL_SERVICE_API_KEY"

if [ $? -eq 0 ]; then
    echo -e "${GREEN}✓ EMAIL_SERVICE_API_KEY configured${NC}"
else
    echo -e "${RED}❌ Failed to set EMAIL_SERVICE_API_KEY${NC}"
    exit 1
fi

echo ""

# Step 4: Deploy function
echo -e "${BLUE}Step 4: Deploying Edge Function${NC}"
echo "--------------------------------------"

supabase functions deploy send-broadcast-email

if [ $? -eq 0 ]; then
    echo -e "${GREEN}✓ Function deployed successfully${NC}"
else
    echo -e "${RED}❌ Function deployment failed${NC}"
    exit 1
fi

echo ""
echo -e "${GREEN}╔════════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║          Setup Complete! 🎉                     ║${NC}"
echo -e "${GREEN}╚════════════════════════════════════════════════╝${NC}"
echo ""
echo "Next steps:"
echo ""
echo "1. Open your app's Admin Panel"
echo "2. Go to Broadcast Notifications → Emailing tab"
echo "3. Select a test user"
echo "4. Write a test email"
echo "5. Click 'Send Emails'"
echo "6. Check your inbox! 📧"
echo ""
echo -e "${YELLOW}To view logs in real-time:${NC}"
echo "  supabase functions logs send-broadcast-email --follow"
echo ""
echo -e "${YELLOW}Important:${NC}"
echo "  Ensure your Node SMTP service is running and reachable from Supabase."
echo "  The send-broadcast-email function now uses SMTP integration only."
echo ""
echo -e "${YELLOW}Required for full visual consistency (Auth emails):${NC}"
echo "  1. Open Supabase Dashboard -> Authentication -> Emails"
echo "  2. Configure Custom SMTP to use the same sender domain"
echo "  3. Paste matching templates from: supabase/AUTH_EMAIL_TEMPLATES.md"
echo "  4. Save templates for: Confirm signup, Magic Link, Change Email, Reset Password"
echo "  5. Test sign-up and forgot-password emails to confirm the same DripLove look"
echo ""
